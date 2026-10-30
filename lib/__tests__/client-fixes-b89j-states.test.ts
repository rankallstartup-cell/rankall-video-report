import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b89j — /dashboard/client/fixes: same bare-red-line failure shape
// as its sibling client pages (b89n/b89m/b89k).

const page = readFileSync(join(process.cwd(), 'app/dashboard/client/fixes/page.tsx'), 'utf8');

describe('b89j — client fixes states', () => {
  it('distinguishes 401 / 404 / failure from the API status', () => {
    expect(page).toContain("res.status === 401 ? 'unauth' : res.status === 404 ? 'noclient' : 'failed'");
  });

  it('logged-out visitors get a sign-in gate with the page heading', () => {
    expect(page).toContain('Sign in to view your fix priorities.');
    expect(page).toContain('/login?next=/dashboard/client/fixes');
  });

  it('error states carry the page shell and a Retry on failure', () => {
    expect((page.match(/My Fixes/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(page).toContain('Retry');
  });
});
