import { NextRequest, NextResponse } from 'next/server';
import { cronAuthFailure } from '@/lib/cronAuth';
import { createClient } from '@supabase/supabase-js';
import { runWeeklyReports } from '@/lib/weeklyReport';
import { logCronRun } from '@/lib/cronRuns';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Weekly AI Visibility Report — Monday 8am. Paid users only, summarizes existing
// scan data (no fresh rescan), skips dormant (no scan in 30 days) + unsubscribed.
export async function GET(req: NextRequest) {
  const authFail = cronAuthFailure(req);
  if (authFail) return authFail;

  console.log('[weeklyReport] starting…');
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // ax74: the run result (sent/skipped/errors) is now logged — before,
  // a failed Monday run was only a console.error + 500 nobody saw.
  try {
    const result = await runWeeklyReports(supabaseAdmin);
    console.log('[weeklyReport] complete:', result);
    await logCronRun(supabaseAdmin, { job: 'weekly-visibility-report', status: result.errors > 0 ? (result.sent > 0 ? 'partial' : 'failed') : 'ok', sent: result.sent, failed: result.errors });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('[weeklyReport] run failed:', e);
    await logCronRun(supabaseAdmin, { job: 'weekly-visibility-report', status: 'failed', error: String(e).slice(0, 500) });
    return NextResponse.json({ error: 'Weekly report run failed' }, { status: 500 });
  }
}
