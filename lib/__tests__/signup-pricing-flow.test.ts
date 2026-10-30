import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tierKeyFromParams } from '../pricingParams';
import { TRIAL_MAX_LOCATIONS } from '../trialCaps';

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8');

describe('pricing ?plan= / ?upgrade= preselect', () => {
  it('maps known values, including the upgrade=local_pro alias', () => {
    expect(tierKeyFromParams('?upgrade=local_pro')).toBe('business');
    expect(tierKeyFromParams('?plan=agency')).toBe('agency');
    expect(tierKeyFromParams('?plan=personal_pro')).toBe('personal_pro');
    expect(tierKeyFromParams('?plan=Business')).toBe('business');
    expect(tierKeyFromParams('?plan=enterprise')).toBeNull();
    expect(tierKeyFromParams('')).toBeNull();
  });
  it('the pricing page uses it to highlight the chosen card', () => {
    const src = read('app/pricing/PricingClient.tsx');
    expect(src).toContain('tierKeyFromParams(window.location.search)');
    expect(src).toContain('id={`tier-${t.key}`}');
  });
});

describe('signup flow (ax6p)', () => {
  const src = read('app/signup/page.tsx');
  it('Agency is a normal paid plan (no beta waitlist dead end) with a demo door', () => {
    expect(src).toContain("{ name: 'Agency', price: `$${PRICE_AGENCY_USD}/mo`, desc: 'White-label + multi-client', beta: false }");
    expect(src).toContain('href="/agency/demo"');
  });
  it('lists Free once', () => {
    expect(src.match(/\{ name: 'Free'/g)?.length).toBe(1);
  });
  it('OAuth + email confirmation use the current origin and carry a SAFE next', () => {
    expect(src).not.toContain('https://www.rankall.io');
    expect(src).toContain("new URL('/auth/callback', window.location.origin)");
    expect(src).toContain('signupNextFromSearch(window.location.search, window.location.origin)');
    expect(src).toContain('emailRedirectTo: callbackUrl()');
    expect(src).toContain('redirectTo: callbackUrl({ intended_plan: planKey })');
  });
  it('resend success uses success styling, not the error box', () => {
    expect(src).toContain("setNotice('Confirmation email resent");
    expect(src).not.toContain("setError(resendError ? resendError.message : 'Confirmation email resent");
  });
});

describe('trial FAQ states the caps', () => {
  it('no "Full access" promise; caps come from lib/trialCaps', () => {
    const src = read('app/pricing/PricingClient.tsx');
    expect(src).not.toContain('Full access to your chosen plan');
    expect(src).toContain('${TRIAL_MAX_LOCATIONS} business location');
    expect(src).toContain('no PDF report exports or white-label');
    expect(TRIAL_MAX_LOCATIONS).toBe(1);
  });
  it('waitlist banner heading follows the server reason', () => {
    const src = read('app/pricing/PricingClient.tsx');
    expect(src).toContain("waitlistNotice.reason === 'stripe_not_configured'");
  });
});
