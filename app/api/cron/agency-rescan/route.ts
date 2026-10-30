import { NextRequest, NextResponse } from 'next/server';
import { cronAuthFailure } from '@/lib/cronAuth';
import { createClient } from '@supabase/supabase-js';
import { clearExpiredCache } from '@/lib/scanCache';
import { escapeHtml } from '@/lib/escapeHtml';
import { shouldSkipEmail, type EmailPreference } from '@/lib/emailSuppression';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

let _sb: ReturnType<typeof createClient> | null = null;
function getSb() {
  if (!_sb) _sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  return _sb;
}

async function sendEmail(to: string, subject: string, html: string, ownerUserId: string, pref: EmailPreference) {
  if (!process.env.RESEND_API_KEY) return;
  // CAN-SPAM: never mail an unsubscribed / bounced address, nor an agency
  // owner who turned this category off in Settings (lib/emailSuppression).
  if (await shouldSkipEmail({ email: to, userId: ownerUserId }, pref)) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Rankall Alerts <alerts@rankall.io>',
      to: [to],
      subject,
      html,
    }),
  });
}

async function sendSlack(message: string) {
  if (!process.env.SLACK_WEBHOOK_URL) return;
  await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message }),
  });
}

// F2: Determine a brief likely-cause line for a score drop. Uses a short Haiku
// call when ANTHROPIC_API_KEY is set; otherwise falls back to a simple heuristic.
// Never throws — returns a heuristic string on any failure.
async function likelyCause(name: string, prevScore: number, currentScore: number): Promise<string> {
  const drop = prevScore - currentScore;
  const heuristic = drop >= 15
    ? 'Large drop — likely a competitor surged in AI recommendations or key citations/listings went stale.'
    : 'Moderate drop — likely fewer AI platforms mentioned this business this week, or trust signals weakened.';

  if (!process.env.ANTHROPIC_API_KEY) return heuristic;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 120,
        messages: [{
          role: 'user',
          content: `A local business "${name}" had its AI visibility score drop from ${prevScore} to ${currentScore} (out of 100) in one week. In ONE concise sentence, state the most likely cause of this drop. No preamble.`,
        }],
      }),
    });
    if (!res.ok) return heuristic;
    const json = await res.json() as { content?: { text?: string }[] };
    const text = json.content?.[0]?.text?.trim();
    return text || heuristic;
  } catch {
    return heuristic;
  }
}

// GET|POST /api/cron/agency-rescan
// Rescans all active agency clients. Schedule: Monday 9am UTC (vercel.json).
// ax6t: Vercel Cron sends GET with Authorization: Bearer ${CRON_SECRET}; the
// route was POST-only and checked a hardcoded x-cron-secret value, so the
// cron never ran. Now GET (+POST) with Bearer only, failing closed.
export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(req: NextRequest) {
  const authFail = cronAuthFailure(req);
  if (authFail) return authFail;

  await clearExpiredCache();
  console.log('Expired scan cache cleared');

  const sb = getSb();
  const BASE = process.env.NEXT_PUBLIC_BASE_URL || 'https://rankall.io';

  // Fetch all distinct agency user IDs
  const { data: agencyRows } = await sb
    .from('agency_clients')
    .select('agency_user_id')
    .eq('status', 'active');

  const agencyIds = [...new Set((agencyRows ?? []).map((r: { agency_user_id: string }) => r.agency_user_id))];

  if (!agencyIds.length) return NextResponse.json({ success: true, rescanned: 0 });

  const allResults: { id: string; name: string; status: string; agencyId: string }[] = [];

  for (const agencyId of agencyIds) {
    // Fetch clients for this agency
    const { data: clientsRaw } = await sb
      .from('agency_clients')
      .select('id, agency_user_id, business_name, query, country_code, latest_scan_id')
      .eq('agency_user_id', agencyId)
      .eq('status', 'active')
      .not('query', 'is', null);

    const clients = clientsRaw as Array<{
      id: string;
      agency_user_id: string;
      business_name: string;
      query: string;
      country_code: string | null;
      latest_scan_id: string | null;
    }> | null;

    if (!clients?.length) continue;

    // Fetch agency owner email
    const { data: agencyUser } = await sb
      .from('profiles')
      .select('email, full_name')
      .eq('id', agencyId)
      .maybeSingle() as { data: { email: string; full_name?: string } | null };

    const agencyEmail = agencyUser?.email;

    // Track weekly summary stats
    let improved = 0;
    let needsAttention = 0;
    let totalScore = 0;
    let scoredCount = 0;
    let topClient = '';
    let topScore = 0;
    let worstClient = '';
    let worstScore = 101;
    const droppedClients: { name: string; drop: number; currentScore: number; prevScore: number; scanId: string }[] = [];

    for (const client of clients) {
      try {
        // Previous score from the client's latest scan, if measured. The
        // old code selected a nonexistent `score` column and defaulted to 0.
        let prevScore: number | null = null;
        if (client.latest_scan_id) {
          const { data: prevScanRaw } = await sb
            .from('rankall_scans')
            .select('id, overall_score, created_at')
            .eq('id', client.latest_scan_id)
            .maybeSingle();
          const prevScan = prevScanRaw as { id: string; overall_score?: number | null; created_at?: string } | null;
          prevScore = typeof prevScan?.overall_score === 'number' ? prevScan.overall_score : null;
        }

        // Run rescan
        // Server-to-server as the AGENCY: CRON_SECRET bearer + the agency's
        // userId, so the rescan is owned by the agency (private, counted on
        // their plan) instead of an anonymous, publicly readable scan that
        // also hits the anonymous rate limit.
        const res = await fetch(`${BASE}/api/scan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
          // /api/scan reads `input` and returns `scanId` / `overallScore`;
          // the old `query` / `scan_id` / `score` names never matched, so no
          // client was ever updated.
          body: JSON.stringify({
            input: client.query,
            country_code: client.country_code || 'US',
            userId: client.agency_user_id,
          }),
        });
        const raw = await res.json().catch(() => ({})) as { scanId?: string; overallScore?: number };
        const data = { scan_id: raw.scanId, score: raw.overallScore };

        if (data.scan_id && typeof data.score === 'number') {
          const currentScore = data.score;

          // Update last_scanned_at and latest_scan_id
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (sb.from('agency_clients') as any)
            .update({
              latest_scan_id: data.scan_id,
              last_scanned_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', client.id);

          // KP history tracking
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: newScan } = await (sb.from('rankall_scans') as any)
              .select('id, knowledge_panel_data')
              .eq('id', data.scan_id)
              .maybeSingle() as { data: { id: string; knowledge_panel_data: unknown } | null };
            if (newScan?.knowledge_panel_data) {
              const kpData = newScan.knowledge_panel_data as { exists?: boolean; claimed?: boolean; completeness?: number };
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (sb.from('knowledge_panel_history') as any).insert({
                user_id: client.agency_user_id,
                scan_id: newScan.id,
                exists: kpData.exists ?? false,
                claimed: kpData.claimed ?? false,
                completeness: kpData.completeness ?? 0,
              });
            }
          } catch { /* non-fatal */ }

          // Score tracking
          totalScore += currentScore;
          scoredCount++;
          if (currentScore > topScore) {
            topScore = currentScore;
            topClient = client.business_name;
          }
          if (currentScore < worstScore) {
            worstScore = currentScore;
            worstClient = client.business_name;
          }

          const drop = prevScore != null ? prevScore - currentScore : 0;
          if (prevScore != null && drop >= 5) {
            droppedClients.push({
              name: client.business_name,
              drop,
              currentScore,
              prevScore,
              scanId: data.scan_id,
            });
            needsAttention++;

            // F2: Instant score-drop alert (email + Slack) with likely cause + action.
            const cause = await likelyCause(client.business_name, prevScore, currentScore);
            if (agencyEmail) {
              const alertHtml = `<h2>&#9888;&#65039; Score Alert: ${escapeHtml(client.business_name)} dropped ${drop} points</h2>
<p><strong>${prevScore}/100 &rarr; ${currentScore}/100</strong> (down ${drop} pts this week)</p>
<p><strong>Likely cause:</strong> ${escapeHtml(cause)}</p>
<p><strong>Suggested action:</strong> Review the latest report, re-run a fresh scan to confirm, and prioritise the top fixes for this client.</p>
<p>
  <a href="${BASE}/report/${data.scan_id}">View their report &rarr;</a> &nbsp;|&nbsp;
  <a href="${BASE}/dashboard/agency">Open Agency Dashboard &rarr;</a>
</p>`;
              await sendEmail(agencyEmail, `⚠️ Score Alert: ${client.business_name} dropped ${drop} points`, alertHtml, client.agency_user_id, 'competitor_alerts');
            }

            await sendSlack(`⚠️ Score Alert: ${client.business_name} dropped ${drop} points (${prevScore} → ${currentScore}/100). Likely cause: ${cause}. Report: ${BASE}/report/${data.scan_id}`);
          } else if (prevScore != null && currentScore > prevScore) {
            improved++;
          }

          allResults.push({ id: client.id, name: client.business_name, status: 'rescanned', agencyId });
        } else {
          allResults.push({ id: client.id, name: client.business_name, status: 'scan_failed', agencyId });
        }
      } catch {
        allResults.push({ id: client.id, name: client.business_name, status: 'error', agencyId });
      }
    }

    // F1: Weekly summary email to agency owner
    if (agencyEmail && clients.length > 0) {
      const avgScore = scoredCount > 0 ? Math.round(totalScore / scoredCount) : 0;
      const droppedSection = droppedClients.length > 0
        ? `<h3>&#128680; Dropped 5+ points this week</h3><ul>${droppedClients.map(c => `<li><strong>${c.name}</strong> — dropped ${c.drop} pts (${c.prevScore} &rarr; ${c.currentScore}/100) &middot; <a href="${BASE}/report/${c.scanId}">View report</a></li>`).join('')}</ul>`
        : '<p>&#9989; No clients dropped 5+ points this week.</p>';

      const summaryHtml = `<h2>Your Agency Weekly Report</h2>
<p><strong>Total clients:</strong> ${clients.length}</p>
<p><strong>Average score:</strong> ${avgScore}/100</p>
<p>&#8593; <strong>Improved this week:</strong> ${improved}</p>
<p>&#9888;&#65039; <strong>Need attention:</strong> ${needsAttention}</p>
<hr/>
<p>&#127942; <strong>Top performer:</strong> ${topClient || 'N/A'}${topClient ? ` (${topScore}/100)` : ''}</p>
<p>&#129657; <strong>Needs help:</strong> ${worstClient || 'N/A'}${worstClient ? ` (${worstScore}/100)` : ''}</p>
${droppedSection}
<hr/>
<p>
  <a href="${BASE}/dashboard/agency">View Agency Dashboard &rarr;</a> &nbsp;|&nbsp;
  <a href="${BASE}/dashboard/agency?action=generate-reports">Generate All Reports &rarr;</a>
</p>`;

      await sendEmail(agencyEmail, `Your Agency Weekly Report — ${clients.length} clients updated`, summaryHtml, agencyId, 'weekly_report');
    }
  }

  return NextResponse.json({
    success: true,
    rescanned: allResults.filter(r => r.status === 'rescanned').length,
    total: allResults.length,
    results: allResults,
  });
}
