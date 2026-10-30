import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b89m — same defect class as b89n on the sibling page: every API
// failure was one bare red line; logged-out visitors saw
// "Not signed in." inside the shell with no gate or heading.

const page = readFileSync(join(process.cwd(), 'app/dashboard/client/platforms/page.tsx'), 'utf8');

describe('b89m — platforms page states', () => {
  it('distinguishes 401 / 404 / failure from the API status', () => {
    expect(page).toContain("res.status === 401 ? 'unauth' : res.status === 404 ? 'noclient' : 'failed'");
  });

  it('logged-out visitors get a sign-in gate with the page heading', () => {
    expect(page).toContain('Sign in to see which AI platforms recommend your business.');
    expect(page).toContain('/login?next=/dashboard/client/platforms');
  });

  it('error states carry the page shell and a Retry on failure', () => {
    expect((page.match(/My Platforms/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(page).toContain('Retry');
  });
});
