// lib/trialCaps.ts
// Trial caps — the anti-copying protection for trial accounts.
//
// A trialing account (Stripe subscription status 'trialing') gets a TASTE of
// the paid plan, not the whole thing. Caps are enforced server-side in the
// scan routes, the PDF export route, and the agency-settings save route.
// Client components may hide gated UI for trialing users (usePlan exposes
// isTrialing), but UI hiding is never the enforcement — the routes are.
//
// What the caps are (documented here, the single source of truth):
//   - 1 location: 1 distinct business (normalized scan input) scanned during
//     the trial. A second distinct business is blocked with an upgrade message.
//   - Capped scans: paid monthly caps scaled down to a 7-day trial and rounded
//     conservatively (business local_scan 200/mo -> 25; personal 100 -> 10;
//     agency_client_scan 1000 -> 5; demo 5 -> 1). Trial caps OVERRIDE the paid
//     cap when they are lower (min of the two).
//   - report_export: 0. PDF export is blocked entirely during trial.
//   - White-label: blocked entirely during trial (settings save rejected,
//     PDF renders Rankall branding).
//   - Public API: NO customer-facing API exists yet ("API access" is only
//     Enterprise marketing copy). There is nothing to gate; when an agency API
//     ships it must be gated to non-trial paid plans. Do not pretend otherwise.
//
// Failure shape: every blocked action returns/shows a clear, honest upgrade
// message — never a silent failure, never a cryptic error, never a partial
// export. Enforcement fails OPEN on DB errors (a lookup failure must not block
// a paying user), matching lib/usageLimits.

import { normalizePlan, getPlanLimit } from './planConfig';

export const TRIAL_MAX_LOCATIONS = 1;

// Monthly-equivalent caps during a 7-day trial, keyed by PLAN_LIMITS feature key.
// Features not listed here keep their normal paid-plan limit during trial.
export const TRIAL_LIMITS: Record<string, number> = {
  local_scan: 25,
  personal_scan: 10,
  product_scan: 10,
  competitor_scan: 10,
  ai_inbox: 10,
  simulator: 10,
  demo_generation: 1,
  demo_video: 1,
  agency_client_scan: 5,
  report_export: 0,
};

// Copy (QA 11): trialing users already have a card on file (card-upfront
// Stripe trial), so "add your card" was wrong. Each message says what is
// capped and how to unlock it: the paid plan starts automatically when the
// trial ends, or right away via "Start paid plan now" on the billing page
// (POST /api/billing/end-trial).
const UNLOCK_SUFFIX =
  'when your trial converts to a paid plan — automatically when the trial ends, or right away if you start your paid plan now from the billing page.';

export const TRIAL_EXPORT_BLOCKED_MESSAGE =
  `Report exports are not included in the free trial. They unlock ${UNLOCK_SUFFIX}`;

export const TRIAL_WHITELABEL_BLOCKED_MESSAGE =
  `White-label is not included in the free trial. It unlocks ${UNLOCK_SUFFIX}`;

export const TRIAL_LOCATION_BLOCKED_MESSAGE =
  `Free trials cover 1 location. Tracking more locations unlocks ${UNLOCK_SUFFIX}`;

export function trialCapReachedMessage(label: string, limit: number): string {
  return limit <= 0
    ? `${label} is not included in the free trial. It unlocks ${UNLOCK_SUFFIX}`
    : `You've used the ${limit} ${label} included in your free trial. More unlock ${UNLOCK_SUFFIX}`;
}

export function isTrialingStatus(status: string | null | undefined): boolean {
  return status === 'trialing';
}

// Effective limit for a (plan, feature) pair. When trialing, the trial cap
// wins whenever it is lower than the plan cap (min of the two) — a trial
// never grants MORE than the paid plan, and never more than the trial cap.
//
// Agency trials: the scan route meters every scan as local_scan, so the
// agency 5-scan trial cap (agency_client_scan: 5) was configured but never
// checked — a trialing agency got the generic 25. A trialing agency's
// local_scan limit is therefore its agency_client_scan trial cap.
export function getEffectivePlanLimit(
  plan: string | null | undefined,
  featureKey: string,
  isTrialing: boolean,
): number {
  const planLimit = getPlanLimit(plan, featureKey);
  if (!isTrialing) return planLimit;
  if (featureKey === 'local_scan' && normalizePlan(plan) === 'agency') {
    return Math.min(planLimit, TRIAL_LIMITS.agency_client_scan);
  }
  const trialLimit = TRIAL_LIMITS[featureKey];
  if (trialLimit === undefined) return planLimit;
  return Math.min(planLimit, trialLimit);
}

// Normalize a scan input for the 1-location comparison: case, punctuation,
// and whitespace must not turn the same business into a "second location".
// Unicode-aware: letters/marks/digits of EVERY script are kept. The old
// ASCII-only regex turned non-Latin names (e.g. "東京歯科", "दिल्ली डेंटल")
// into '' — which the cap treated as "no location", so a trialing user
// could scan unlimited non-Latin businesses. An input with no letters or
// digits at all still gets its own non-empty key (never "no location").
export const NON_ALPHANUMERIC_KEY = '__non_alphanumeric__';
export function normalizeScanInput(input: string): string {
  const raw = typeof input === 'string' ? input : '';
  const normalized = raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized) return normalized;
  return raw.trim() ? NON_ALPHANUMERIC_KEY : '';
}

// True when the requested scan input is a NEW location for a trialing user:
// the user already has >= TRIAL_MAX_LOCATIONS distinct businesses scanned
// during the trial and the request is for none of them.
export function isNewTrialLocation(
  requestedInput: string,
  trialScanInputs: string[],
): boolean {
  const requested = normalizeScanInput(requestedInput);
  if (!requested) return false;
  const seen = new Set(trialScanInputs.map(normalizeScanInput).filter(Boolean));
  if (seen.has(requested)) return false;
  return seen.size >= TRIAL_MAX_LOCATIONS;
}

// 1-location cap for the scan route. Only BUSINESS scans count: a category
// scan ("best dentist in Austin") is not a location and must neither be
// blocked nor consume the trial's one location. Prior trial locations come
// from trial_business_usage (recorded only for trialing business scans);
// if that table is unavailable, fall back to the trial-period scan inputs.
// Fails open on DB errors (a lookup failure must not block a paying user).
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- service-role client (same pattern as lib/trialAntiAbuse)
type AdminLike = any;
export async function isTrialLocationBlocked(
  admin: AdminLike,
  userId: string,
  input: string,
  isBusinessScan: boolean,
  trialStartedAt: string | null,
): Promise<boolean> {
  if (!isBusinessScan) return false;
  try {
    const { data, error } = await admin
      .from('trial_business_usage')
      .select('business_key')
      .eq('user_id', userId);
    if (!error && Array.isArray(data)) {
      const keys = data.map((r: { business_key?: unknown }) => String(r.business_key ?? '')).filter(Boolean);
      return isNewTrialLocation(input, keys);
    }
    if (!trialStartedAt) return false;
    const { data: scans, error: scanErr } = await admin
      .from('rankall_scans')
      .select('input')
      .eq('user_id', userId)
      .gte('created_at', trialStartedAt);
    if (scanErr) return false;
    const prior = (scans || []).map((r: { input?: unknown }) => r.input as string).filter(Boolean);
    return isNewTrialLocation(input, prior);
  } catch {
    return false;
  }
}

// ── Server-side trial caps for costly / gated routes ─────────────────────
// enforceTrialCap(req, feature) — call at the top of a route. Returns a
// ready NextResponse when the SESSION user is trialing and over the trial
// cap for `feature`, else null. Non-trialing, anonymous and admin users are
// never affected (other limits still apply in the route). Metered features
// count in usage_tracking under their own key; `consume: true` features
// are counted here on each allowed call (the route has no counter of its
// own), `consume: false` ones are counted by the route already.
// Fails open on lookup errors, matching lib/usageLimits.
export type TrialCapFeature = 'ai_inbox' | 'report_email' | 'executive_summary' | 'agency_proposal';

export const TRIAL_CAP_FEATURES: Record<TrialCapFeature, { usageKey: string; limit: number; consume: boolean; label: string }> = {
  ai_inbox: { usageKey: 'ai_inbox', limit: TRIAL_LIMITS.ai_inbox, consume: false, label: 'AI Inbox searches' },
  report_email: { usageKey: 'trial_report_email', limit: 3, consume: true, label: 'report emails' },
  executive_summary: { usageKey: 'trial_executive_summary', limit: 5, consume: true, label: 'AI executive summaries' },
  agency_proposal: { usageKey: 'trial_agency_proposal', limit: 2, consume: true, label: 'agency proposals' },
};

export function trialCapDecision(used: number, limit: number): { allowed: boolean; remaining: number } {
  if (limit <= 0) return { allowed: false, remaining: 0 };
  return { allowed: used < limit, remaining: Math.max(0, limit - used) };
}

export async function enforceTrialCap(
  req: { cookies: { getAll(): { name: string; value: string }[] } },
  feature: TrialCapFeature,
): Promise<Response | null> {
  try {
    const { createServerClient } = await import('@supabase/ssr');
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } },
    );
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) return null;

    const { resolvePlanServer } = await import('./resolvePlanServer');
    const plan = await resolvePlanServer(user.id);
    if (!plan.isTrialing || plan.isAdmin) return null;

    const cfg = TRIAL_CAP_FEATURES[feature];
    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const { data: row, error } = await admin
      .from('usage_tracking')
      .select('count')
      .eq('user_id', user.id)
      .eq('feature_key', cfg.usageKey)
      .eq('month', month)
      .maybeSingle();
    if (error) return null; // fail open
    const used = Number((row as { count?: number } | null)?.count ?? 0);
    const decision = trialCapDecision(used, cfg.limit);
    if (!decision.allowed) {
      return Response.json(
        {
          error: 'trial_cap_reached',
          feature,
          limit: cfg.limit,
          message: trialCapReachedMessage(cfg.label, cfg.limit),
          upgradeUrl: '/dashboard/billing',
        },
        { status: 403 },
      );
    }
    if (cfg.consume) {
      const { incrementUsage } = await import('./usageLimits');
      await incrementUsage(user.id, cfg.usageKey, plan.email);
    }
    return null;
  } catch (err) {
    console.error('[trialCaps] enforceTrialCap error (failing open):', err);
    return null;
  }
}

// Re-export for callers that only need the plan normalizer alongside caps.
export { normalizePlan };

// Round 2: one-line, honest summary of the trial caps for signup copy —
// built from the constants above so the copy cannot drift from enforcement.
export function trialCapsSummary(planKey: string): string {
  const scans = planKey === 'personal_pro' ? TRIAL_LIMITS.personal_scan
    : planKey === 'agency' ? TRIAL_LIMITS.agency_client_scan
    : TRIAL_LIMITS.local_scan;
  const scanWord = planKey === 'agency' ? 'client scans' : 'scans';
  const unlocks = planKey === 'agency' ? 'Report exports and white-label unlock' : 'Report exports unlock';
  return `The trial covers ${TRIAL_MAX_LOCATIONS} location and up to ${scans} ${scanWord}. ${unlocks} when your paid plan starts.`;
}

// ── Server-side category classifier for trial caps ───────────────────────
// Moved to lib/categoryQueryClassifier.ts (server-only: it loads the full
// category vocabulary, and this module is imported by client pages). The
// scan route decides whether a trial scan consumes a location there — never
// from the client's isBusinessName flag.
