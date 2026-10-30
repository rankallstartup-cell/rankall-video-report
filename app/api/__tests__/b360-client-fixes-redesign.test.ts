import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b360: Client fixes redesign — b35q design system on staging logic;
// v2's version bypassed /api/client-portal/overview with direct
// Supabase queries on stale columns + fabricated fallback titles.
describe('b360 client fixes redesign', () => {
  const src = readFileSync(join(process.cwd(), 'app/dashboard/client/fixes/page.tsx'), 'utf-8');
  it('new design system present: dash-card, Geist, tokens, pagehead', () => {
    for (const s of ['dash-card', 'Geist', 'F6F6FB', 'pagehead']) {
      expect(src).toContain(s);
    }
  });
  it('staging logic preserved: endpoint-based load, no direct Supabase', () => {
    expect(src).toContain('/api/client-portal/overview');
    expect(src).toContain('My Fixes');
    expect(src).not.toContain('getBrowserClient');
    expect(src).not.toContain("from('scans')");
  });
  it('no fabricated fallback titles or invented copy', () => {
    for (const s of ['Optimisation fix', 'No credit card', 'automated Monday', 'tracked weekly']) {
      expect(src).not.toContain(s);
    }
  });
  it('error state renders the page header + card (not a bare line)', () => {
    // The no-client error state is the only state reachable with the admin
    // account, so it must carry the redesign too: header appears twice
    // (main return + error return) and the error text sits in a card.
    expect(src.match(/My Fixes/g)?.length).toBeGreaterThanOrEqual(2);
    expect(src).toContain('card dash-card');
  });
});
