import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// QA fix-all (replaces b063): b063 asserted the retired in-app / no-card
// trial — trialing users had no Stripe customer, so the billing page sent
// them to create-checkout to "add a payment method". Trials are now Stripe
// trials with the card collected UPFRONT: a trialing user already has a
// Stripe customer + subscription + card on file, so the trialing card
// manages billing in the Stripe portal (and must NOT open a second
// checkout, which would create a second subscription).
describe('card-upfront trial — billing page', () => {
  const page = readFileSync(join(process.cwd(), 'app/dashboard/billing/page.tsx'), 'utf8');
  const trialBlock = page.slice(
    page.indexOf("{state === 'trialing' && ("),
    page.indexOf('{/* 4 — Payment failed / past due */}'),
  );

  it('trialing block says the card on file is charged at trial end and uses the portal', () => {
    expect(trialBlock.length).toBeGreaterThan(0);
    expect(trialBlock).toContain('Your card on file will be charged when the trial ends');
    expect(trialBlock).toContain('PortalButton');
    expect(trialBlock).not.toContain('create-checkout');
    expect(trialBlock).not.toContain('Add Payment Method');
  });

  it('portal is session-derived (no body userId) and still requires a real Stripe customer', () => {
    expect(page).not.toContain('JSON.stringify({ userId })');
    const portal = readFileSync(join(process.cwd(), 'app/api/billing/portal/route.ts'), 'utf8');
    expect(portal).toContain('No active subscription found');
    expect(portal).not.toContain('request.json()');
  });

  it('billing state is read from app_metadata, never user_metadata', () => {
    expect(page).toContain('userData?.user?.app_metadata');
    expect(page).not.toContain('userData?.user?.user_metadata');
  });
});
