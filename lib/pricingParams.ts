// /pricing?plan= / ?upgrade= → pricing tier key to highlight (ticket 10d).
// Values come from signup links and in-app upgrade prompts;
// upgrade=local_pro is the in-app alias for the Local Business tier.
const PLAN_PARAM_TO_TIER: Record<string, string> = {
  business: 'business', local_business: 'business', local_pro: 'business',
  agency: 'agency',
  personal_pro: 'personal_pro', personal: 'personal_pro',
  free: 'free',
};

export function tierKeyFromParams(search: string): string | null {
  const params = new URLSearchParams(search);
  const raw = (params.get('plan') || params.get('upgrade') || '').trim().toLowerCase();
  return PLAN_PARAM_TO_TIER[raw] ?? null;
}

// Round 2 (ax6p residual): the billing interval chosen before signup is
// saved to localStorage (rankall_intended_interval) by /signup. The
// post-signup path (onboarding -> homepage upgrade banner -> /pricing)
// must carry it into checkout. ?interval= wins; else the stored intent.
export const INTENDED_INTERVAL_KEY = 'rankall_intended_interval';
export type BillingInterval = 'monthly' | 'annual';
export function intervalFromParams(search: string, stored: string | null | undefined): BillingInterval {
  const q = new URLSearchParams(search).get('interval');
  if (q === 'annual' || q === 'monthly') return q;
  return stored === 'annual' ? 'annual' : 'monthly';
}

// Is an annual Stripe price configured for this pricing tier? `prices` is
// GET /api/billing/status's map (`<plan>_<interval>` -> configured). Unknown
// (status not loaded yet) returns null so callers can defer to the server.
export function annualConfigured(tierKey: string, prices: Record<string, boolean> | null | undefined): boolean | null {
  if (!prices) return null;
  return prices[`${tierKey}_annual`] === true;
}
