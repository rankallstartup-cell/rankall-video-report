import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b87h — profiles (and every dynamic programmatic page) were
// never cached live despite revalidate = 86400: live fetches
// (Oct 20, 2026, cookie jar, second visit) returned
// "Cache-Control: private, no-cache, no-store" + X-Vercel-Cache
// MISS for /business/*, /cities/[city], /[industry]/[city],
// while static routes (/blog, /pricing, /methodology) HIT.
// In Next 16 an uncached fetch opts the route out of ISR; the
// merged proxy fix (cookies only when changed) removed the
// Set-Cookie cause but not this one. These four page families
// read only public anonymous data, so their fetches are
// force-cached on the ISR cadence.

const PAGES = [
  'app/business/[slug]/page.tsx',
  'app/cities/[city]/page.tsx',
  'app/[industry]/page.tsx',
  'app/[industry]/[city]/page.tsx',
];

describe('b87h — ISR pages opt their fetches into the cache', () => {
  it('all four page families set fetchCache + revalidate', () => {
    for (const p of PAGES) {
      const src = readFileSync(join(process.cwd(), p), 'utf8');
      expect(src).toContain("export const fetchCache = 'force-cache';");
      expect(src).toContain('export const revalidate = 86400;');
    }
  });
});
