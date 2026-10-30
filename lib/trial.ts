// lib/trial.ts — the real 7-day free trial (ax6m).
//
// Before ax6m, signup copy promised "7-day free trial, no credit card
// required" but nothing ever created a trial: signup stored a display-name
// plan the resolver didn't recognize (-> 'free'), checkout created a Stripe
// subscription with NO trial_period_days (charged immediately), and the
// webhook email claimed "your trial has started" for a paid activation.
//
// One trial per user, ever. Source of truth is the subscriptions row
// (service-role only), written by the billing webhook; app_metadata is the
// trusted metadata copy. Resolvers NEVER trust user_metadata (b062:
// self-grant hole). Resolvers must honor trial_end (see trialIsExpired).

import { normalizePlan, type PlanType } from './planConfig';

export const TRIAL_DAYS = 7;

// Self-serve plans a trial may grant. Enterprise is sales-led; Product Pro
// is not a PlanType (the OAuth mapper defaults it to business too).
const TRIAL_PLANS: readonly string[] = ['business', 'personal_pro', 'agency'];

// Map anything signup may carry (display name, canonical key, legacy key)
// to a trial-eligible canonical plan. Unknown / ineligible -> 'business'.
export function normalizeTrialPlan(input: string | null | undefined): PlanType {
  const display: Record<string, string> = {
    // ax75: signup now displays 'Local Business' (was 'Local Business Pro');
    // the old name stays accepted so in-flight signups still trial.
    'local business': 'business',
    'local business pro': 'business',
    'product pro': 'business',
    'personal brand': 'personal_pro',
    'agency': 'agency',
  };
  const key = (input ?? '').trim().toLowerCase();
  if (display[key]) return display[key] as PlanType;
  const normalized = normalizePlan(input) as PlanType;
  return TRIAL_PLANS.includes(normalized) ? normalized : 'business';
}

export interface TrialResult {
  created: boolean;
  plan: PlanType;
  trialEndsAt: string | null;
}

// RETIRED (card-upfront trials). This used to insert a 'trialing'
// subscriptions row with NO Stripe subscription and NO card at signup — the
// "in-app trial" — which granted 7 days of paid access without a card and
// also made create-checkout skip Stripe's own trial. The product decision
// is a 7-day Stripe trial with the card collected upfront, so trials now
// start ONLY in Stripe checkout (create-checkout: trial_period_days=7,
// payment_method_collection=always) and are recorded by the billing webhook
// (subscriptions row + app_metadata; user_metadata is display-only).
//
// Kept as a no-op with the same signature so existing callers (auth
// callback, /api/trial/start, onboarding) keep working: it never writes
// and reports created:false / plan 'free'.
export async function startTrialForUser(
  _userId: string,
  _planInput: string | null | undefined,
): Promise<TrialResult | null> {
  return { created: false, plan: 'free', trialEndsAt: null };
}

// A trialing row whose trial_end has passed grants NOTHING. Callers must
// treat an expired trialing row as "no subscription" — and must NOT fall
// through to metadata (the metadata sync still says the trial plan, stale).
// Rows with no trial_end recorded cannot be proven expired; leave them.
export function trialIsExpired(row: { status?: string | null; trial_end?: string | null }): boolean {
  if (row.status !== 'trialing') return false;
  if (!row.trial_end) return false;
  return new Date(row.trial_end).getTime() <= Date.now();
}

// Whole days left on a trial (ceiling — a trial ending in 12h is "1 day
// left"; an already-ended trial is <= 0). Pure, for the countdown
// banner + warning emails (b063).
export function trialDaysLeft(trialEndsAt: string | null | undefined, now: Date = new Date()): number {
  if (!trialEndsAt) return 0;
  return Math.ceil((new Date(trialEndsAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}
