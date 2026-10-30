import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/apiAuth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { resolvePlanServer } from '@/lib/resolvePlanServer';
import { getPlanConfig } from '@/lib/planConfig';
import { canOpenDashboardPath } from '@/lib/dashboardAccess';

export const dynamic = 'force-dynamic';

// GET /api/dashboard/kp-stats — Knowledge Panel presence across stored scans
// for the Intelligence page. Server-side (service role) because owner-only
// RLS hides other users' rows from the browser. Returns only the four
// non-identifying columns the page aggregates — never ids, names or inputs.
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // b89v: same gate as the Intelligence page (Item 16 pattern). This is
  // a cross-user aggregate behind a Local Business feature — a signed-in
  // Free account previously received it with no plan check at all.
  try {
    const { plan, isAdmin } = await resolvePlanServer(user.id);
    if (!isAdmin && !canOpenDashboardPath('/dashboard/intelligence', getPlanConfig(plan))) {
      return NextResponse.json({ error: 'upgrade_required' }, { status: 403 });
    }
  } catch (e) {
    console.error('[dashboard/kp-stats] plan check failed:', e);
    return NextResponse.json({ error: 'plan_check_failed' }, { status: 500 });
  }
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('rankall_scans')
      .select('knowledge_panel_exists, knowledge_panel_claimed, industry, country_code')
      .not('knowledge_panel_exists', 'is', null)
      .limit(500);
    if (error) {
      console.error('[dashboard/kp-stats] query failed:', error.message);
      return NextResponse.json({ error: 'load_failed' }, { status: 500 });
    }
    return NextResponse.json({ rows: data ?? [] });
  } catch (e) {
    console.error('[dashboard/kp-stats] failed:', e);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
