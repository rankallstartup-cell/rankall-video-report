// lib/usageLimits.ts
// Server-side usage tracking + enforcement. Use from API routes ONLY (it uses
// the service-role key). UI gating is not enough — limits are enforced here.

import { createClient } from '@supabase/supabase-js';
import { normalizePlan, getPlanLimit, isUnlimited, isAdminUser } from './planConfig';
import { getEffectivePlanLimit, TRIAL_EXPORT_BLOCKED_MESSAGE } from './trialCaps';

// Permanent admin bypass by user ID. Belt-and-suspenders alongside isAdminUser
// (email): even if a route's email lookup fails and passes '' / undefined, these
// IDs are never counted and never blocked.
const ADMIN_USER_IDS = [
  '9e8aea3b-deef-4907-adfb-6d98981ea63f',
];

function isAdminUserId(userId?: string): boolean {
  return !!userId && ADMIN_USER_IDS.includes(userId);
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// Current month key, e.g. "2026-06"
function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const FEATURE_PLAN_NEEDED: Record<string, string> = {
  personal_scan: 'Personal Brand',
  ai_inbox: 'Personal Brand',
  simulator: 'Personal Brand',
  report_export: 'Personal Brand',
  local_scan: 'Business',
  product_scan: 'Business',
  competitor_scan: 'Business',
  demo_generation: 'Business',
  demo_video: 'Business',
  agency_client_scan: 'Agency',
};

export interface UsageCheck {
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
  resetDate: string;
  message?: string;
}

function nextResetDate(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  });
}

export async function checkUsageLimit(
  userId: string,
  userEmail: string,
  featureKey: string,
  plan: string,
  isTrialing = false,
): Promise<UsageCheck> {
  // Admins always allowed — check email (isAdminUser normalizes) AND user ID, so
  // a failed email lookup can't cause an admin to be blocked.
  if (isAdminUser(userEmail) || isAdminUserId(userId)) {
    return { allowed: true, current: 0, limit: 999999, remaining: 999999, resetDate: '' };
  }

  const normalized = normalizePlan(plan);
  // Trialing accounts get the trial cap (min of plan cap and trial cap).
  const limit = getEffectivePlanLimit(normalized, featureKey, isTrialing);

  // Limit of 0 means the feature is not on this plan. During trial, a
  // trial-blocked feature (report_export) gets the honest trial message,
  // not the generic plan message.
  if (limit === 0) {
    if (isTrialing && featureKey === 'report_export') {
      return {
        allowed: false,
        current: 0,
        limit: 0,
        remaining: 0,
        resetDate: '',
        message: TRIAL_EXPORT_BLOCKED_MESSAGE,
      };
    }
    const planNeeded = FEATURE_PLAN_NEEDED[featureKey] ?? 'Business';
    return {
      allowed: false,
      current: 0,
      limit: 0,
      remaining: 0,
      resetDate: '',
      message: `${featureKey.replace(/_/g, ' ')} requires the ${planNeeded} plan or higher.`,
    };
  }

  if (isUnlimited(normalized, featureKey) && !isTrialing) {
    return { allowed: true, current: 0, limit: 999999, remaining: 999999, resetDate: '' };
  }

  const month = getCurrentMonth();
  let current = 0;
  try {
    const { data } = await admin()
      .from('usage_tracking')
      .select('count')
      .eq('user_id', userId)
      .eq('feature_key', featureKey)
      .eq('month', month)
      .maybeSingle();
    current = (data?.count as number) ?? 0;
  } catch {
    // If the tracking table is unavailable, fail OPEN (don't block paying users).
    return { allowed: true, current: 0, limit, remaining: limit, resetDate: nextResetDate() };
  }

  const resetDate = nextResetDate();
  if (current >= limit) {
    return {
      allowed: false,
      current,
      limit,
      remaining: 0,
      resetDate,
      message: `You've used all ${limit} ${featureKey.replace(/_/g, ' ')}s this month. Resets ${resetDate}. Upgrade for more.`,
    };
  }

  return { allowed: true, current, limit, remaining: Math.max(0, limit - current), resetDate };
}

export async function incrementUsage(userId: string, featureKey: string, userEmail?: string): Promise<void> {
  // Admins never consume credits — check email AND user ID, so a missing/failed
  // email lookup can't cause an admin to be counted.
  if (userEmail && isAdminUser(userEmail)) return;
  if (isAdminUserId(userId)) return;
  const month = getCurrentMonth();
  try {
    // Atomic increment via the SQL function (insert-or-bump).
    const { error } = await admin().rpc('increment_usage', {
      p_user_id: userId,
      p_feature_key: featureKey,
      p_month: month,
    });
    if (error) {
      // Fallback if the RPC isn't installed yet: best-effort upsert.
      await admin().from('usage_tracking').upsert(
        { user_id: userId, feature_key: featureKey, month, count: 1, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,feature_key,month', ignoreDuplicates: false },
      );
    }
  } catch {
    /* non-fatal — never let usage tracking break the actual feature */
  }
}

export async function getUsageSummary(
  userId: string,
  plan: string,
  isTrialing = false,
): Promise<Record<string, { used: number; limit: number; remaining: number }>> {
  const month = getCurrentMonth();
  const normalized = normalizePlan(plan);
  const features = ['local_scan', 'personal_scan', 'product_scan', 'competitor_scan', 'ai_inbox', 'simulator', 'report_export', 'demo_video', 'demo_generation', 'agency_client_scan'];

  let rows: { feature_key: string; count: number }[] = [];
  try {
    const { data } = await admin()
      .from('usage_tracking')
      .select('feature_key, count')
      .eq('user_id', userId)
      .eq('month', month);
    rows = (data as { feature_key: string; count: number }[]) ?? [];
  } catch {
    rows = [];
  }

  const summary: Record<string, { used: number; limit: number; remaining: number }> = {};
  for (const feature of features) {
    const used = rows.find((r) => r.feature_key === feature)?.count ?? 0;
    const limit = getEffectivePlanLimit(normalized, feature, isTrialing);
    summary[feature] = { used, limit, remaining: Math.max(0, limit - used) };
  }
  return summary;
}
