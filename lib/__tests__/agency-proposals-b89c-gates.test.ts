import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b89c — /dashboard/agency/proposals: no sign-in state, no plan
// gate on the page; the generate + status routes checked only the
// session (plus a trial cap), so a Free account could generate
// proposals via the API.

const page = readFileSync(join(process.cwd(), 'app/dashboard/agency/proposals/page.tsx'), 'utf8');
const gen = readFileSync(join(process.cwd(), 'app/api/agency/generate-proposal/route.ts'), 'utf8');
const status = readFileSync(join(process.cwd(), 'app/api/agency/update-proposal-status/route.ts'), 'utf8');
const gate = readFileSync(join(process.cwd(), 'lib/agencyPlanGate.ts'), 'utf8');

describe('b89c — proposals gates', () => {
  it('page: sign-in gate + PlanPageGuard + admin note', () => {
    expect(page).toContain('Sign in to view your proposals.');
    expect(page).toContain('/login?next=/dashboard/agency/proposals');
    expect(page).toContain('<PlanPageGuard feature="canSeeAgency" requiredPlan="agency">');
    expect(page).toContain('plan !== rawPlan');
  });

  it('both write routes enforce the shared agency gate', () => {
    expect(gen).toContain('agencyPlanGate(user.id)');
    expect(status).toContain('agencyPlanGate(user.id)');
    expect(gate).toContain('isAgencyPlan(resolved.plan)');
    expect(gate).toContain("error: 'upgrade_required'");
  });
});
