// lib/moneyBack.ts — 14-day money-back guarantee (ticket b28k).
//
// The guarantee is the risk reversal AFTER a customer pays: within 14 days
// of their FIRST payment, they can get a full refund. This module is the
// single source of truth for the guarantee policy used by the refund
// eligibility route, the refund route, and the billing page:
//
//   - Window: 14 days from the FIRST succeeded Stripe charge (not from
//     signup, not from trial start — the trial is free, so the clock
//     starts when money first moves). Terms §4 says "within 14 days of
//     your first paid subscription"; the first succeeded charge is the
//     honest, auditable reading of that.
//   - Source of truth: Stripe charges (via the API), NOT a local column —
//     no DB migration needed, and the answer can never drift from what
//     Stripe actually charged.
//   - A refund also cancels the subscription (otherwise Stripe would
//     charge again next period — a trap). The billing page says so
//     plainly before the user confirms.
//   - After day 14 the guarantee no longer applies — the UI says so with
//     the actual end date, never a promise of a refund it won't give.
//
// All helpers here are pure (no DB, no network) and unit-tested in
// app/api/__tests__/money-back.test.ts.

export const MONEY_BACK_DAYS = 14;

export type StripeChargeLike = {
  id: string;
  created?: number | null; // unix seconds, per Stripe
  status?: string | null;
  paid?: boolean | null;
  amount?: number | null; // cents
  amount_refunded?: number | null; // cents
  currency?: string | null;
  refunded?: boolean | null;
};

export type RefundEligibility =
  | {
      eligible: true;
      chargeId: string;
      amountCents: number;
      currency: string;
      firstPaidAt: string;
      deadline: string;
    }
  | {
      eligible: false;
      reason: 'no_payment' | 'already_refunded' | 'outside_window';
      firstPaidAt: string | null;
      deadline: string | null;
      chargeId: string | null;
      amountCents: number | null;
      currency: string | null;
    };

// The first payment: earliest succeeded charge. A charge with no usable
// `created` timestamp is skipped — it cannot anchor a 14-day window, and
// guessing would invent a deadline.
export function firstSucceededCharge(
  charges: StripeChargeLike[] | null | undefined,
): StripeChargeLike | null {
  if (!Array.isArray(charges)) return null;
  const succeeded = charges.filter(
    (c) =>
      c &&
      typeof c.id === 'string' &&
      c.id &&
      typeof c.created === 'number' &&
      Number.isFinite(c.created) &&
      c.status === 'succeeded' &&
      c.paid !== false,
  );
  if (succeeded.length === 0) return null;
  succeeded.sort((a, b) => (a.created as number) - (b.created as number));
  return succeeded[0];
}

// Deadline: first payment + 14 days.
export function moneyBackDeadline(firstPaidAt: string | null | undefined): string | null {
  if (!firstPaidAt) return null;
  const ms = new Date(firstPaidAt).getTime();
  if (Number.isNaN(ms)) return null;
  return new Date(ms + MONEY_BACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

// "March 5, 2026" — the date shown in every guarantee notice.
export function moneyBackDateLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

// Exact amount for the refund confirmation ("$39.00") — cents matter here,
// so this is NOT the rounded "$39" used in marketing copy.
export function formatRefundAmount(amountCents: number | null | undefined, currency: string | null | undefined): string {
  if (typeof amountCents !== 'number' || Number.isNaN(amountCents)) return '';
  const upper = (currency || 'USD').toUpperCase();
  const value = (amountCents / 100).toFixed(2);
  if (upper === 'USD') return `$${value}`;
  return `${upper} ${value}`;
}

// Eligibility from a customer's Stripe charges. Pure — the routes fetch
// the charges, this decides. Never throws: bad input is "no payment".
export function refundEligibility(
  charges: StripeChargeLike[] | null | undefined,
  now: Date = new Date(),
): RefundEligibility {
  const first = firstSucceededCharge(charges);
  if (!first) {
    return {
      eligible: false,
      reason: 'no_payment',
      firstPaidAt: null,
      deadline: null,
      chargeId: null,
      amountCents: null,
      currency: null,
    };
  }
  const firstPaidAt = new Date((first.created as number) * 1000).toISOString();
  const deadline = moneyBackDeadline(firstPaidAt);
  const amountCents = typeof first.amount === 'number' ? first.amount : null;
  const currency = (first.currency || 'usd').toUpperCase();
  // Already refunded: Stripe marks the charge refunded, or the refunded
  // amount covers the full charge. Either way there is nothing left to
  // refund — saying so beats issuing (or attempting) a second refund.
  const fullyRefunded =
    first.refunded === true ||
    (amountCents !== null &&
      typeof first.amount_refunded === 'number' &&
      first.amount_refunded >= amountCents);
  if (fullyRefunded) {
    return {
      eligible: false,
      reason: 'already_refunded',
      firstPaidAt,
      deadline,
      chargeId: first.id,
      amountCents,
      currency,
    };
  }
  if (!deadline || now.getTime() > new Date(deadline).getTime()) {
    return {
      eligible: false,
      reason: 'outside_window',
      firstPaidAt,
      deadline,
      chargeId: first.id,
      amountCents,
      currency,
    };
  }
  return {
    eligible: true,
    chargeId: first.id,
    amountCents: amountCents ?? 0,
    currency,
    firstPaidAt,
    deadline: deadline as string,
  };
}

// ── Once per PERSON (not per Stripe customer) ─────────────────────────────
// The guarantee is one refund per person. Keying only on "the first charge
// of this Stripe customer" let a refunded user get a new customer (new
// account / cleared metadata), pay, and refund again — a free-forever loop.
// Every refund is now recorded in money_back_refunds with the user id AND
// the card fingerprint (charge.payment_method_details.card.fingerprint),
// and a second claim by either key is refused.

export type ChargeWithCard = StripeChargeLike & {
  payment_method_details?: { card?: { fingerprint?: string | null } | null } | null;
};

export function chargeCardFingerprint(charge: ChargeWithCard | null | undefined): string | null {
  const fp = charge?.payment_method_details?.card?.fingerprint;
  return typeof fp === 'string' && fp ? fp : null;
}

export type RefundClaim = { user_id?: string | null; card_fingerprint?: string | null };

// True when this person already used the guarantee: a prior claim by the
// same user id OR the same card fingerprint (across all customers).
export function refundAlreadyClaimed(
  claims: RefundClaim[] | null | undefined,
  userId: string,
  fingerprint: string | null,
): boolean {
  if (!Array.isArray(claims)) return false;
  return claims.some(
    (c) => (c.user_id && c.user_id === userId) || (!!fingerprint && c.card_fingerprint === fingerprint),
  );
}

// PostgREST or() filter for prior claims by this user OR this payer key.
// Shared by /api/billing/refund and /api/billing/refund-eligibility so both
// look up claims the SAME way. The key is quoted: an `email:<sha256>` key
// (Link / wallet payers, lib/paymentIdentity) contains a ':' and must parse
// as one value. No key → user id only.
export function refundClaimsOrFilter(userId: string, payerKey: string | null): string {
  return payerKey ? `user_id.eq.${userId},card_fingerprint.eq."${payerKey}"` : `user_id.eq.${userId}`;
}

export const REFUND_ALREADY_USED_MESSAGE =
  'The 14-day money-back guarantee can be used once per customer, and it has already been used for your account or this card. You can still cancel anytime to stop future charges. If you think this is a mistake, contact hello@rankall.io.';

// Page through ALL of a customer's charges (Stripe returns at most 100 per
// page; the old code read only the first page, so a customer with >100
// charges had their FIRST payment mis-identified). `getPage` performs the
// fetch for a given starting_after cursor. Stops after maxPages as a guard.
export async function listAllCharges(
  getPage: (startingAfter: string | null) => Promise<{ data?: ChargeWithCard[]; has_more?: boolean } | null>,
  maxPages = 50,
): Promise<ChargeWithCard[] | null> {
  const all: ChargeWithCard[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < maxPages; i++) {
    const page = await getPage(cursor);
    if (!page) return null;
    const data = Array.isArray(page.data) ? page.data : [];
    all.push(...data);
    if (!page.has_more || data.length === 0) return all;
    cursor = data[data.length - 1].id;
  }
  return all;
}

export function stripeChargesPager(customerId: string, stripeKey: string) {
  return async (startingAfter: string | null) => {
    const qs = new URLSearchParams({ customer: customerId, limit: '100' });
    if (startingAfter) qs.set('starting_after', startingAfter);
    const res = await fetch(`https://api.stripe.com/v1/charges?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${stripeKey}` },
    });
    if (!res.ok) {
      console.error('Stripe charges list error:', res.status, await res.text().catch(() => ''));
      return null;
    }
    return res.json();
  };
}
