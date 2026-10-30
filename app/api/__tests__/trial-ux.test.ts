import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// b063: trial-ending warning + countdown.
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const webhook = read('app/api/billing/webhook/route.ts');
const expireTrials = read('app/api/cron/expire-trials/route.ts');
const usePlan = read('lib/usePlan.ts');
const layout = read('app/dashboard/layout.tsx');
const billing = read('app/dashboard/billing/page.tsx');
const trialLib = read('lib/trial.ts');
const banner = read('components/TrialCountdownBanner.tsx');

describe('trial UX — b063', () => {
  it('Stripe trials warn before expiry via trial_will_end', () => {
    expect(webhook).toContain('customer.subscription.trial_will_end');
    expect(webhook).toContain('trialDaysLeft');
  });

  it('in-app trials get a one-time reminder from the expire-trials cron', () => {
    expect(expireTrials).toContain('trial_warning_sent_at');
    expect(expireTrials).toContain('trialDaysLeft');
    expect(expireTrials).toContain('reminded');
  });

  it('expired trials clear app_metadata too (b062 follow-through)', () => {
    expect(expireTrials).toContain('app_metadata');
    expect(trialLib).toContain('app_metadata');
  });

  it('usePlan exposes trial state for the banner + billing page', () => {
    expect(usePlan).toContain('isTrialing');
    expect(usePlan).toContain('trialEndsAt');
  });

  it('dashboard layout renders the countdown banner; billing page has a trialing state', () => {
    expect(layout).toContain('TrialCountdownBanner');
    expect(billing).toContain("'trialing'");
    expect(billing).toContain('trialEndsAt');
  });

  it('banner hides once the trial is over', () => {
    expect(banner).toContain('if (days < 0) return null');
  });
});

describe('trialDaysLeft — b063', () => {
  it('whole days, ceiling', async () => {
    const { trialDaysLeft } = await import('@/lib/trial');
    const now = new Date('2026-10-15T12:00:00Z');
    expect(trialDaysLeft('2026-10-18T12:00:00Z', now)).toBe(3);
    expect(trialDaysLeft('2026-10-16T00:00:00Z', now)).toBe(1);
    expect(trialDaysLeft('2026-10-15T12:00:00Z', now)).toBe(0);
    expect(trialDaysLeft('2026-10-14T12:00:00Z', now)).toBe(-1);
    expect(trialDaysLeft(null, now)).toBe(0);
  });
});
