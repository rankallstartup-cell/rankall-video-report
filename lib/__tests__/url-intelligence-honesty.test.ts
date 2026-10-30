// b8ae — /dashboard/url-intelligence honesty: sign-in gate for the tool,
// explicit empty state.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8');

describe('url-intelligence honesty (b8ae)', () => {
  it('gates the tool on a session instead of rendering it logged out', () => {
    const src = read('app/dashboard/url-intelligence/page.tsx');
    expect(src).toContain('Sign in to use URL Intelligence.');
    expect(src).toContain('auth.getUser()');
    expect(src).toContain('/login?next=/dashboard/url-intelligence');
  });

  it('has an explicit empty state', () => {
    const src = read('app/dashboard/url-intelligence/page.tsx');
    // Explicit empty state exists with different wording: it says
    // what the page does before the first audit instead of showing a
    // bare form.
    expect(src).toContain('No audit open yet');
    expect(src).toContain('Enter a page address above and choose Run Audit');
  });
});
