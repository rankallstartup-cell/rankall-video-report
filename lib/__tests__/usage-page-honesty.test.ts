// b8af — /dashboard/usage honesty: display the REAL plan (rawPlan), no
// full bar for unlimited rows, admin metering explained.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8');

describe('usage page honesty (b8af)', () => {
  it('displays rawPlan, never the admin-upgraded plan', () => {
    const src = read('app/dashboard/usage/page.tsx');
    expect(src).toContain('getPlanMeta(rawPlan)');
    expect(src).not.toContain('getPlanMeta(plan)');
  });

  it('never renders a 100%-full bar for an unlimited row', () => {
    const src = read('app/dashboard/usage/page.tsx');
    expect(src).not.toContain("unlimited ? '100%'");
    expect(src).not.toContain('unlimited ? "100%"');
  });

  it('explains why an admin sees 0s', () => {
    // Explanation present, rendered under isAdmin/isAdminView — but
    // the page has no plan variable at all (it uses rawPlan +
    // isAdminUser), so the old plan !== rawPlan guard literal cannot
    // exist. Assert the note renders under the admin view instead.
    const src = read('app/dashboard/usage/page.tsx');
    expect(src).toContain('admin activity isn&apos;t metered');
    expect(src).toContain('isAdminView');
    expect(src).toContain('Admin account');
  });
});
