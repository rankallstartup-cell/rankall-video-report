'use client';

import { useEffect, useState } from 'react';
import { getBrowserClient } from './supabase';
import { getPlanConfig, isAdminUser, resolvePlanFromSources, PLAN_CONFIG, type PlanType, type PlanConfig } from './planConfig';
import { trialIsExpired } from './trial';

const supabase = getBrowserClient();

interface UsePlanResult {
  plan: PlanType
  rawPlan: PlanType
  planConfig: PlanConfig
  loading: boolean
  userId: string | null
  userEmail: string | null
  // True when the subscription row's Stripe status is 'trialing'. Trialing
  // accounts get trial caps (lib/trialCaps) — UI may hide gated controls for
  // them, but enforcement lives in the API routes, never in the UI.
  isTrialing: boolean
  // When the current trial ends (subscriptions.trial_end), or null. Never
  // read from metadata.
  trialEndsAt: string | null
}

export function usePlan(): UsePlanResult {
  const [plan, setPlan]       = useState<PlanType>('free')
  const [rawPlan, setRawPlan] = useState<PlanType>('free')
  const [loading, setLoading] = useState(true)
  const [userId, setUserId]   = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [isTrialing, setIsTrialing] = useState(false)
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null)

  useEffect(() => {
    async function resolve() {
      const { data: { user: freshUser } } = await supabase.auth.getUser()
      if (!freshUser) { setLoading(false); return }

      const { data: sessionData } = await supabase.auth.getSession()
      const session = sessionData.session
      if (!session) { setLoading(false); return }

      setUserId(freshUser.id)
      setUserEmail(freshUser.email ?? null)

      // b062: plan comes from the subscriptions row → app_metadata,
      // via the shared cascade. NEVER user_metadata (self-grant hole:
      // any signed-in user can set it via updateUser()) and never
      // profiles (not a user-proof plan source).
      let resolved: PlanType = 'free'
      try {
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('status, plan, trial_end')
          .eq('user_id', session.user.id)
          .in('status', ['active', 'trialing', 'past_due'])
          .limit(1)
          .maybeSingle()
        resolved = resolvePlanFromSources(
          sub as { plan?: string | null; status?: string | null; trial_end?: string | null } | null,
          freshUser.app_metadata,
        )
        // Trial state comes from the same subscriptions row — never metadata.
        const row = sub as { status?: string | null; trial_end?: string | null } | null;
        if (row?.status === 'trialing' && row.trial_end && !trialIsExpired(row)) {
          setIsTrialing(true)
          setTrialEndsAt(row.trial_end)
        }
      } catch { /* free */ }

      setRawPlan(resolved)
      // Admins get full access regardless of stored plan
      setPlan(isAdminUser(freshUser.email) ? 'enterprise' : resolved)
      setLoading(false)
    }

    resolve()
  }, [])

  return { plan, rawPlan, planConfig: getPlanConfig(plan), loading, userId, userEmail, isTrialing, trialEndsAt }
}

// Re-export for convenience
export { PLAN_CONFIG };
