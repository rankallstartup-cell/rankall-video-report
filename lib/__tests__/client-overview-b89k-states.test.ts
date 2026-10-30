import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b89k — /dashboard/client (client overview): every API failure was
// one bare red line; logged-out visitors saw "Not signed in." inside
// the shell. Same fix family as b89n/b89m.

const page = readFileSync(join(process.cwd(), 'app/dashboard/client/page.tsx'), 'utf8');

describe('b89k — client overview states', () => {
  it('distinguishes 401 / 404 / failure from the API status', () => {
    expect(page).toContain("res.status === 401 ? 'unauth' : res.status === 404 ? 'noclient' : 'failed'");
  });

  it('logged-out visitors get a sign-in gate with the page heading', () => {
    expect(page).toContain('Sign in to view your AI visibility score.');
    expect(page).toContain('/login?next=/dashboard/client');
  });

  it('error states carry the page shell and a Retry on failure', () => {
    expect((page.match(/My Score/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(page).toContain('Retry');
  });
});
