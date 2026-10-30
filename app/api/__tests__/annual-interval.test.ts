import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ax6p: the annual interval was dropped through both fallbacks —
// create-checkout returned a bare '/waitlist' (plan AND interval
// lost; the entry was stored as plan 'general', monthly), and the
// pricing page's 401 path routed to /signup?plan= with no interval,
// so an annual buyer silently became monthly.
describe('ax6p annual interval preserved', () => {
  it('checkout waitlist URLs carry plan + interval', () => {
    const checkout = readFileSync(
      join(process.cwd(), 'app/api/billing/create-checkout/route.ts'), 'utf8');
    expect(checkout).toContain('waitlist?plan=');
    expect(checkout).toContain('&interval=');
    expect(checkout).not.toContain("waitlistUrl: '/waitlist'");
  });

  it('pricing 401 path carries the interval to signup', () => {
    const pricing = readFileSync(
      join(process.cwd(), 'app/pricing/PricingClient.tsx'), 'utf8');
    expect(pricing).toContain('signup?plan=');
    expect(pricing).toContain('&interval=${annual');
  });

  it('waitlist accepts, shows, and stores the interval', () => {
    const waitlist = readFileSync(
      join(process.cwd(), 'app/waitlist/page.tsx'), 'utf8');
    expect(waitlist).toContain("get('interval')");
    expect(waitlist).toContain(':annual');
    expect(waitlist).toContain('annual billing');
  });

  it('signup persists the interval and billing uses it', () => {
    const signup = readFileSync(
      join(process.cwd(), 'app/signup/page.tsx'), 'utf8');
    expect(signup).toContain('rankall_intended_interval');
    // QA fix-all: the billing page no longer starts checkout (that was the
    // retired in-app-trial "add payment method" path — card-upfront
    // trialing users manage billing in the portal), so it has no interval
    // to carry. Checkout is started from /pricing, which carries it.
    const billing = readFileSync(
      join(process.cwd(), 'app/dashboard/billing/page.tsx'), 'utf8');
    expect(billing).not.toContain("interval: 'monthly'");
    expect(billing).not.toContain("fetch('/api/billing/create-checkout'");
  });
});
