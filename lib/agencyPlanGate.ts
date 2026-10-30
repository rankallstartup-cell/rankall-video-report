import { NextResponse } from 'next/server';
import { resolvePlanServer } from '@/lib/resolvePlanServer';
import { isAgencyPlan } from '@/lib/planConfig';

// b89c: server-side Agency-plan gate for the agency API surface.
// The agency pages were gated (PlanPageGuard canSeeAgency) while
// the routes checked only the session — a Free account could call
// them directly. Returns a response to send, or null to proceed.
// Admins pass; an unresolvable plan fails closed with 503 (the
// agency-settings route's established pattern).
export async function agencyPlanGate(userId: string): Promise<NextResponse | null> {
  let resolved: Awaited<ReturnType<typeof resolvePlanServer>> | null = null;
  try {
    resolved = await resolvePlanServer(userId);
  } catch { /* handled below */ }
  if (!resolved) {
    return NextResponse.json({
      error: 'plan_unavailable',
      message: 'We could not confirm your plan right now. Please try again.',
    }, { status: 503 });
  }
  if (!resolved.isAdmin && !isAgencyPlan(resolved.plan)) {
    return NextResponse.json({
      error: 'upgrade_required',
      message: 'This is available on the Agency plan.',
      upgradeUrl: '/pricing',
    }, { status: 403 });
  }
  return null;
}
