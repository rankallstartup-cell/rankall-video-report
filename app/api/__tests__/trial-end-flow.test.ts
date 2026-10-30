import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  TRIAL_GRACE_DAYS,
  TRIAL_WARNING_DAYS,
  trialDaysLeft,
  trialEndDateLabel,
  graceDeadline,
  isPastGrace,
  wasWarnedRecently,
  extractChargeAmount,
} from '@/lib/trialEnd';

// b28h: trial-end flow — charge the card on file at trial end, grace on
// failure, downgrade to Free after grace. Never hard-cut, never delete data.
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('lib/trialEnd — pure helpers', () => {
  it('trialDaysLeft uses ceiling whole days', () => {
    const now = new Date('2026-10-15T12:00:00Z');
    expect(trialDaysLeft('2026-10-18T12:00:00Z', now)).toBe(3);
    expect(trialDaysLeft('2026-10-16T00:00:00Z', now)).toBe(1); // 12h left -> 1
    expect(trialDaysLeft('2026-10-15T12:00:00Z', now)).toBe(0);
    expect(trialDaysLeft('2026-10-14T12:00:00Z', now)).toBe(-1);
    expect(trialDaysLeft(null, now)).toBe(0);
  });

  it('trialEndDateLabel formats a readable date', () => {
    expect(trialEndDateLabel('2026-03-05T00:00:00Z')).toContain('2026');
    expect(trialEndDateLabel(null)).toBe('');
  });

  it('grace period is 3 days and a missing timestamp is never past grace', () => {
    expect(TRIAL_GRACE_DAYS).toBe(3);
    expect(TRIAL_WARNING_DAYS).toBe(3);
    const failedAt = '2026-10-15T12:00:00Z';
    expect(graceDeadline(failedAt)).toBe('2026-10-18T12:00:00.000Z');
    expect(isPastGrace(failedAt, new Date('2026-10-17T12:00:00Z'))).toBe(false);
    expect(isPastGrace(failedAt, new Date('2026-10-19T12:00:00Z'))).toBe(true);
    expect(isPastGrace(null, new Date('2027-01-01T00:00:00Z'))).toBe(false);
    expect(graceDeadline(null)).toBeNull();
  });

  it('wasWarnedRecently dedups within 7 days only', () => {
    const now = new Date('2026-10-15T12:00:00Z');
    expect(wasWarnedRecently({ trial_warning_sent_at: '2026-10-14T12:00:00Z' }, now)).toBe(true);
    expect(wasWarnedRecently({ trial_warning_sent_at: '2026-10-01T12:00:00Z' }, now)).toBe(false);
    expect(wasWarnedRecently({}, now)).toBe(false);
    expect(wasWarnedRecently(null, now)).toBe(false);
  });

  it('extractChargeAmount reads Stripe amounts and never invents one', () => {
    expect(
      extractChargeAmount({ items: { data: [{ price: { unit_amount: 3900, currency: 'usd' } }] } }),
    ).toBe('$39');
    expect(
      extractChargeAmount({ items: { data: [{ price: { unit_amount: 25900, currency: 'usd' } }] } }),
    ).toBe('$259');
    expect(extractChargeAmount({})).toBeNull();
    expect(extractChargeAmount(null)).toBeNull();
    expect(extractChargeAmount({ items: { data: [] } })).toBeNull();
  });
});

describe('trial-end flow — wiring', () => {
  it('webhook warns before expiry via trial_will_end and dedups', () => {
    const webhook = read('app/api/billing/webhook/route.ts');
    expect(webhook).toContain('customer.subscription.trial_will_end');
    expect(webhook).toContain('trial_warning_sent_at');
    expect(webhook).toContain('will be charged');
  });

  it('webhook sends a conversion email on trialing -> active and clears the grace flag', () => {
    const webhook = read('app/api/billing/webhook/route.ts');
    // QA fix-all: the previous row comes from applySubscriptionState.
    expect(webhook).toContain("previous?.status === 'trialing'");
    expect(webhook).toContain('trial ended');
    expect(webhook).toContain('payment_failed_at: null');
  });

  it('webhook stamps the grace clock first-write-wins and states the deadline', () => {
    const webhook = read('app/api/billing/webhook/route.ts');
    expect(webhook).toContain('stampPaymentFailedAt');
    expect(webhook).toContain('payment_failed_at');
    expect(webhook).toContain('3 days');
    expect(webhook).toContain('move to Free');
  });

  it('webhook downgrade clears BOTH metadata buckets (b062 follow-through)', () => {
    const webhook = read('app/api/billing/webhook/route.ts');
    // QA fix-all: syncPlanMetadata writes app_metadata (trusted) and the
    // display copy; the deleted handler downgrades through it.
    expect(webhook).toContain("account_type: 'free'");
    expect(webhook).toContain('app_metadata');
  });

  it('expire-trials cron has reminder, stale-trialing reconciliation, and grace-expiry passes', () => {
    const cron = read('app/api/cron/expire-trials/route.ts');
    expect(cron).toContain('trial_warning_sent_at');
    expect(cron).toContain('isPastGrace');
    expect(cron).toContain('downgradeToFree');
    // Never downgrade on an unverified state: Stripe is checked first.
    expect(cron).toContain("stripeFetch(`subscriptions/");
    expect(cron).toContain('unverified');
    // Downgrade clears both buckets and never deletes data.
    expect(cron).toContain('app_metadata');
    expect(cron).toContain('expired');
  });

  it('vercel.json schedules the expire-trials cron', () => {
    const vercel = read('vercel.json');
    expect(vercel).toContain('/api/cron/expire-trials');
  });

  it('usePlan exposes trialEndsAt; dashboard layout renders the banner; billing has a trialing state', () => {
    const usePlan = read('lib/usePlan.ts');
    expect(usePlan).toContain('trialEndsAt');
    expect(usePlan).toContain('trial_end');
    const layout = read('app/dashboard/layout.tsx');
    expect(layout).toContain('TrialCountdownBanner');
    expect(layout).toContain('isTrialing');
    const billing = read('app/dashboard/billing/page.tsx');
    expect(billing).toContain("'trialing'");
    expect(billing).toContain('trialEndsAt');
    expect(billing).toContain('card on file');
  });

  it('banner hides once the trial is over and states the card-on-file truth', () => {
    const banner = read('components/TrialCountdownBanner.tsx');
    expect(banner).toContain('if (days < 0) return null');
    expect(banner).toContain('card on file will be charged');
  });
});
