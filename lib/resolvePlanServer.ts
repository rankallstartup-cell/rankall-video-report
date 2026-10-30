// lib/resolvePlanServer.ts
// Server-side plan resolution via the shared cascade in
// lib/planConfig.resolvePlanFromSources (subscriptions → app_metadata
// → free). Client components use usePlan() from lib/usePlan.ts, which
// uses the same cascade. No resolver may trust user_metadata for the
// plan (b062: self-grant hole).

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isAdminUser, resolvePlanFromSources, type PlanType } from './planConfig';
import { isTrialingStatus } from './trialCaps';

function adminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export interface ServerPlanResult {
  plan: PlanType;
  rawPlan: PlanType;
  email: string;
  isAdmin: boolean;
  // Trial state: the subscription row's Stripe status. Trialing accounts get
  // trial caps (lib/trialCaps) — they must NOT be treated as fully paid.
  isTrialing: boolean;
  subscriptionStatus: string | null;
  // When the current trial started (subscriptions.created_at), or null.
  // Used by the scan route's 1-location check (trial-period scan set).
  trialStartedAt: string | null;
}

export async function resolvePlanServer(
  userId: string,
  supabase?: SupabaseClient,
): Promise<ServerPlanResult> {
  const sb = supabase ?? adminClient();
  let subscriptionStatus: string | null = null;
  let trialStartedAt: string | null = null;

  // Fetch the user record once: email (admin check) + app_metadata
  // (admin-override fallback in the shared cascade).
  let email = '';
  let appMetadata: unknown;
  try {
    const { data: userData } = await (sb.auth as any).admin.getUserById(userId);
    const user = userData?.user;
    if (user) {
      email = user.email || '';
      appMetadata = (user as any).app_metadata;
    }
  } catch { /* fall through */ }

  // b062: single shared cascade — subscriptions → app_metadata → free.
  // NEVER user_metadata (self-grant hole); profiles is not a plan source.
  let rawPlan: PlanType = 'free';
  try {
    const { data: sub } = await sb
      .from('subscriptions')
      .select('plan, status, created_at, trial_end')
      .eq('user_id', userId)
      .in('status', ['active', 'trialing', 'past_due'])
      .limit(1)
      .maybeSingle();
    const row = sub as { plan?: string | null; status?: string | null; trial_end?: string | null; created_at?: string | null } | null;
    rawPlan = resolvePlanFromSources(row, appMetadata);
    // Trial state comes from the same row the plan came from — never metadata.
    if (row?.status && rawPlan !== 'free') subscriptionStatus = row.status;
    if (row?.status === 'trialing' && row.created_at) trialStartedAt = row.created_at;
  } catch { /* fall through */ }

  const admin = isAdminUser(email);
  return {
    plan: admin ? ('enterprise' as PlanType) : rawPlan,
    rawPlan,
    email,
    isAdmin: admin,
    isTrialing: isTrialingStatus(subscriptionStatus),
    subscriptionStatus,
    trialStartedAt,
  };
}
