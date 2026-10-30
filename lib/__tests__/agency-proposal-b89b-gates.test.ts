import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b89b — /dashboard/agency/proposal (the builder) rendered its full
// form for everyone: no sign-in state, no plan gate. Its generate
// route is plan-gated in the b89c branch (lib/agencyPlanGate).

const page = readFileSync(join(process.cwd(), 'app/dashboard/agency/proposal/page.tsx'), 'utf8');

describe('b89b — proposal builder gates', () => {
  it('gates render before every step view', () => {
    const signin = page.indexOf('Sign in to use the Proposal Builder.');
    const step1 = page.indexOf('if (step === 1) return (');
    expect(signin).toBeGreaterThan(-1);
    expect(step1).toBeGreaterThan(signin);
    expect(page).toContain('/login?next=/dashboard/agency/proposal');
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
