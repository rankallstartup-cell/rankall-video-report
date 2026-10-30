// A3 — get_pricing + PricingCard data. Prices come ONLY from
// lib/publicStats.ts (FOUNDER_PRICING_USD); this test pins that the tool
// returns exactly the 8 founder tiers with the exact founder prices, the
// signup-page's own ?plan= keys (never an invented link), and /contact
// for tiers the signup page has no key for.
import { describe, it, expect } from 'vitest';
import {
  getPricing,
  getPricingBlock,
  detectPricingIntent,
  detectPricingNeed,
} from '@/lib/alinaTools';
import { FOUNDER_PRICING_USD } from '@/lib/publicStats';

// The signup page's ?plan= map (app/signup/page.tsx). Unknown keys show
// a visible "We don't offer…" notice — the tool must never emit one.
const SIGNUP_KEYS = ['local_pro', 'personal_pro', 'product_pro', 'agency'];

describe('getPricing', () => {
  it('returns exactly the 8 founder tiers at the exact founder prices', () => {
    const { tiers, trial } = getPricing();
    expect(tiers).toHaveLength(8);
    expect(tiers.map((t) => t.name)).toEqual(FOUNDER_PRICING_USD.map((t) => t.name));
    for (const t of tiers) {
      const founder = FOUNDER_PRICING_USD.find((f) => f.name === t.name)!;
      expect(t.monthly).toBe(founder.monthly);
      expect(t.blurb).toBe(founder.blurb);
    }
    expect(trial).toEqual({ days: 7, cardRequired: true, locations: 1 });
  });

  it('narrows to the matching tier for a need, never inventing one', () => {
    expect(getPricing('agency').tiers).toEqual([
      expect.objectContaining({ name: 'Agency', monthly: 259 }),
    ]);
    expect(getPricing('personal').tiers).toEqual([
      expect.objectContaining({ name: 'Personal Brand Pro', monthly: 15 }),
    ]);
    expect(getPricing('enterprise').tiers).toEqual([
      expect.objectContaining({ name: 'Enterprise', monthly: 499 }),
    ]);
    expect(getPricing('global').tiers).toEqual([
      expect.objectContaining({ name: 'Global Brand Intelligence', monthly: 999 }),
    ]);
  });

  it('signup CTAs use only the signup page\'s own ?plan= keys; keyless tiers get /contact', () => {
    const { tiers } = getPricing();
    for (const t of tiers) {
      if (['Local Pro', 'Personal Brand Pro', 'Product Pro', 'Agency'].includes(t.name)) {
        expect(t.cta.label).toBe('Start free trial');
        const key = new URL(t.cta.href, 'http://x').searchParams.get('plan');
        expect(SIGNUP_KEYS).toContain(key);
        expect(t.cta.href.startsWith('/signup?plan=')).toBe(true);
      } else {
        expect(t.cta).toEqual({ label: 'Contact Us', href: '/contact' });
      }
    }
    // Spot-check the two acceptance-critical links.
    expect(tiers.find((t) => t.name === 'Agency')!.cta.href).toBe('/signup?plan=agency');
    expect(tiers.find((t) => t.name === 'Personal Brand Pro')!.cta.href).toBe('/signup?plan=personal_pro');
  });
});

describe('pricing intent + need detection (interim, until A6 tool loop)', () => {
  it('detects pricing questions', () => {
    for (const q of [
      'How much is Agency?',
      'What does it cost?',
      'Is there a trial?',
      'Which plan fits me?',
      'Show me pricing',
    ]) {
      expect(detectPricingIntent(q)).toBe(true);
    }
  });

  it('does not fire on scan / fix questions', () => {
    for (const q of [
      'Why is my score 41?',
      'What do I fix first?',
      'Who is AI naming instead of me?',
      'Hello',
    ]) {
      expect(detectPricingIntent(q)).toBe(false);
    }
  });

  it('detects the named tier, broadest (local) last', () => {
    expect(detectPricingNeed('How much is Agency?')).toBe('agency');
    expect(detectPricingNeed('personal brand pricing')).toBe('personal');
    expect(detectPricingNeed('I run a local bakery, what plan?')).toBe('local');
    expect(detectPricingNeed('Do you have enterprise options?')).toBe('enterprise');
    expect(detectPricingNeed('hello')).toBeNull();
  });
});

describe('getPricingBlock', () => {
  it('returns a pricing block for a pricing question, null otherwise', () => {
    const block = getPricingBlock('How much is Agency?');
    expect(block).toEqual({
      kind: 'pricing',
      tiers: [expect.objectContaining({ name: 'Agency', monthly: 259 })],
      trial: { days: 7, cardRequired: true, locations: 1 },
    });
    expect(getPricingBlock('Why is my score 41?')).toBeNull();
    expect(getPricingBlock('How much does it cost?')!.tiers).toHaveLength(8);
  });
});
