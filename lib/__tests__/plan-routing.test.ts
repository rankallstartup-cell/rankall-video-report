import { describe, it, expect } from 'vitest';
import { normalizePlan, isAgencyPlan, isAdminUser } from '../planConfig';

function resolveViewPlan(rawPlan: string, email: string | null) {
  const isAdmin = isAdminUser(email);
  const plan = isAdmin ? 'enterprise' : normalizePlan(rawPlan);
  const viewPlan = isAdmin ? rawPlan : plan;
  return { plan, viewPlan, normPlan: normalizePlan(viewPlan) };
}

describe('plan routing — admin sees the plan they are testing', () => {
  const ADMIN = 'rankallstartup@gmail.com';

  it('admin testing as local_business sees business view, not enterprise', () => {
    const { normPlan } = resolveViewPlan('business', ADMIN);
    expect(normPlan).toBe('business');
  });

  it('admin testing as personal_pro sees personal_pro view', () => {
    const { normPlan } = resolveViewPlan('personal_pro', ADMIN);
    expect(normPlan).toBe('personal_pro');
  });

  it('admin testing as agency sees agency view', () => {
    const { normPlan } = resolveViewPlan('agency', ADMIN);
    expect(normPlan).toBe('agency');
  });

  it('admin still gets enterprise as effective plan for feature gates', () => {
    const { plan } = resolveViewPlan('business', ADMIN);
    expect(plan).toBe('enterprise');
  });

  it('admin testing as business does NOT trigger agency redirect', () => {
    const { viewPlan } = resolveViewPlan('business', ADMIN);
    expect(isAgencyPlan(viewPlan)).toBe(false);
  });

  it('admin testing as agency DOES trigger agency redirect', () => {
    const { viewPlan } = resolveViewPlan('agency', ADMIN);
    expect(isAgencyPlan(viewPlan)).toBe(true);
  });
});

describe('plan routing — regular users', () => {
  const USER = 'customer@example.com';

  it('business customer sees business view', () => {
    const { normPlan } = resolveViewPlan('business', USER);
    expect(normPlan).toBe('business');
  });

  it('personal_pro customer sees personal_pro view', () => {
    const { normPlan } = resolveViewPlan('personal_pro', USER);
    expect(normPlan).toBe('personal_pro');
  });

  it('agency customer sees agency view and triggers redirect', () => {
    const { normPlan, viewPlan } = resolveViewPlan('agency', USER);
    expect(normPlan).toBe('agency');
    expect(isAgencyPlan(viewPlan)).toBe(true);
  });

  it('free customer sees free view', () => {
    const { normPlan } = resolveViewPlan('free', USER);
    expect(normPlan).toBe('free');
  });
});
