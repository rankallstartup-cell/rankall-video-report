/* eslint-disable @typescript-eslint/no-explicit-any -- loose Supabase/Stripe mocks */
import { describe, it, expect, vi } from 'vitest';
import { clientIpFromHeaders, rateLimitWindowKey, checkRateLimitDb } from '../rateLimit';
import { isTrialEligible, decideFingerprintClaim } from '../trialAntiAbuse';
import {
  refundAlreadyClaimed,
  chargeCardFingerprint,
  listAllCharges,
  refundEligibility,
} from '../moneyBack';

const h = (o: Record<string, string>) => new Headers(o);

describe('rate limiter key derivation', () => {
  it('prefers x-real-ip, then x-vercel-forwarded-for, then the LAST XFF hop', () => {
    expect(clientIpFromHeaders(h({ 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1, 9.9.9.9' }))).toBe('9.9.9.9');
    expect(clientIpFromHeaders(h({ 'x-vercel-forwarded-for': '8.8.8.8', 'x-forwarded-for': '1.1.1.1' }))).toBe('8.8.8.8');
    // A spoofed first entry is ignored.
    expect(clientIpFromHeaders(h({ 'x-forwarded-for': 'spoofed, 7.7.7.7' }))).toBe('7.7.7.7');
    expect(clientIpFromHeaders(h({}))).toBe('unknown');
  });

  it('fixed-window keys are stable within a window and change across windows', () => {
    const hour = 60 * 60 * 1000;
    const t = Date.parse('2026-10-16T10:15:00Z');
    const a = rateLimitWindowKey('checkout:user', 'u1', hour, t);
    const b = rateLimitWindowKey('checkout:user', 'u1', hour, t + 30 * 60 * 1000);
    const c = rateLimitWindowKey('checkout:user', 'u1', hour, t + hour);
    expect(a.key).toBe(b.key);
    expect(a.key).not.toBe(c.key);
    expect(a.key.startsWith('checkout:user:u1:')).toBe(true);
    expect(a.windowStart).toBe('2026-10-16T10:00:00.000Z');
    expect(rateLimitWindowKey('checkout:ip', 'u1', hour, t).key).not.toBe(a.key);
  });

  it('uses the DB count when available and falls back to memory when the table is missing', async () => {
    const ok = { rpc: vi.fn(async () => ({ data: 6, error: null })) };
    expect(await checkRateLimitDb('b', 's', { limit: 5, windowMs: 1000 }, ok)).toMatchObject({ allowed: false, source: 'db' });
    const missing = { rpc: vi.fn(async () => ({ data: null, error: { code: 'PGRST202', message: 'function not found' } })) };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await checkRateLimitDb('b2', 's2', { limit: 5, windowMs: 1000 }, missing);
    expect(r).toMatchObject({ allowed: true, source: 'memory' });
    spy.mockRestore();
  });
});

describe('one trial per account', () => {
  it('fresh account with no customer gets a trial', () => {
    expect(isTrialEligible({ hasSubscriptionRow: false, stripeSubscriptions: null, hadStripeCustomer: false })).toBe(true);
  });
  it('any prior subscriptions row → no trial', () => {
    expect(isTrialEligible({ hasSubscriptionRow: true, stripeSubscriptions: [], hadStripeCustomer: true })).toBe(false);
  });
  it('a Stripe customer that ever trialed → no trial', () => {
    expect(isTrialEligible({ hasSubscriptionRow: false, stripeSubscriptions: [{ trial_start: 1 }], hadStripeCustomer: true })).toBe(false);
    expect(isTrialEligible({ hasSubscriptionRow: false, stripeSubscriptions: [{ trial_start: null }], hadStripeCustomer: true })).toBe(true);
  });
  it('unknown state (lookup failed) → no trial', () => {
    expect(isTrialEligible({ hasSubscriptionRow: null, stripeSubscriptions: null, hadStripeCustomer: false })).toBe(false);
    expect(isTrialEligible({ hasSubscriptionRow: false, stripeSubscriptions: null, hadStripeCustomer: true })).toBe(false);
  });
});

describe('one trial per card', () => {
  const rows = [
    { id: 2, stripe_subscription_id: 'sub_b', created_at: '2026-10-02T00:00:00Z' },
    { id: 1, stripe_subscription_id: 'sub_a', created_at: '2026-10-01T00:00:00Z' },
  ];
  it('earliest subscription keeps its trial, later ones are repeats', () => {
    expect(decideFingerprintClaim(rows, 'sub_a')).toBe('first');
    expect(decideFingerprintClaim(rows, 'sub_b')).toBe('repeat');
    expect(decideFingerprintClaim([], 'sub_a')).toBe('unknown');
  });
});

describe('money-back: once per person across customers', () => {
  const day = 86400;
  const now = new Date('2026-10-16T00:00:00Z');
  const charge = (id: string, fp: string, created: number) => ({
    id, status: 'succeeded', paid: true, amount: 3900, currency: 'usd', created,
    payment_method_details: { card: { fingerprint: fp } },
  });

  it('a new Stripe customer with a fresh charge looks eligible on its own…', () => {
    const c = charge('ch_new', 'fp_card', Math.floor(now.getTime() / 1000) - 2 * day);
    expect(refundEligibility([c], now).eligible).toBe(true);
    expect(chargeCardFingerprint(c)).toBe('fp_card');
  });

  it('…but a prior claim by the same card (other account/customer) blocks it', () => {
    expect(refundAlreadyClaimed([{ user_id: 'other-user', card_fingerprint: 'fp_card' }], 'me', 'fp_card')).toBe(true);
  });

  it('a prior claim by the same user blocks it even with a new card', () => {
    expect(refundAlreadyClaimed([{ user_id: 'me', card_fingerprint: 'fp_old' }], 'me', 'fp_new')).toBe(true);
  });

  it('unrelated claims do not block', () => {
    expect(refundAlreadyClaimed([{ user_id: 'x', card_fingerprint: 'fp_x' }], 'me', 'fp_card')).toBe(false);
    expect(refundAlreadyClaimed([{ user_id: 'x', card_fingerprint: null }], 'me', null)).toBe(false);
  });

  it('pages through all charges so the FIRST payment is found past 100', async () => {
    const old = charge('ch_first', 'fp', 1000);
    const pages: Record<string, { data: any[]; has_more: boolean }> = {
      start: { data: Array.from({ length: 100 }, (_, i) => charge(`ch_${i}`, 'fp', 2000 + i)), has_more: true },
      ch_99: { data: [old], has_more: false },
    };
    const getPage = vi.fn(async (after: string | null) => pages[after ?? 'start']);
    const all = await listAllCharges(getPage);
    expect(all).toHaveLength(101);
    expect(getPage).toHaveBeenCalledTimes(2);
    const e = refundEligibility(all, new Date(2000 * 1000));
    expect(e.chargeId).toBe('ch_first');
  });

  it('a failed page aborts (null) rather than deciding on partial data', async () => {
    expect(await listAllCharges(async () => null)).toBeNull();
  });
});
