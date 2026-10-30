import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  MONEY_BACK_DAYS,
  firstSucceededCharge,
  moneyBackDeadline,
  moneyBackDateLabel,
  formatRefundAmount,
  refundEligibility,
} from '@/lib/moneyBack';

// b28k: 14-day money-back guarantee — self-serve refund, enforced from
// Stripe charges. Before this ticket, refunds were email-only (terms said
// "email hello@rankall.io") and the billing page had no refund action, so
// the "manage billing" link in the trial-conversion email was a dead end
// for refunds. No real refund is ever issued in tests.
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const NOW = new Date('2026-10-15T12:00:00Z');
const charge = (over: Record<string, unknown> = {}) => ({
  id: 'ch_1',
  created: Math.floor(new Date('2026-10-10T12:00:00Z').getTime() / 1000),
  status: 'succeeded',
  paid: true,
  amount: 3900,
  amount_refunded: 0,
  currency: 'usd',
  refunded: false,
  ...over,
});

describe('lib/moneyBack — pure helpers', () => {
  it('window is 14 days', () => {
    expect(MONEY_BACK_DAYS).toBe(14);
  });

  it('firstSucceededCharge picks the earliest succeeded charge only', () => {
    const charges = [
      charge({ id: 'ch_later', created: Math.floor(new Date('2026-10-12T00:00:00Z').getTime() / 1000) }),
      charge({ id: 'ch_failed', status: 'failed', created: 1 }),
      charge({ id: 'ch_first', created: Math.floor(new Date('2026-10-08T00:00:00Z').getTime() / 1000) }),
      charge({ id: 'ch_no_ts', created: null }),
    ];
    expect(firstSucceededCharge(charges)?.id).toBe('ch_first');
    expect(firstSucceededCharge([])).toBeNull();
    expect(firstSucceededCharge(null)).toBeNull();
    expect(firstSucceededCharge([charge({ status: 'failed' })])).toBeNull();
  });

  it('deadline is first payment + 14 days; label is human-readable', () => {
    expect(moneyBackDeadline('2026-10-10T12:00:00Z')).toBe('2026-10-24T12:00:00.000Z');
    expect(moneyBackDeadline(null)).toBeNull();
    expect(moneyBackDeadline('not-a-date')).toBeNull();
    expect(moneyBackDateLabel('2026-10-24T12:00:00Z')).toContain('2026');
    expect(moneyBackDateLabel(null)).toBe('');
  });

  it('formatRefundAmount shows exact cents — never a rounded marketing figure', () => {
    expect(formatRefundAmount(3900, 'usd')).toBe('$39.00');
    expect(formatRefundAmount(25900, 'USD')).toBe('$259.00');
    expect(formatRefundAmount(0, 'usd')).toBe('$0.00');
    expect(formatRefundAmount(null, 'usd')).toBe('');
  });

  it('inside window → eligible with the first charge', () => {
    const r = refundEligibility([charge()], NOW);
    expect(r.eligible).toBe(true);
    if (r.eligible) {
      expect(r.chargeId).toBe('ch_1');
      expect(r.amountCents).toBe(3900);
      expect(r.deadline).toBe('2026-10-24T12:00:00.000Z');
    }
  });

  it('outside window → honestly refused with the deadline', () => {
    const old = charge({ created: Math.floor(new Date('2026-09-01T12:00:00Z').getTime() / 1000) });
    const r = refundEligibility([old], NOW);
    expect(r.eligible).toBe(false);
    if (!r.eligible) {
      expect(r.reason).toBe('outside_window');
      expect(r.deadline).toBe('2026-09-15T12:00:00.000Z');
    }
  });

  it('already-refunded charge → refused, never a second refund', () => {
    const refunded = charge({ refunded: true, amount_refunded: 3900 });
    const r1 = refundEligibility([refunded], NOW);
    expect(r1.eligible).toBe(false);
    if (!r1.eligible) expect(r1.reason).toBe('already_refunded');
    const partial = charge({ refunded: false, amount_refunded: 3900 });
    const r2 = refundEligibility([partial], NOW);
    expect(r2.eligible).toBe(false);
    if (!r2.eligible) expect(r2.reason).toBe('already_refunded');
  });

  it('no payment → no_payment, never an invented eligibility', () => {
    const r = refundEligibility([], NOW);
    expect(r.eligible).toBe(false);
    if (!r.eligible) {
      expect(r.reason).toBe('no_payment');
      expect(r.deadline).toBeNull();
    }
  });

  it('window starts at the FIRST payment — a later renewal does not extend it', () => {
    const charges = [
      charge({ id: 'ch_first', created: Math.floor(new Date('2026-09-01T12:00:00Z').getTime() / 1000) }),
      charge({ id: 'ch_renewal', created: Math.floor(new Date('2026-10-10T12:00:00Z').getTime() / 1000) }),
    ];
    const r = refundEligibility(charges, NOW);
    expect(r.eligible).toBe(false);
    if (!r.eligible) expect(r.reason).toBe('outside_window');
  });
});

describe('money-back wiring (source-level)', () => {
  it('refund route derives identity from the session — never a client userId', () => {
    const src = read('app/api/billing/refund/route.ts');
    expect(src).toContain('supabase.auth.getUser()');
    expect(src).not.toMatch(/const \{ userId \}.*req\.json|body.*userId/);
    expect(src).toContain('/v1/refunds');
    expect(src).toContain('requested_by_customer');
    expect(src).toContain('outside_window');
    expect(src).toContain('already_refunded');
  });

  it('refund cancels the subscription so the user is not charged again', () => {
    const src = read('app/api/billing/refund/route.ts');
    // QA fix-all: id is URL-encoded and the cancel is tagged so the
    // webhook does not send a second "cancelled" email.
    expect(src).toContain('/v1/subscriptions/${encodeURIComponent(subscriptionId)}');
    expect(src).toContain('money_back_refund');
    expect(src).toContain("method: 'DELETE'");
    expect(src).toContain('cancelWarning');
  });

  it('eligibility route reads Stripe charges as the source of truth', () => {
    const src = read('app/api/billing/refund-eligibility/route.ts');
    // QA fix-all: charges are paged (has_more) via lib/moneyBack.
    expect(src).toContain('listAllCharges(stripeChargesPager(');
    expect(src).toContain('refundEligibility(');
  });

  it('billing page shows the refund section with a two-step confirm', () => {
    const src = read('app/dashboard/billing/page.tsx');
    expect(src).toContain('RefundSection');
    expect(src).toContain('/api/billing/refund-eligibility');
    expect(src).toContain('Request a refund');
    expect(src).toContain('Confirm refund');
    expect(src).toContain('Keep my plan');
    expect(src).toContain('will also cancel your subscription');
  });

  it('terms point to the self-serve billing-page refund first', () => {
    const src = read('app/terms/page.tsx');
    expect(src).toContain('request a full refund from your billing page within 14 days');
    expect(src).toContain('hello@rankall.io');
  });

  it('pricing FAQ answers how to get a refund', () => {
    const src = read('app/pricing/PricingClient.tsx');
    expect(src).toContain('How do I get a refund?');
    expect(src).toContain('request a full refund from your billing page');
  });
});
