import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// b28f (founder decision, corrected): paid plans get a 7-day free trial
// with the credit card collected UPFRONT, before the trial starts. The
// card is NOT charged until the trial ends (cancel anytime before then
// and you pay nothing). The trial length lives in code
// (TRIAL_PERIOD_DAYS in create-checkout), not in the Stripe dashboard.
// Source-level checks: the billing routes call Stripe via fetch and
// the webhook reads Stripe events, so the params/event handling are
// asserted against source.
const checkoutSrc = readFileSync(join(process.cwd(), 'app/api/billing/create-checkout/route.ts'), 'utf8');
const webhookSrc = readFileSync(join(process.cwd(), 'app/api/billing/webhook/route.ts'), 'utf8');

describe('7-day card-upfront trial — b28f checkout', () => {
  it('sets a 7-day trial on the Stripe subscription (code is the source of truth, not the Stripe dashboard)', () => {
    expect(checkoutSrc).toContain('TRIAL_PERIOD_DAYS = 7');
    expect(checkoutSrc).toContain("'subscription_data[trial_period_days]': String(TRIAL_PERIOD_DAYS)");
  });

  it('requires the card at trial start (payment_method_collection always — card collected before the trial, charged only when it ends)', () => {
    expect(checkoutSrc).toContain("payment_method_collection: 'always'");
    // QA fix-all: the retired in-app-trial path overrode this to
    // 'if_required' and sent subscription_data[trial_end]; both are gone.
    expect(checkoutSrc).not.toContain("payment_method_collection: 'if_required'");
    expect(checkoutSrc).not.toContain("'subscription_data[trial_end]'");
  });

  it('one trial per account: the trial param is conditional on eligibility', () => {
    expect(checkoutSrc).toContain('isTrialEligible(');
    expect(checkoutSrc).toContain("...(trialEligible ? { 'subscription_data[trial_period_days]'");
  });

  it('never reads Stripe ids from user_metadata', () => {
    expect(checkoutSrc).not.toContain('user.user_metadata');
    expect(checkoutSrc).not.toContain('updateUser({ data');
  });
});

describe('7-day card-upfront trial — b28f webhook', () => {
  it('handles customer.subscription.created (trial starts there, not at checkout)', () => {
    expect(webhookSrc).toContain("type === 'customer.subscription.created'");
  });

  it('records trialing status + trial_end from Stripe (Stripe owns trial_end)', () => {
    // QA fix-all: the row is built from the CURRENT Stripe subscription
    // (lib/stripeWebhook.buildSubscriptionUpsert), so event order cannot
    // turn 'trialing' into 'active'.
    expect(webhookSrc).toContain("status === 'trialing'");
    expect(webhookSrc).toContain('buildSubscriptionUpsert');
    expect(webhookSrc).toContain('fetchStripeSubscription');
    expect(webhookSrc).toContain('obj?.trial_end');
  });

  it('sends a trial-start email that says 7-day, card on file, nothing charged until the trial ends', () => {
    expect(webhookSrc).toContain('7-day free trial has started');
    expect(webhookSrc).toContain('Your card is on file');
    expect(webhookSrc).toContain('won’t be charged until the trial ends');
    expect(webhookSrc).not.toContain('No card was collected');
  });
});

// b28f copy sweep: every user-facing "14-day free trial" becomes a
// 7-day card-required trial. The 14-day MONEY-BACK guarantee is a
// separate promise and must stay 14 days — the sweep must not touch it.
// Files with other 14-day mentions (re-engagement "14 days since",
// rescan timelines) are NOT trial copy and are NOT touched.
const copyFiles = [
  'app/agency/page.tsx',
  'app/dashboard/page.tsx',
  'app/personal/PersonalClient.tsx',
  'app/pricing/PricingClient.tsx',
  'app/r/[id]/page.tsx',
  'app/signup/page.tsx',
  'lib/constants.ts',
  'components/TimedPopup.tsx',
  'app/intelligence-graph/page.tsx',
  'app/vs/page.tsx',
  'app/report/[id]/page.tsx',
  'app/api/cron/winback-email/route.ts',
];

describe('7-day trial copy — no stale 14-day trial copy', () => {
  for (const f of copyFiles) {
    it(`${f} has no "14-day free trial" copy left`, () => {
      const src = readFileSync(join(process.cwd(), f), 'utf8');
      expect(src).not.toContain('14-day free trial');
      expect(src).not.toContain('14 days free');
      expect(src).not.toContain('free 14-day trial');
      expect(src).not.toContain('14-day free trial, no card required');
    });
  }

  it('pricing FAQ says 7 days + card required, not 14', () => {
    const src = readFileSync(join(process.cwd(), 'app/pricing/PricingClient.tsx'), 'utf8');
    expect(src).toContain('for 7 days');
    expect(src).toContain('7-day free trial');
    expect(src).toContain('A card is required to start the trial');
    expect(src).toContain('will not be charged until the trial ends');
  });

  it('pricing plan notes say card required', () => {
    const src = readFileSync(join(process.cwd(), 'app/pricing/PricingClient.tsx'), 'utf8');
    expect(src).toContain('7-day free trial · Card required · Cancel anytime');
    // The Free tier still needs no card — its note is untouched.
    expect(src).toContain('No credit card required');
  });

  it('signup says 7-day trial + card required for paid plans, Free still needs no card', () => {
    const src = readFileSync(join(process.cwd(), 'app/signup/page.tsx'), 'utf8');
    expect(src).toContain('Start your 7-day free trial');
    expect(src).toContain('7-day free trial');
    expect(src).toContain('Card required. Nothing charged until the trial ends.');
    // Free branch untouched.
    expect(src).toContain('No credit card required. Free forever.');
    expect(src).toContain("'Start free'");
  });

  it('generic site-wide no-card badges are scoped to the free scan, not the paid trial', () => {
    const footer = readFileSync(join(process.cwd(), 'components/SiteChrome.tsx'), 'utf8');
    expect(footer).toContain('Free scan · No card needed');
    const home = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8');
    // The footer badge now lives in the shared SiteChrome footer (checked above).
    expect(home).toContain('Free Scan · No Card Needed');
  });

  it('14-day money-back guarantee is untouched (separate promise)', () => {
    const home = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8');
    expect(home).toContain('14-day money back guarantee');
    const terms = readFileSync(join(process.cwd(), 'app/terms/page.tsx'), 'utf8');
    expect(terms).toContain('14-day money-back guarantee');
  });
});
