import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// azxe residual: robots.txt disallowed /api/ for EVERY crawler group,
// which blocked social scrapers (Twitterbot, facebookexternalhit,
// LinkedInBot — all under `User-agent: *`) from fetching the OG
// share-card images at /api/og/*. The share cards azxe built would
// have rendered without images. /api/og/ must be explicitly allowed
// (more specific than /api/, so it wins for those paths) while the
// rest of /api/ stays blocked. The canonical/share-card claims
// themselves were verified against code: layout.tsx emits
// canonical '/' + the /api/og/marketing card, pricing/blog have
// their own cards, and the marketing route renders 1200x628.
describe('azxe residual: robots must allow the public OG images', () => {
  it('every crawler group allows /api/og/ while /api/ stays disallowed', () => {
    const src = readFileSync(join(process.cwd(), 'app/robots.ts'), 'utf-8');
    expect(src).toContain("const PUBLIC_OG = '/api/og/';");
    expect(src).toContain("allow: ['/', PUBLIC_OG]");
    expect(src).toContain("'/api/'");
    // No rule may still have a bare allow: '/' without the OG exception.
    expect(src).not.toMatch(/allow:\s*'\/',/);
  });
  it('canonical + share card are present in the root metadata', () => {
    const layout = readFileSync(join(process.cwd(), 'app/layout.tsx'), 'utf-8');
    // azxe regression: a root canonical of '/' made every page without
    // its own alternates canonicalise to the homepage. './' resolves
    // per-route (self-canonical); the homepage no longer adds a raw tag.
    expect(layout).toContain("alternates: { canonical: './' }");
    expect(layout).not.toContain("alternates: { canonical: '/' }");
    const home = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf-8');
    expect(home).not.toContain('rel="canonical"');
    expect(layout).toContain('/api/og/marketing');
    expect(layout).toContain('width: 1200');
  });
});
