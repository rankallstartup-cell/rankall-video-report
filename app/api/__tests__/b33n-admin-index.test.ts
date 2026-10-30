import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b33n: /admin must not 404 for admins — it redirects to the admin landing page.
describe('b33n admin index', () => {
  it('/admin redirects to /admin/dashboard', () => {
    const src = readFileSync(join(process.cwd(), 'app/admin/page.tsx'), 'utf-8');
    expect(src).toContain("redirect('/admin/dashboard')");
    expect(src).toContain("from 'next/navigation'");
  });
});
