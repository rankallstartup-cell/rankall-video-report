import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b89p — /dashboard/competitor had NO plan gate and no sign-in
// state: logged-out visitors landed in the "No competitor data
// yet" empty state, and Free accounts got the full page — while
// planConfig marks canSeeCompetitors Business+ and the Deep Scan
// API already refuses Free (competitor_scan limit 0 -> 429).

const page = readFileSync(join(process.cwd(), 'app/dashboard/competitor/page.tsx'), 'utf8');
const api = readFileSync(join(process.cwd(), 'app/api/competitor-scan/route.ts'), 'utf8');

describe('b89p — competitor gates', () => {
  it('sign-in gate renders before the empty state', () => {
    const gate = page.indexOf('Sign in to view Competitor Intel.');
    const empty = page.indexOf('No competitor data yet');
    expect(gate).toBeGreaterThan(-1);
    expect(empty).toBeGreaterThan(gate);
    expect(page).toContain('/login?next=/dashboard/competitor');
    expect(page).toContain('setSignedIn(false)');
  });

  it('the page is wrapped in the canSeeCompetitors PlanPageGuard', () => {
    expect(page).toContain('<PlanPageGuard feature="canSeeCompetitors" requiredPlan="business">');
  });

  it('admin-resolved viewers are told their real plan is gated', () => {
    expect(page).toContain('plan !== rawPlan');
    expect(page).toContain('Admin view');
  });

  it('the Deep Scan API already enforces auth + the Free limit (context)', () => {
    expect(api).toContain('authentication_required');
    expect(api).toContain('competitor_scan_limit_reached');
  });
});
