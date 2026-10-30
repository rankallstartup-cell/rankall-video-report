import { NextRequest, NextResponse } from 'next/server';
import { cronAuthFailure } from '@/lib/cronAuth';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// The hardcoded x-cron-secret value this route used is in the repo (and in
// client bundles); Vercel Cron sends Bearer ${CRON_SECRET}, so it never ran.
export async function GET(req: NextRequest) {
  const authFail = cronAuthFailure(req);
  if (authFail) return authFail;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const summary: Record<string, unknown> = { dailyReset: false, monthlyReset: false, flagged: [] as string[] };

  // Always reset daily counters.
  const { error: dailyErr } = await supabase.rpc('reset_daily_sent_counts');
  summary.dailyReset = !dailyErr;
  if (dailyErr) summary.dailyError = dailyErr.message;

  // On the 1st of the month, also reset monthly counters.
  if (new Date().getUTCDate() === 1) {
    const { error: monthlyErr } = await supabase.rpc('reset_monthly_sent_counts');
    summary.monthlyReset = !monthlyErr;
    if (monthlyErr) summary.monthlyError = monthlyErr.message;
  }

  // Re-evaluate domain health and flag at-risk / paused domains.
  const flagged: string[] = [];
  try {
    const { data: domains } = await supabase
      .from('outreach_domain_health')
      .select('domain, status, bounce_rate, spam_complaint_count');

    for (const d of (domains ?? []) as Array<{ domain: string; status: string; bounce_rate: number; spam_complaint_count: number }>) {
      if (d.status === 'paused') continue;

      const bounce = Number(d.bounce_rate ?? 0);
      const spam = Number(d.spam_complaint_count ?? 0);

      if (bounce > 5 || spam > 0) {
        const reason = spam > 0 ? 'Spam complaint received' : `Bounce rate too high: ${bounce.toFixed(1)}%`;
        await supabase.from('outreach_domain_health')
          .update({ status: 'paused', paused_at: new Date().toISOString(), pause_reason: reason, updated_at: new Date().toISOString() })
          .eq('domain', d.domain);
        flagged.push(`${d.domain} → paused (${reason})`);
      } else if (bounce > 3) {
        await supabase.from('outreach_domain_health')
          .update({ status: 'at risk', updated_at: new Date().toISOString() })
          .eq('domain', d.domain);
        flagged.push(`${d.domain} → at risk (bounce ${bounce.toFixed(1)}%)`);
      }
    }
  } catch (e) {
    summary.flagError = String(e);
  }
  summary.flagged = flagged;

  return NextResponse.json({ ok: true, ...summary });
}
