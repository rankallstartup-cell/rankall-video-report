import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logCronRun } from '@/lib/cronRuns';
import { cronAuthFailure } from '@/lib/cronAuth';
import { emailDedupeKey, claimEmailSend, releaseEmailClaim } from '@/lib/emailDedupe';
import { escapeHtml } from '@/lib/escapeHtml';
import { shouldSkipEmail } from '@/lib/emailSuppression';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Score-decay alert — when a user's AI visibility score drops more than 5 points
// between their two most recent scans, email them to create urgency to re-engage
// and apply fixes. Uses the service-role client (admin.getUserById + RLS-free reads).
export async function GET(req: NextRequest) {
  // Bearer CRON_SECRET only, fail closed (lib/cronAuth).
  const authFail = cronAuthFailure(req);
  if (authFail) return authFail;
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ ok: true, message: 'RESEND_API_KEY not set' });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Pull recent scans and keep the two most recent per user to compute the delta.
  const { data: scans } = await supabase
    .from('rankall_scans')
    .select('id, user_id, overall_score, user_business_name, competitor_name, created_at')
    .not('user_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1000);

  if (!scans) return NextResponse.json({ ok: true, sent: 0 });

  // Group: first two rows per user (already newest-first).
  const byUser = new Map<string, Array<{ id: string; overall_score: number; competitor_name: string | null; created_at: string }>>();
  for (const s of scans) {
    const uid = s.user_id as string;
    const arr = byUser.get(uid) || [];
    // A scan without a stored score is skipped — `|| 0` turned it into a
    // fabricated drop to 0.
    if (typeof s.overall_score !== 'number') continue;
    if (arr.length < 2) {
      arr.push({ id: String(s.id), overall_score: s.overall_score, competitor_name: (s.competitor_name as string) || null, created_at: String(s.created_at) });
      byUser.set(uid, arr);
    }
  }

  const THRESHOLD = 5;
  let sent = 0;
  let failed = 0;
  for (const [uid, pair] of byUser) {
    if (pair.length < 2) continue;
    const current = pair[0].overall_score;
    const previous = pair[1].overall_score;
    const drop = previous - current;
    if (drop <= THRESHOLD) continue; // only alert on a >5 point drop
    if (sent >= 50) break; // per-run safety cap

    // ax74 DEDUP: one decay warning per scan. The old code re-sent the
    // same 'dropped N points' email every Wednesday while the drop
    // persisted (no new scan = same two rows = same email). A new scan
    // with a further drop gets a new warning — that is a new event.
    // ax74 residual: email_sequence_log has a UNIQUE index on
    // (user_id, trigger_event) — one row per (user, event). The old
    // code INSERTed one row per scan, so every warning after the
    // first violated the index, the error was swallowed by the
    // catch, the dedup row was never recorded, and the same warning
    // re-sent every week forever. The row now holds the LATEST
    // warned scan_id and is UPSERTed on (user_id, trigger_event),
    // which can never violate the index.
    // ax74 (final): the key carries the scan — `decay:<scan_id>` — so each
    // warned scan has its own row under the (user_id, trigger_event) unique
    // index, claimed BEFORE sending (see below).
    const decayKey = emailDedupeKey('decay', pair[0].id);
    const { data: warnRow } = await supabase.from('email_sequence_log')
      .select('id').eq('user_id', uid).eq('trigger_event', decayKey).maybeSingle();
    if (warnRow) continue;

    const { data: userData } = await supabase.auth.admin.getUserById(uid);
    const email = userData?.user?.email;
    if (!email) continue;
    const firstName = (userData?.user?.user_metadata?.full_name as string)?.split(' ')[0] || email.split('@')[0];

    // Competitor gap, if we have a competitor score on record.
    // ax74: the competitor score lives in competitor_scans (written by
    // /api/competitor-scan). score_history.competitor_score is always
    // NULL (the scan route writes null there), so the old lookup never
    // produced a competitor line.
    const competitorName = pair[0].competitor_name;
    let competitorLine = '';
    if (competitorName) {
      const { data: sh } = await supabase
        .from('competitor_scans')
        .select('competitor_score')
        .eq('user_id', uid)
        .eq('competitor_name', competitorName)
        .order('scanned_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const compScore = Number(sh?.competitor_score) || 0;
      const ahead = compScore - current;
      if (ahead > 0) {
        competitorLine = `<p style="color:#334155;font-size:15px;line-height:1.7;margin:0 0 16px;"><strong>${competitorName}</strong> is now ${ahead} point${ahead === 1 ? '' : 's'} ahead of you on ChatGPT.</p>`;
      }
    }

    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#ffffff;">
  <h2 style="color:#DC2626;font-size:20px;margin:0 0 16px;">⚠️ Your AI visibility dropped ${drop} points since your previous scan</h2>
  <p style="color:#334155;font-size:15px;line-height:1.7;margin:0 0 16px;">Hi ${escapeHtml(firstName)},</p>
  <p style="color:#334155;font-size:15px;line-height:1.7;margin:0 0 16px;">Your AI Visibility Score dropped from <strong>${previous}</strong> to <strong>${current}</strong> between your last two scans.</p>
  ${competitorLine}
  <p style="color:#334155;font-size:15px;line-height:1.7;margin:0 0 20px;">Here's what you can do:</p>
  <a href="https://www.rankall.io/dashboard/fix" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;padding:13px 28px;font-weight:700;font-size:14px;">View your fixes →</a>
  <p style="color:#94a3b8;font-size:13px;margin:20px 0 0;">— Nandish at Rankall.io</p>
</div>`;

    // ax74: a failed Resend send is NOT swallowed (.catch(()=>{})) and
    // NOT marked sent — the dedup row is written only on success, so
    // the next run retries the failed send instead of losing it.
    // CAN-SPAM: never mail an unsubscribed / bounced address, nor a user who
    // turned "Competitor alerts" off in Settings (lib/emailSuppression).
    if (await shouldSkipEmail({ email, userId: uid }, 'competitor_alerts')) continue;
    const claim = await claimEmailSend(supabase, { userId: uid, email, triggerEvent: decayKey, scanId: pair[0].id });
    if (claim === 'duplicate') continue;
    if (claim === 'error') { failed++; continue; }
    let sendOk = false;
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Nandish at Rankall <nandish@rankall.io>',
          to: email,
          subject: `⚠️ Your AI visibility dropped ${drop} points since your previous scan`,
          html,
        }),
      });
      sendOk = res.ok;
      if (!sendOk) console.error('[score-decay-warning] Resend failed:', uid, await res.text().catch(() => ''));
    } catch (e) {
      console.error('[score-decay-warning] Resend error:', uid, e);
    }
    if (!sendOk) { failed++; await releaseEmailClaim(supabase, uid, decayKey); continue; }
    sent++;
  }

  await logCronRun(supabase, { job: 'score-decay-warning', status: failed > 0 ? (sent > 0 ? 'partial' : 'failed') : 'ok', sent, failed });
  return NextResponse.json({ ok: true, sent, failed });
}
