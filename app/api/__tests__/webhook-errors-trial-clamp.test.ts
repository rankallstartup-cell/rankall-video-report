import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ax6m residual, updated for the QA fix-all:
//  - The trial_end clamp (clampTrialEndUnix) existed only for the retired
//    in-app trial path ("Stripe takes over at the in-app trial end"). That
//    path is removed: create-checkout never sends subscription_data
//    [trial_end] — new trials use trial_period_days=7 — so the clamp and
//    its tests are deleted.
//  - The webhook must 500 (Stripe retries) on handler errors, 400 on bad
//    signature / JSON, and must CHECK every Supabase write (supabase-js
//    returns {error}, it does not throw).
const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');

describe('webhook errors + no client-chosen trial_end', () => {
  it('checkout never sends a trial_end (dead in-app-trial path removed)', () => {
    const checkout = read('app/api/billing/create-checkout/route.ts');
    expect(checkout).not.toContain('subscription_data[trial_end]');
    expect(checkout).not.toContain('clampTrialEndUnix');
    expect(read('lib/trial.ts')).not.toContain('clampTrialEndUnix');
  });

  it('webhook outer catch returns 500 (Stripe retries) and malformed JSON returns 400', () => {
    const webhook = read('app/api/billing/webhook/route.ts');
    expect(webhook).toContain('status: 500');
    expect(webhook).toContain('Webhook handler failed');
    expect(webhook).toContain('Malformed JSON');
    expect(webhook).toContain("{ error: 'Invalid signature' }, { status: 400 }");
  });

  it('every Supabase write is checked (must) instead of silently ignored', () => {
    const webhook = read('app/api/billing/webhook/route.ts');
    expect(webhook).toContain("must(supabaseAdmin.from('subscriptions').upsert(");
    expect(webhook).toContain("'profiles upsert'");
    expect(webhook).toContain("'subscriptions cancel'");
    expect(webhook).toContain("'profiles downgrade'");
    expect(webhook).toContain('if (error) throw new Error(`syncPlanMetadata');
    expect(webhook).not.toContain('catch { /* non-fatal */ }');
  });
});
