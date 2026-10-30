import { NextRequest, NextResponse } from 'next/server';
import { cronAuthFailure } from '@/lib/cronAuth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { logCronRun } from '@/lib/cronRuns';
import { selectDueFixes, type AppliedFixRow, type ScheduleRow } from '@/lib/rescanSchedule';
import { shouldSkipEmail } from '@/lib/emailSuppression';

// ax72 residual: this cron runs with NO user session, so it must use
// the service-role client (bypasses RLS). The anon client it used
// before reads as the anon role under RLS, so the fix_predictions /
// rankall_scans selects returned nothing and the cron reported "No
// rescans due" even when verification rescans were due — verification
// never fired. Same pattern as rescan-weekly (the route this calls).
const supabase = getSupabaseAdmin();

const RESEND_API_KEY = process.env.RESEND_API_KEY;

// Loads schedule rows for the scans with applied fixes. Degrades safely when
// migration 20261016000700_scheduled_rescans_per_fix is not applied: the select
// without fix_type/completed_at returns legacy rows, matched to fixes by time.
async function loadSchedules(scanIds: string[]): Promise<{ rows: ScheduleRow[]; hasPerFixColumns: boolean }> {
  if (scanIds.length === 0) return { rows: [], hasPerFixColumns: true };
  const full = await supabase
    .from('scheduled_rescans')
    .select('id, scan_id, fix_type, scheduled_for, completed, completed_at, created_at')
    .in('scan_id', scanIds);
  if (!full.error) return { rows: (full.data ?? []) as ScheduleRow[], hasPerFixColumns: true };
  console.error('[trigger-rescans] per-fix schedule columns unavailable, using legacy rows:', full.error.message);
  const legacy = await supabase
    .from('scheduled_rescans')
    .select('id, scan_id, scheduled_for, completed, created_at')
    .in('scan_id', scanIds);
  if (legacy.error) console.error('[trigger-rescans] scheduled_rescans lookup failed (7-day fallback):', legacy.error.message);
  return { rows: (legacy.data ?? []) as ScheduleRow[], hasPerFixColumns: false };
}

// b877: a fix verified through the no-row fallback had nothing to mark
// completed, so it re-fired (paid rescan + email) every day. After a
// successful rescan, record a completed row for each such fix; the next
// run sees it and the fallback stays quiet.
async function recordFallbackRescans(scanId: string, userId: string | null, fixTypes: string[], hasPerFixColumns: boolean): Promise<void> {
  if (fixTypes.length === 0) return;
  const now = new Date().toISOString();
  const rows = hasPerFixColumns
    ? fixTypes.map(fix_type => ({ user_id: userId, scan_id: scanId, fix_type, scheduled_for: now, completed: true, completed_at: now, created_at: now }))
    : [{ user_id: userId, scan_id: scanId, scheduled_for: now, completed: true, created_at: now }];
  const { error } = await supabase.from('scheduled_rescans').insert(rows);
  if (error) console.error('[trigger-rescans] failed to record fallback rescan:', error.message);
}

// Marks the schedule rows a successful rescan fulfilled, so they never fire again.
async function markSchedulesCompleted(ids: string[], hasPerFixColumns: boolean): Promise<void> {
  if (ids.length === 0) return;
  const update: Record<string, unknown> = { completed: true };
  if (hasPerFixColumns) update.completed_at = new Date().toISOString();
  const { error } = await supabase.from('scheduled_rescans').update(update).in('id', ids);
  if (error) console.error('[trigger-rescans] failed to mark schedules completed:', error.message);
}

export async function GET(req: NextRequest) {
  try {
    // Vercel Cron sends GET with Authorization: Bearer <CRON_SECRET>. Fail
    // CLOSED when the secret is unset (the old `if (cronSecret && ...)` let
    // anyone trigger paid rescans when it was missing); the x-vercel-cron
    // header is spoofable and is not accepted as auth.
    // Shared constant-time check (lib/cronAuth): 500 unset / 401 mismatch.
    const denied = cronAuthFailure(req);
    if (denied) return denied;

    console.log(`[trigger-rescans] invoked at ${new Date().toISOString()}`);

    // ax72: per-FIX verification schedule. Each applied fix has its own
    // scheduled_rescans row (fix_type + the delay the user picked). A fix is
    // due when ITS row's date has passed (lib/rescanSchedule.selectDueFixes);
    // the rescan verifies only those fixes and their rows are marked
    // completed afterwards. The old per-scan rows.some(...) let a 7-day row
    // verify a 90-day fix on the same scan, and rows never completed.
    // 'applied' is the complete selector: rescan-weekly moves rows to 'verified'
    // after their verification cycle (or 'verification_error' after 2 failures),
    // so verified/errored rows are never re-picked.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: dueFixes, error } = await supabase
      .from('fix_predictions')
      .select('scan_id, fix_type, applied_at')
      .eq('status', 'applied')
      .not('scan_id', 'is', null);

    if (error) {
      console.error('trigger-rescans query error:', error);
      await logCronRun(supabase, { job: 'trigger-rescans', status: 'failed', error: `fix_predictions query: ${error.message}` });
      return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
    }

    if (!dueFixes || dueFixes.length === 0) {
      return NextResponse.json({ success: true, triggered: 0, message: 'No rescans due' });
    }

    const appliedRows = (dueFixes as AppliedFixRow[]).filter(f => f.scan_id && f.fix_type);
    const scanIdsWithApplied = [...new Set(appliedRows.map(f => f.scan_id))];
    const schedules = await loadSchedules(scanIdsWithApplied);
    const dueScans = selectDueFixes(appliedRows, schedules.rows, Date.now());
    const dueByScan = new Map(dueScans.map(d => [d.scanId, d]));
    const uniqueScanIds = dueScans.map(d => d.scanId);

    if (uniqueScanIds.length === 0) {
      return NextResponse.json({ success: true, triggered: 0, message: 'No rescans due' });
    }

    // Fetch user_id for each scan
    const { data: scans } = await supabase
      .from('rankall_scans')
      .select('id, user_id')
      .in('id', uniqueScanIds)
      .not('user_id', 'is', null);

    if (!scans || scans.length === 0) {
      return NextResponse.json({ success: true, triggered: 0, message: 'No scans with user_id found' });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rankall.io';

    // Trigger rescan for each unique scan — fire and collect results
    const results = await Promise.allSettled(
      scans.map(async (scan: any) => {
        const res = await fetch(`${baseUrl}/api/rescan-weekly`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.CRON_SECRET}`,
          },
          // Only the fixes whose own rows are due are verified by this rescan.
          body: JSON.stringify({ scan_id: scan.id, user_id: scan.user_id, fix_types: dueByScan.get(scan.id)?.fixTypes ?? [] }),
        });
        const data = await res.json().catch(() => ({}));
        // 207 = rescan saved + verification ran, only the email failed — the
        // schedule is still fulfilled (re-firing would rescan again).
        const fulfilled = res.ok || res.status === 207;
        if (fulfilled) {
          await markSchedulesCompleted(dueByScan.get(scan.id)?.scheduleIds ?? [], schedules.hasPerFixColumns);
          await recordFallbackRescans(scan.id, scan.user_id ?? null, dueByScan.get(scan.id)?.unscheduledFixTypes ?? [], schedules.hasPerFixColumns);
        }
        return { scan_id: scan.id, ok: res.ok, data };
      })
    );

    const triggered = results.filter((r: any) => r.status === 'fulfilled' && r.value?.ok).length;
    const failed    = results.filter((r: any) => r.status === 'rejected' || !r.value?.ok).length;

    const summary = results.map((r: any) => {
      if (r.status === 'fulfilled') return { scan_id: r.value?.scan_id, ok: r.value?.ok };
      return { scan_id: 'unknown', ok: false };
    });

    console.log(`[trigger-rescans] Triggered ${triggered}/${scans.length} rescans, ${failed} failed`);

    // ── Competitor auto-rescan ──────────────────────────────────────────
    let competitorRescanned = 0;
    try {
      // Same admin client as above — the old inline client silently
      // fell back to the anon key when the service key was missing,
      // which fails under RLS the same way the main queries did.
      const serviceSupabase = supabase;

      // Find the most recent competitor scan per user that is >= 7 days old
      const { data: staleCompetitors } = await serviceSupabase
        .from('competitor_scans')
        .select('id, user_id, scan_id, competitor_name, competitor_trust_score, scanned_at')
        .lte('scanned_at', sevenDaysAgo)
        .order('scanned_at', { ascending: false });

      // Same runaway shape as fix_predictions (fixed in rescan-weekly): the
      // rescan below INSERTS a fresh competitor_scans row but never touches the
      // stale row — so without this guard the same stale row is re-picked every
      // day (the fresh row is excluded by the <= 7d filter) and the user gets a
      // competitor rescan daily forever. Skip users who already have a fresh
      // scan: their weekly cadence resumes once that row ages past 7 days.
      const { data: freshCompetitors } = await serviceSupabase
        .from('competitor_scans')
        .select('user_id')
        .gt('scanned_at', sevenDaysAgo);
      const freshUserIds = new Set((freshCompetitors ?? []).map((r: any) => r.user_id as string));

      if (staleCompetitors?.length) {
        // Deduplicate: one rescan per user (most recent competitor)
        const byUser = new Map<string, typeof staleCompetitors[number]>();
        for (const row of staleCompetitors) {
          if (!byUser.has(row.user_id) && !freshUserIds.has(row.user_id)) byUser.set(row.user_id, row);
        }

        for (const entry of byUser.values()) {
          try {
            // Fetch the user's latest scan for context
            const { data: latestScan } = await serviceSupabase
              .from('rankall_scans')
              .select('id, input, user_business_name, industry, location, mentioned_count, trust_signals, citation_sources')
              .eq('user_id', entry.user_id)
              .order('created_at', { ascending: false })
              .limit(1)
              .single();

            // Fetch user email for alert
            const { data: userData } = await serviceSupabase
              .from('rankall_users')
              .select('email')
              .eq('id', entry.user_id)
              .single();

            const res = await fetch(`${baseUrl}/api/competitor-scan`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
              body: JSON.stringify({
                competitorName: entry.competitor_name,
                industry: latestScan?.industry,
                location: latestScan?.location,
                userBusinessInput: latestScan?.input,
                userTrustSignals: latestScan?.trust_signals,
                userCitationSources: latestScan?.citation_sources,
                userMentionedCount: latestScan?.mentioned_count,
                userId: entry.user_id,
                scanId: latestScan?.id,
              }),
            });

            if (res.ok) {
              const data = await res.json();
              const newTrust = data.competitor?.trustSignals?.overall ?? 0;
              const oldTrust = entry.competitor_trust_score;
              const delta = newTrust - oldTrust;
              competitorRescanned++;

              // Alert if trust score changed by > 5 points
              if (Math.abs(delta) > 5 && RESEND_API_KEY && userData?.email) {
                const direction = delta > 0 ? 'increased' : 'decreased';
                const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#F8FAFC;padding:40px 20px;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;border:1.5px solid #E2E8F0;">
  <p style="font-size:11px;font-weight:700;color:#2563EB;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 12px;">Competitor Alert</p>
  <h1 style="font-size:20px;font-weight:800;color:#0F172A;margin:0 0 12px;">${entry.competitor_name}'s AI trust score ${direction} by ${Math.abs(delta)} points</h1>
  <div style="display:flex;gap:16px;margin:20px 0;">
    <div style="flex:1;text-align:center;background:#F8FAFC;border-radius:10px;padding:14px;">
      <p style="font-size:28px;font-weight:900;color:#64748B;margin:0;">${oldTrust}</p>
      <p style="font-size:11px;color:#94A3B8;margin:4px 0 0;">Last week</p>
    </div>
    <div style="display:flex;align-items:center;font-size:20px;color:#2563EB;">→</div>
    <div style="flex:1;text-align:center;background:#F8FAFC;border-radius:10px;padding:14px;">
      <p style="font-size:28px;font-weight:900;color:${delta > 0 ? '#DC2626' : '#059669'};margin:0;">${newTrust}</p>
      <p style="font-size:11px;color:#94A3B8;margin:4px 0 0;">This week</p>
    </div>
  </div>
  <p style="font-size:13px;color:#64748B;line-height:1.6;margin:0 0 24px;">
    ${delta > 0
      ? `${entry.competitor_name} is pulling ahead. Check the gap and apply fixes to close it.`
      : `${entry.competitor_name} lost ground this week — a good time to push ahead.`}
  </p>
  <a href="https://rankall.io/dashboard/competitor" style="display:inline-block;background:#2563EB;border-radius:10px;padding:12px 24px;font-size:14px;font-weight:700;color:#fff;text-decoration:none;">View competitor intel →</a>
</div>
</body></html>`;

                // CAN-SPAM: never mail an unsubscribed / bounced address, nor a
                // user who turned "Competitor alerts" off in Settings.
                if (!(await shouldSkipEmail({ email: userData.email, userId: entry.user_id }, 'competitor_alerts'))) await fetch('https://api.resend.com/emails', {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    from: 'Rankall.io <hello@rankall.io>',
                    to: [userData.email],
                    subject: `${entry.competitor_name}'s score ${direction} by ${Math.abs(delta)} pts — competitor alert`,
                    html,
                  }),
                });
              }
            }
          } catch (compErr) {
            console.error('Competitor rescan error:', compErr);
          }
        }
      }
    } catch (compCronErr) {
      console.error('Competitor cron block error:', compCronErr);
    }

    console.log(`[trigger-rescans] Triggered ${triggered}/${scans.length} rescans, ${failed} failed`);

    // ax74: run outcome is logged — a failed run is visible in admin
    // health instead of only a console.error + 500.
    await logCronRun(supabase, { job: 'trigger-rescans', status: failed > 0 ? (triggered > 0 ? 'partial' : 'failed') : 'ok', sent: triggered, failed });
    return NextResponse.json({ success: true, triggered, failed, total: scans.length, competitorRescanned, summary });

  } catch (error) {
    console.error('trigger-rescans error:', error);
    await logCronRun(supabase, { job: 'trigger-rescans', status: 'failed', error: String(error).slice(0, 500) });
    return NextResponse.json({ error: 'Failed to trigger rescans' }, { status: 500 });
  }
}
