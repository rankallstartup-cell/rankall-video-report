import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b362: Client platforms redesign — b35q design system on staging logic;
// v2's version bypassed /api/client-portal/overview with direct Supabase
// queries on the stale scans table + response_text as a mention signal.
describe('b362 client platforms redesign', () => {
  const src = readFileSync(join(process.cwd(), 'app/dashboard/client/platforms/page.tsx'), 'utf-8');
  it('new design system present: dash-card, Geist, tokens, pagehead', () => {
    for (const s of ['dash-card', 'Geist', 'F6F6FB', 'pagehead']) {
      expect(src).toContain(s);
    }
  });
  it('staging logic preserved: endpoint load, platform list, header', () => {
    expect(src).toContain('/api/client-portal/overview');
    expect(src).toContain('ALL_PLATFORMS');
    expect(src).toContain('My Platforms');
  });
  it('error state carries the redesign (header + card, not a bare line)', () => {
    expect(src.match(/My Platforms/g)?.length).toBeGreaterThanOrEqual(2);
    expect(src).toContain('card dash-card');
  });
  it('no v2 poison: no direct Supabase, no response_text mention signal', () => {
    for (const s of ['getBrowserClient', "from('scans')", "from('agency_clients')", 'response_text', 'Optimisation fix', 'No credit card', 'automated Monday', 'tracked weekly']) {
      expect(src).not.toContain(s);
    }
  });
});
