import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b89d — /dashboard/agency/settings rendered the full white-label
// form to everyone: no sign-in state, no plan gate on the page, and
// PUT /api/agency/settings gated only the trial white-label case —
// a Free account could save branding and enable white-label via
// the API. canSeeAgency (Agency plans) is the canonical rule.

const page = readFileSync(join(process.cwd(), 'app/dashboard/agency/settings/page.tsx'), 'utf8');
const route = readFileSync(join(process.cwd(), 'app/api/agency/settings/route.ts'), 'utf8');

describe('b89d — agency settings gates', () => {
  it('page: sign-in gate before the form, PlanPageGuard around it', () => {
    const signin = page.indexOf('Sign in to manage your agency settings.');
    const guard = page.indexOf('<PlanPageGuard feature="canSeeAgency" requiredPlan="agency">');
    expect(signin).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(signin);
    expect(page).toContain('/login?next=/dashboard/agency/settings');
  });

  it('page: admin-resolved viewers are told their real plan is gated', () => {
    expect(page).toContain('plan !== rawPlan');
    expect(page).toContain('Admin view');
  });

  it('page: the preview score is labelled a sample', () => {
    expect(page).toContain('67/100</strong> (sample score, for preview only)');
  });

  it('route: every save is Agency-plan gated, trial cap preserved', () => {
    expect(route).toContain('isAgencyPlan(resolved.plan)');
    expect(route).toContain("error: 'upgrade_required'");
    expect(route).toContain('status: 403');
    expect(route).toContain('trial_whitelabel_blocked');
  });
});
