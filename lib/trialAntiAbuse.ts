// lib/trialAntiAbuse.ts
// Trial anti-abuse (ticket b28j) — three layers on top of the card-upfront
// trial (PR #46), which already deters casual multi-account cycling:
//
//   1. Email verification: a trial cannot start until the user's email is
//      confirmed. Enforced in create-checkout; the pricing page offers a
//      resend-verification path (POST /api/auth/resend-verification).
//   2. One trial per account (isTrialEligible, create-checkout) and one
//      trial per card (claimTrialFingerprint, webhook at trial start).
//   3. Business key: a trialing scan records (business_key, user_id) in
//      trial_business_usage. Blocked only when the business was already
//      trialed by an account sharing this user's card (see
//      checkTrialBusinessUsed for why the cross-account block was removed).
//   4. Rate limits on trial creation (create-checkout, DB-backed) and on
//      resend.
//
// Failure shape: every block returns/shows a clear, honest message — never
// a cryptic error, never a silent fallback to paid, never a charge without
// a trial. Enforcement fails OPEN on DB errors (a lookup failure must not
// block a paying user; the table does not exist until the b28j migration
// is run — see supabase/migrations/20261016000100_b28j_trial_business_usage.sql).

export const EMAIL_NOT_VERIFIED_MESSAGE =
  'Verify your email to start your trial — check your inbox for the confirmation link, or resend it below.';

export const TRIAL_BUSINESS_USED_MESSAGE =
  'This business already used its free trial. Continue on a paid plan, or contact support if this looks wrong.';

export const TRIAL_CARD_USED_MESSAGE =
  'This card was already used for a Rankall free trial, so this subscription starts without a trial.';

export const TRIAL_RATE_LIMIT_MESSAGE =
  'Too many checkout attempts — please wait a bit and try again.';

export const RESEND_RATE_LIMIT_MESSAGE =
  'Too many verification emails — please wait a bit and try again.';

// Trial creation (create-checkout): 5/hour per user, 20/hour per IP.
// Generous for legitimate use (a few retries after a failed checkout);
// tight enough that trial creation cannot be hammered.
export const TRIAL_CHECKOUT_RATE_LIMIT = {
  perUser: { limit: 5, windowMs: 60 * 60 * 1000 },
  perIp: { limit: 20, windowMs: 60 * 60 * 1000 },
};

// Resend verification: 3/hour per user, 10/hour per IP.
export const RESEND_RATE_LIMIT = {
  perUser: { limit: 3, windowMs: 60 * 60 * 1000 },
  perIp: { limit: 10, windowMs: 60 * 60 * 1000 },
};

type AdminClient = any; // Service-role client (getSupabaseAdmin) — matches the
// codebase's existing `(supabaseAdmin.auth as any)` cast pattern.

// One trial per account EVER (create-checkout). A user who has ANY prior
// subscriptions row (trialing, active, cancelled, expired — including the
// retired in-app trial rows) or whose Stripe customer ever had a
// subscription with a trial gets a checkout WITHOUT trial_period_days.
// Pure: the route fetches, this decides. Unknown (lookup failed) → no trial:
// charging immediately with an honest checkout page beats a second trial.
export function isTrialEligible(input: {
  hasSubscriptionRow: boolean | null; // null = lookup failed
  stripeSubscriptions: Array<{ trial_start?: number | null; trial_end?: number | null }> | null; // null = lookup failed / no customer
  hadStripeCustomer: boolean;
}): boolean {
  if (input.hasSubscriptionRow !== false) return false;
  if (input.hadStripeCustomer) {
    if (input.stripeSubscriptions === null) return false;
    if (input.stripeSubscriptions.some((s) => !!(s?.trial_start || s?.trial_end))) return false;
  }
  return true;
}

// One trial per CARD. Every trialing subscription records its default
// payment method's card fingerprint in trial_fingerprints. The FIRST
// subscription to record a fingerprint keeps its trial; any later
// subscription with the same card (any account) is a repeat trial and the
// webhook ends it immediately. Insert-then-read makes the decision
// deterministic even for concurrent checkouts (lowest id wins), and a
// webhook retry for the same subscription stays 'first'.
export type FingerprintClaim = 'first' | 'repeat' | 'unknown';

export function decideFingerprintClaim(
  rows: Array<{ id?: number | string | null; stripe_subscription_id?: string | null; created_at?: string | null }>,
  subscriptionId: string,
): FingerprintClaim {
  if (!Array.isArray(rows) || rows.length === 0) return 'unknown';
  const sorted = [...rows].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (ta !== tb) return ta - tb;
    return Number(a.id ?? 0) - Number(b.id ?? 0);
  });
  return sorted[0].stripe_subscription_id === subscriptionId ? 'first' : 'repeat';
}

// Fail OPEN ('unknown') when the table is missing: ending a legitimate
// trial because a migration is pending would be worse than missing one
// repeat trial. Logged so it is visible.
export async function claimTrialFingerprint(
  adminClient: AdminClient,
  fingerprint: string,
  userId: string,
  subscriptionId: string,
): Promise<FingerprintClaim> {
  if (!fingerprint || !subscriptionId) return 'unknown';
  try {
    const { error: insErr } = await adminClient.from('trial_fingerprints').upsert(
      { fingerprint, user_id: userId, stripe_subscription_id: subscriptionId },
      { onConflict: 'stripe_subscription_id', ignoreDuplicates: true },
    );
    if (insErr) {
      console.error('[trialAntiAbuse] trial_fingerprints insert failed (failing open):', insErr.message ?? insErr);
      return 'unknown';
    }
    const { data, error } = await adminClient
      .from('trial_fingerprints')
      .select('id, stripe_subscription_id, created_at')
      .eq('fingerprint', fingerprint);
    if (error) {
      console.error('[trialAntiAbuse] trial_fingerprints read failed (failing open):', error.message ?? error);
      return 'unknown';
    }
    return decideFingerprintClaim((data ?? []) as Parameters<typeof decideFingerprintClaim>[0], subscriptionId);
  } catch (err) {
    console.error('[trialAntiAbuse] claimTrialFingerprint error (failing open):', err);
    return 'unknown';
  }
}

// Business-key check (scan time). Policy change: the old check blocked ANY
// second account from trialing a business another account had trialed —
// which let a competitor "claim" a business by trialing it first and lock
// the real owner out of their own trial. Ownership verification is out of
// scope, so the block now only applies when the earlier trial of this
// business was made by an account that shares a trial card fingerprint with
// this user (same person, new account). The same account re-scanning its
// own business is never blocked.
//
// Fail open: any DB error (including the tables not existing yet) means
// "not used" — a lookup failure must not block a paying user.
export async function checkTrialBusinessUsed(
  adminClient: AdminClient,
  businessKey: string,
  userId: string,
): Promise<boolean> {
  if (!businessKey) return false;
  try {
    const { data: usage, error } = await adminClient
      .from('trial_business_usage')
      .select('user_id')
      .eq('business_key', businessKey);
    if (error || !Array.isArray(usage)) return false;
    const others = usage
      .map((r: { user_id?: unknown }) => r.user_id)
      .filter((id: unknown): id is string => typeof id === 'string' && id !== userId);
    if (others.length === 0) return false;

    const { data: mine, error: fpErr } = await adminClient
      .from('trial_fingerprints')
      .select('fingerprint')
      .eq('user_id', userId);
    if (fpErr || !Array.isArray(mine) || mine.length === 0) return false;
    const myFps = mine.map((r: { fingerprint?: unknown }) => r.fingerprint).filter(Boolean);
    if (myFps.length === 0) return false;

    const { data: shared, error: shErr } = await adminClient
      .from('trial_fingerprints')
      .select('user_id')
      .in('fingerprint', myFps)
      .in('user_id', others);
    if (shErr || !Array.isArray(shared)) return false;
    return shared.length > 0;
  } catch {
    return false;
  }
}

// Record that this user used a trial for this business. Idempotent per
// (business, user). Never throws — a record failure must not block the scan.
export async function recordTrialBusinessUsage(
  adminClient: AdminClient,
  businessKey: string,
  userId: string,
): Promise<void> {
  if (!businessKey || !userId) return;
  try {
    await adminClient.from('trial_business_usage').upsert(
      { business_key: businessKey, user_id: userId },
      { onConflict: 'business_key,user_id', ignoreDuplicates: true },
    );
  } catch {
    // Non-fatal: the scan already succeeded; the usage record is best-effort.
  }
}
