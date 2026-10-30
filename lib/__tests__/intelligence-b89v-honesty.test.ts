import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b89v — /dashboard/intelligence: (1) Entity Verification Rates
// rendered percentages with no denominator/source beside a page
// reporting "0 data points" — the rates actually come from a
// different dataset (scans with a recorded Knowledge Panel check,
// n=25 on staging: 36%/0%/64%) and drift as scans land (43 -> 39
// -> 36 across checks); (2) the Local Business gate was invisible
// to a signed-in Free account and the kp-stats API had no plan
// check at all; (3) logged-out visitors got shell + paywall.

const page = readFileSync(join(process.cwd(), 'app/dashboard/intelligence/page.tsx'), 'utf8');
const route = readFileSync(join(process.cwd(), 'app/api/dashboard/kp-stats/route.ts'), 'utf8');

describe('b89v — gates', () => {
  it('sign-in gate renders before the plan paywall', () => {
    const gate = page.indexOf('Sign in to view the Intelligence Graph.');
    const guard = page.indexOf('<PlanPageGuard');
    expect(gate).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(gate);
    expect(page).toContain('/login?next=/dashboard/intelligence');
    expect(page).toContain('setSignedIn(!!session)');
  });

  it('admin viewers are told their real plan is gated', () => {
    expect(page).toContain('plan !== rawPlan');
    expect(page).toContain('Admin view');
    expect(page).toContain('gated to Local Business plans and above');
  });

  it('kp-stats enforces the same dashboardAccess gate as the page', () => {
    expect(route).toContain("canOpenDashboardPath('/dashboard/intelligence'");
    expect(route).toContain("status: 403");
    expect(route).toContain('resolvePlanServer');
  });
});

describe('b89v — verification rates carry their basis', () => {
  it('the card states its dataset and size', () => {
    expect(page).toContain('Knowledge Panel check recorded');
    expect(page).toContain('Based on {total} scanned businesses');
    expect(page).toContain('separate from the labeled data points above');
  });

  it('the unsourced superlative claim is gone', () => {
    expect(page).not.toContain('highest-impact');
    expect(page).not.toContain('major gap');
  });
});
