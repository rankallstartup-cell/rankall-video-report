import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { intervalFromParams, annualConfigured } from '../pricingParams';

// Fix round 2: /signup saved rankall_intended_interval but nothing read
// it, so an annual buyer silently checked out monthly after onboarding.
describe('intervalFromParams', () => {
  it('?interval= wins', () => {
    expect(intervalFromParams('?plan=agency&interval=annual', 'monthly')).toBe('annual');
    expect(intervalFromParams('?interval=monthly', 'annual')).toBe('monthly');
  });
  it('falls back to the interval stored at signup', () => {
    expect(intervalFromParams('?plan=agency', 'annual')).toBe('annual');
    expect(intervalFromParams('', null)).toBe('monthly');
    expect(intervalFromParams('?interval=weird', 'junk')).toBe('monthly');
  });
});

describe('annualConfigured', () => {
  it('reads the billing status price map', () => {
    expect(annualConfigured('agency', { agency_annual: false, agency_monthly: true })).toBe(false);
    expect(annualConfigured('business', { business_annual: true })).toBe(true);
    expect(annualConfigured('business', null)).toBeNull();
  });
});

describe('wiring', () => {
  const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8');
  it('pricing reads the stored interval and warns before an unconfigured annual checkout', () => {
    const src = read('app/pricing/PricingClient.tsx');
    expect(src).toContain('localStorage.getItem(INTENDED_INTERVAL_KEY)');
    expect(src).toContain('annualConfigured(plan, priceConfig) === false');
  });
  it('homepage upgrade banner carries the interval to /pricing', () => {
    expect(read('app/page.tsx')).toContain('&interval=${upgradeInterval}');
  });
});
