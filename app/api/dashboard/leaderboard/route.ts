import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { cityTokenFrom, toLeaderboardRows, latestPerBusiness, type LeaderboardSourceRow } from '@/lib/leaderboardRows';
import { resolvePlanServer } from '@/lib/resolvePlanServer';
import { getPlanConfig } from '@/lib/planConfig';
import { canOpenDashboardPath } from '@/lib/dashboardAccess';

export const dynamic = 'force-dynamic';

// GET /api/dashboard/leaderboard?industry=dentist&location=Chicago%2C%20IL
// Cross-user ranking for the signed-in dashboard. Runs server-side with the
// service role because owner-only RLS (20261016000600_report_rls_lockdown) means a
// browser query can only ever see the viewer's own scans. Returns anonymised
// rows only — the response never contains other users' ids or names.
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Item 16: same gate as the leaderboard page (lib/dashboardAccess +
  // planConfig dashboardPages). Fails closed if the plan can't be resolved.
  try {
    const { plan, isAdmin } = await resolvePlanServer(user.id);
    if (!isAdmin && !canOpenDashboardPath('/dashboard/leaderboard', getPlanConfig(plan))) {
      return NextResponse.json({ error: 'upgrade_required' }, { status: 403 });
    }
  } catch (e) {
    console.error('[dashboard/leaderboard] plan check failed:', e);
    return NextResponse.json({ error: 'plan_check_failed' }, { status: 500 });
  }

  const url = new URL(req.url);
  const industry = (url.searchParams.get('industry') || 'general').slice(0, 80);
  const cityToken = cityTokenFrom(url.searchParams.get('location')).slice(0, 80);

  try {
    let q = getSupabaseAdmin()
      .from('rankall_scans')
      // b89w: location + enrichment travel with the row so the trusted
      // display-name guard can re-validate the stored business name.
      .select('user_id, user_business_name, input, overall_score, created_at, location, enrichment')
      .eq('industry', industry)
      .not('overall_score', 'is', null)
      .order('created_at', { ascending: false })
      .limit(500);
    // Escape LIKE wildcards in the user-supplied city token.
    if (cityToken) q = q.ilike('location', `%${cityToken.replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
    const { data, error } = await q;
    if (error) {
      console.error('[dashboard/leaderboard] query failed:', error.message);
      return NextResponse.json({ error: 'load_failed' }, { status: 500 });
    }
    // One row per business (its latest scan), ranked by score, top 25.
    const deduped = latestPerBusiness((data ?? []) as LeaderboardSourceRow[], 25);
    return NextResponse.json({ rows: toLeaderboardRows(deduped, user.id) });
  } catch (e) {
    console.error('[dashboard/leaderboard] failed:', e);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
