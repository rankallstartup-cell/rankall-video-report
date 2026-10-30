import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b89n — /dashboard/client/reports rendered every API failure as a
// bare red line: logged-out visitors saw "Not signed in." inside
// the dashboard shell (no gate, no heading), and the honest
// no-client state had no page identity either (b360 lesson).

const page = readFileSync(join(process.cwd(), 'app/dashboard/client/reports/page.tsx'), 'utf8');

describe('b89n — reports page states', () => {
  it('distinguishes 401 / 404 / failure from the API status', () => {
    expect(page).toContain("res.status === 401 ? 'unauth' : res.status === 404 ? 'noclient' : 'failed'");
  });

  it('logged-out visitors get a sign-in gate with the page heading', () => {
    expect(page).toContain('Sign in to view your reports.');
    expect(page).toContain('/login?next=/dashboard/client/reports');
  });

  it('the no-client and failure states render inside the page shell', () => {
    // heading appears in the loading-independent states, not only success
    expect((page.match(/My Reports/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(page).toContain('Your AI visibility reports, prepared by your agency.');
    expect(page).toContain('Retry');
  });
});
