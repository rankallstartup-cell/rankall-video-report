'use client';
import { usePlan } from '@/lib/usePlan';
import { getPlanConfig, isAdminUser } from '@/lib/planConfig';

// ax75: delegate to usePlan — the ONE plan resolver. The old hook read
// only user_metadata.account_type, so a trialing user whose subscriptions
// row existed but whose metadata sync lagged/failed resolved to 'free'
// and PlanPageGuard showed an upgrade wall on the fix queue (canSeeFixes)
// for someone on a valid trial. usePlan resolves subscriptions first
// (trialing rows grant the plan), then metadata, then profiles.
export function usePlanCheck() {
  const { plan, loading, userEmail } = usePlan();
  return { plan, loading, config: getPlanConfig(plan), isAdmin: isAdminUser(userEmail) };
}
