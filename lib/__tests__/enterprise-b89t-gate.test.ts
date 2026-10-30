import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b89t — /dashboard/enterprise rendered its full content to
// everyone (logged-out visitors and Free accounts included),
// asserting "Your enterprise account" plus a "dedicated account
// manager" as present-tense facts, with no price anywhere.

const page = readFileSync(join(process.cwd(), 'app/dashboard/enterprise/page.tsx'), 'utf8');

describe('b89t — Enterprise dashboard gates', () => {
  it('logged-out visitors get a sign-in gate', () => {
    expect(page).toContain('Sign in to view the Enterprise Dashboard.');
    expect(page).toContain('/login?next=/dashboard/enterprise');
  });

  it('entitlement is the REAL plan, canonicalised', () => {
    expect(page).toContain("normalizePlan(rawPlan) === 'enterprise'");
  });

  it('non-Enterprise accounts get an upgrade view with the canonical price', () => {
    expect(page).toContain('This dashboard is part of the Enterprise plan');
    expect(page).toContain("tierPrice('Enterprise')");
    expect(page).toContain('Contact sales');
  });

  it('gate branches render before the entitled content', () => {
    const gate = page.indexOf('Sign in to view the Enterprise Dashboard.');
    const entitled = page.indexOf('Your enterprise account gives you access');
    expect(gate).toBeGreaterThan(-1);
    expect(entitled).toBeGreaterThan(gate);
  });

  it('admin-resolved viewers are told their real plan is gated', () => {
    expect(page).toContain('Admin view');
    expect(page).toContain('gated to Enterprise accounts');
  });
});
