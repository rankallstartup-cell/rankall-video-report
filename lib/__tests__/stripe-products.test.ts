import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getStripePrice, isConfiguredPriceId, isStripeReady, getPriceConfigStatus } from '../stripeProducts';

describe('stripeProducts price configuration', () => {
  const saved = process.env.STRIPE_SECRET_KEY;
  beforeEach(() => { process.env.STRIPE_SECRET_KEY = 'sk_test_x'; });
  afterEach(() => { if (saved === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = saved; });

  it('returns null for REPLACE_ placeholders (annual) so checkout shows the waitlist', () => {
    for (const plan of ['starter', 'business', 'agency', 'personal_pro']) {
      expect(getStripePrice(plan, 'annual')).toBeNull();
    }
  });

  it('returns the real monthly ids', () => {
    expect(getStripePrice('business', 'monthly')).toMatch(/^price_/);
    expect(getStripePrice('personal_pro', 'monthly')).toBe('price_1U0mtNGZWEa0XL3VKapQ65W0');
    expect(getStripePrice('nope', 'monthly')).toBeNull();
  });

  it('returns null for everything when the Stripe key is unset', () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(getStripePrice('business', 'monthly')).toBeNull();
    expect(isStripeReady()).toBe(false);
  });

  it('isConfiguredPriceId rejects placeholders and blanks', () => {
    expect(isConfiguredPriceId('REPLACE_WITH_STRIPE_PRICE_ID')).toBe(false);
    expect(isConfiguredPriceId('')).toBe(false);
    expect(isConfiguredPriceId(null)).toBe(false);
    expect(isConfiguredPriceId('price_123')).toBe(true);
  });

  it('status report lists configured prices as booleans only', () => {
    const s = getPriceConfigStatus();
    expect(s.stripeKeySet).toBe(true);
    expect(s.prices.business_monthly).toBe(true);
    expect(s.prices.business_annual).toBe(false);
    expect(JSON.stringify(s)).not.toContain('price_');
  });
});
