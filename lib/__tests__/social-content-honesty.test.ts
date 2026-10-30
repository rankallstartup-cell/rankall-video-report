import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b8ab — /dashboard/social-content gate fixes. Logged-out visitors used
// to hit the PAID-plan upgrade gate ("Available on any paid plan") with
// no login message; the generate API checked auth but never the plan,
// so a Free account could bypass the page gate by calling it directly;
// and the score strip was undated.

const page = readFileSync(join(process.cwd(), 'app/dashboard/social-content/page.tsx'), 'utf8');
const route = readFileSync(join(process.cwd(), 'app/api/social/generate/route.ts'), 'utf8');

describe('b8ab — page gates', () => {
  it('signed-out visitors get a sign-in gate, not the paid-plan gate', () => {
    expect(page).toContain('Sign in to use the Social Content Generator.');
    expect(page).toContain('/login?next=/dashboard/social-content');
  });

  it('the sign-in gate is checked before the Free upgrade gate', () => {
    expect(page.indexOf('if (signedIn === false)')).toBeGreaterThan(-1);
    expect(page.indexOf('if (signedIn === false)')).toBeLessThan(page.indexOf('if (isFree)'));
  });

  it('session state is tracked explicitly', () => {
    expect(page).toContain('signedIn');
    expect(page).toContain('setSignedIn(false)');
    expect(page).toContain('setSignedIn(true)');
  });

  it('admin view is labelled when the upgraded plan differs from the real plan', () => {
    expect(page).toContain('Admin view:');
    expect(page).toContain('rawPlan');
  });
});

describe('b8ab — score strip is dated; empty state preserved', () => {
  it('strip shows the scan date', () => {
    expect(page).toContain('Scan date');
    expect(page).toContain('scanDate');
  });

  it('no-scan empty state still exists', () => {
    expect(page).toContain('No scan found yet — content will use general defaults.');
  });
});

describe('b8ab — generate API enforces the plan gate server-side', () => {
  it('route resolves the plan and 403s Free', () => {
    expect(route).toContain('resolvePlanServer');
    expect(route).toContain("Social Content is available on paid plans.");
    expect(route).toContain('status: 403');
  });

  it('page surfaces the 403 as an upgrade message, not a generic failure', () => {
    expect(page).toContain('res.status === 403');
    expect(page).toContain('Social Content is available on paid plans — upgrade to generate.');
  });
});
