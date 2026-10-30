// b8bc — the HTML sitemap must not claim to list "every page" (it
// lists 31 entries; business profiles, industry and city pages live
// under the hubs), and "Local Business" must not silently duplicate
// the Pricing link.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(process.cwd(), 'app/sitemap/page.tsx'), 'utf-8');

describe('HTML sitemap honesty (b8bc)', () => {
  it('never claims "every page"', () => {
    expect(page).not.toMatch(/Every page/i);
    expect(page).toContain('Key pages, one place');
    expect(page).toContain('Industry and city pages live under the hubs below.');
  });

  it('labels the Local Business destination honestly', () => {
    // b8bc concern satisfied: Local Business links to the homepage
    // ("/"), not to /pricing — so it cannot silently duplicate the
    // Pricing link. "Local Pro plan" would mislabel that destination
    // (current plan naming is "Local Business", not "Local Pro").
    expect(page).toContain("label: 'Local Business', href: '/'");
    expect(page).not.toContain("label: 'Local Business', href: '/pricing'");
    expect(page).not.toContain('Local Pro plan');
  });
});
