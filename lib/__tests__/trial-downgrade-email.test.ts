import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { downgradeEmail, staleCanceledReason } from '../trialDowngradeEmail';

describe('stale canceled trial → correct email', () => {
  it('user-cancelled trial never gets the "payment failed" email', () => {
    const r1 = staleCanceledReason({ status: 'canceled', cancellation_details: { reason: 'cancellation_requested' } });
    const r2 = staleCanceledReason({ status: 'canceled', cancel_at_period_end: true });
    for (const r of [r1, r2]) {
      expect(r).toBe('trial_cancelled');
      const e = downgradeEmail(r);
      expect(e.html).toContain('you were not charged');
      expect(e.html).not.toMatch(/couldn't process your payment|grace/i);
    }
  });
  it('payment failure at trial end gets a payment email without the grace claim', () => {
    const r = staleCanceledReason({ status: 'canceled', cancellation_details: { reason: 'payment_failed' } });
    expect(r).toBe('trial_payment_failed');
    expect(downgradeEmail(r).html).not.toContain('3-day grace');
  });
  it('unknown reason → neutral email', () => {
    const r = staleCanceledReason({ status: 'canceled' });
    expect(r).toBe('ended');
    expect(downgradeEmail(r).html).not.toMatch(/payment|cancelled before/i);
  });
  it('grace expiry keeps the original copy', () => {
    expect(downgradeEmail('grace_expired').html).toContain('3-day grace period');
  });
  it('expire-trials pass 2 uses the Stripe-derived reason', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/cron/expire-trials/route.ts'), 'utf8');
    expect(src).toContain('downgradeToFree(row.user_id, null, staleCanceledReason(stripeSub))');
  });
});
