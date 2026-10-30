import { NextRequest, NextResponse } from 'next/server';
import { getUsageSummary } from '@/lib/usageLimits';
import { resolvePlanServer } from '@/lib/resolvePlanServer';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'missing_user_id' }, { status: 400 });
  }

  // b01t: the old code returned ANY user's usage summary + plan for a
  // query-param userId with no session check (cross-user read). The
  // requested userId must be the caller's own session user.
  const sessionSupabase = await createServerSupabaseClient();
  const { data: { user } } = await sessionSupabase.auth.getUser();
  if (!user || user.id !== userId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  try {
    // Resolve the user's plan + trial state (trialing accounts see trial caps).
    let plan = 'free';
    let rawPlan = 'free';
    let isAdmin = false;
    let isTrialing = false;
    try {
      const resolved = await resolvePlanServer(userId);
      // b8b9: use the REAL plan (rawPlan), NOT the admin-upgraded one.
      // resolvePlanServer returns plan='enterprise' for admins — the
      // admin bypass is enforcement-only (checkUsageLimit), but this
      // endpoint DISPLAYS limits, and showing an admin "Unlimited" for
      // every feature on a Free account contradicted the Plan tab's
      // "Free Plan / 3 scans / month". Display = the plan's real limits.
      plan = resolved.rawPlan;
      rawPlan = resolved.rawPlan;
      isAdmin = resolved.isAdmin;
      isTrialing = resolved.isTrialing;
    } catch {
      /* fall back to free */
    }

    const summary = await getUsageSummary(userId, plan, isTrialing);
    // b8af: rawPlan + isAdmin let the page show the account's real plan;
    // `plan` stays the effective (admin → enterprise) plan the limits use.
    return NextResponse.json({ summary, plan, rawPlan, isAdmin, isTrialing });
  } catch {
    return NextResponse.json({ error: 'usage_unavailable' }, { status: 500 });
  }
}
