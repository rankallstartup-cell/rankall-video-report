// lib/trialEnd.ts — trial-end flow helpers (ticket b28h).
//
// The card is collected BEFORE the trial starts (PR #46), so at trial end
// Stripe charges the card on file automatically. This module is the single
// source of truth for the trial-end policy used by the billing webhook, the
// expire-trials cron, the countdown banner, and the billing page:
//
//   - Trial-ending-soon warning: 3 days before trial end (Stripe's
//     customer.subscription.trial_will_end event + the cron's reminder pass
//     as belt-and-braces). Deduped via app_metadata.trial_warning_sent_at
//     so a retried event / overlapping cron run never double-warns.
//   - Grace clock: app_metadata.payment_failed_at (first write wins). Both
//     flags are app_metadata ONLY — user_metadata is user-writable, and a
//     user resetting it used to get an endless grace period. A legacy
//     user_metadata copy is ignored (never extends grace).
//   - Grace period: 3 days after a failed payment. During grace the user
//     keeps full access. If still unpaid after grace, the subscription is
//     cancelled and the account downgrades to Free — data is NEVER deleted,
//     access is NEVER hard-cut without notice.
//   - Every notice states the deadline and the consequence in plain words.
//
// All helpers here are pure (no DB, no network) and unit-tested in
// app/api/__tests__/trial-end-flow.test.ts.

export const TRIAL_WARNING_DAYS = 3;
export const TRIAL_GRACE_DAYS = 3;
export const TRIAL_WARNING_DEDUP_DAYS = 7;

// Whole days left on a trial (ceiling — a trial ending in 12h is "1 day
// left"; an already-ended trial is <= 0). Same semantics as the b063
// trialDaysLeft (lib/trial.ts, in-app trials) — duplicated here on purpose:
// this file is for Stripe trials and must not import the in-app trial
// system, which does not exist on staging.
export function trialDaysLeft(trialEndsAt: string | null | undefined, now: Date = new Date()): number {
  if (!trialEndsAt) return 0;
  return Math.ceil((new Date(trialEndsAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

// "March 5, 2026" — the date shown in every trial notice.
export function trialEndDateLabel(trialEndsAt: string | null | undefined): string {
  if (!trialEndsAt) return '';
  return new Date(trialEndsAt).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// Trusted grace clock: app_metadata.payment_failed_at only.
export function trustedPaymentFailedAt(appMetadata: Record<string, unknown> | null | undefined): string | null {
  const v = appMetadata?.payment_failed_at;
  return typeof v === 'string' && v && !Number.isNaN(new Date(v).getTime()) ? v : null;
}

// Deadline for a failed payment: payment_failed_at + grace days.
export function graceDeadline(paymentFailedAt: string | null | undefined): string | null {
  if (!paymentFailedAt) return null;
  return new Date(new Date(paymentFailedAt).getTime() + TRIAL_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

// True when the grace period has run out (and only when a failure was
// actually recorded — a missing timestamp never counts as "past grace").
export function isPastGrace(paymentFailedAt: string | null | undefined, now: Date = new Date()): boolean {
  const deadline = graceDeadline(paymentFailedAt);
  if (!deadline) return false;
  return now.getTime() > new Date(deadline).getTime();
}

// True when a trial-ending warning was already sent recently — the dedup
// check for both the trial_will_end webhook handler and the cron reminder
// pass. A warning sent within the last TRIAL_WARNING_DEDUP_DAYS means "this
// trial was already warned"; an older/absent flag means "warn now".
// Pass app_metadata (trusted), never user_metadata.
export function wasWarnedRecently(
  appMetadata: Record<string, unknown> | null | undefined,
  now: Date = new Date(),
): boolean {
  const sentAt = appMetadata?.trial_warning_sent_at;
  if (typeof sentAt !== 'string' || !sentAt) return false;
  const sentMs = new Date(sentAt).getTime();
  if (Number.isNaN(sentMs)) return false;
  return now.getTime() - sentMs < TRIAL_WARNING_DEDUP_DAYS * 24 * 60 * 60 * 1000;
}

// Amount Stripe will charge, from a subscription/invoice object:
// items.data[0].price.unit_amount is in the smallest currency unit (cents).
// Returns null when the object carries no usable amount — callers must
// then OMIT the amount from the notice, never invent one.
export function extractChargeAmount(obj: Record<string, unknown> | null | undefined): string | null {
  try {
    const items = obj?.items as { data?: Array<{ price?: { unit_amount?: number | null; currency?: string | null } }> } | undefined;
    const price = items?.data?.[0]?.price;
    if (typeof price?.unit_amount !== 'number') return null;
    const currency = (price?.currency || 'usd').toUpperCase();
    const major = price.unit_amount / 100;
    const formatted = major % 1 === 0 ? String(major) : major.toFixed(2);
    return currency === 'USD' ? `$${formatted}` : `${formatted} ${currency}`;
  } catch {
    return null;
  }
}
