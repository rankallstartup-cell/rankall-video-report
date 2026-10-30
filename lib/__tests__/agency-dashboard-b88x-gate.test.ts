import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b88x — /agency/dashboard had an in-place sign-in denial (good)
// but NO plan gate: a Free account got the full agency surface.
// Its S5 contradiction (25 vs Unlimited) is fixed in the b88z
// branch; the clients API is plan-gated in the b89a branch.

const page = readFileSync(join(process.cwd(), 'app/agency/dashboard/page.tsx'), 'utf8');

describe('b88x — /agency/dashboard gates', () => {
  it('loading is separated from signed-out (no denial flash)', () => {
    const loading = page.indexOf('if (!sessionChecked || planLoading)');
    const denial = page.indexOf('Sign in to access Agency Dashboard');
    expect(loading).toBeGreaterThan(-1);
    expect(denial).toBeGreaterThan(loading);
  });

  it('non-Agency plans get the PlanGuard upgrade card', () => {
    expect(page).toContain('plan === rawPlan && !isAgencyPlan(plan)');
    expect(page).toContain('<PlanGuard feature="canSeeAgency" requiredPlan="agency"');
  });

  it('admin-resolved viewers are told their real plan is gated', () => {
    expect(page).toContain('plan !== rawPlan');
    expect(page).toContain('Admin view');
  });
});
