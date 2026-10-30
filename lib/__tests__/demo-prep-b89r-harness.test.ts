import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b89r — /dashboard/demo-prep is an ADMIN TOOL with a plan-switch
// test harness. The first pass (from the admin test account) saw it
// fully exposed on a "Free" account. Verification this session: the
// exposure is closed in code — useAdminGuard redirects non-admins
// to /dashboard?restricted=1, which renders "This page is restricted
// to Rankall admins only.", and /api/admin/switch-plan verifies the
// caller's real session (ax77). What remained: the switcher labeled
// plans by title-casing raw keys ("Local Pro Seo") instead of the
// canonical display names, and nothing on the page said the harness
// is an admin test control.

const page = readFileSync(join(process.cwd(), 'app/dashboard/demo-prep/page.tsx'), 'utf8');
const guard = readFileSync(join(process.cwd(), 'lib/useAdminGuard.ts'), 'utf8');
const dash = readFileSync(join(process.cwd(), 'app/dashboard/page.tsx'), 'utf8');
const api = readFileSync(join(process.cwd(), 'app/api/admin/switch-plan/route.ts'), 'utf8');

describe('b89r — the harness is admin-only, end to end', () => {
  it('the page guard redirects non-admins to the restricted dashboard state', () => {
    expect(page).toContain('useAdminGuard');
    expect(guard).toContain("router.replace('/dashboard?restricted=1')");
    expect(dash).toContain('This page is restricted to Rankall admins only.');
  });

  it('the switch API verifies the caller session, not a body field', () => {
    expect(api).toContain('isAdminUser(user?.email)');
    expect(api).toContain("status: 403");
  });

  it('plan labels are the canonical PLAN_CONFIG display names', () => {
    expect(page).toContain('PLAN_CONFIG');
    expect(page).toContain('planLabel(currentPlan)');
    expect(page).toContain('planLabel(p)');
    expect(page).not.toContain("{p.replace(/_/g, ' ')}");
  });

  it('the harness labels itself as an admin test control', () => {
    expect(page).toContain('Admin test control');
    expect(page).toContain('switches your own account&apos;s plan');
  });
});
