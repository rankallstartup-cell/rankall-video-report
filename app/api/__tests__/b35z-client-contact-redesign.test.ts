import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b35z: Client contact redesign — b35q design system on staging logic;
// v2's version differed only in two token hexes (nothing poisoned).
describe('b35z client contact redesign', () => {
  const src = readFileSync(join(process.cwd(), 'app/dashboard/client/contact/page.tsx'), 'utf-8');
  it('new design system present: dash-card, Geist, tokens, pagehead', () => {
    for (const s of ['dash-card', 'Geist', 'F6F6FB', 'pagehead']) {
      expect(src).toContain(s);
    }
  });
  it('staging logic preserved: agency lookup + contact rendering', () => {
    for (const s of ['agency_clients', 'agency_settings', 'Contact My Agency', 'mailto:']) {
      expect(src).toContain(s);
    }
  });
  it('no invented copy or fabricated contact details', () => {
    for (const s of ['No credit card', 'automated Monday', 'tracked weekly']) {
      expect(src).not.toContain(s);
    }
  });
  it('error state renders the page header + card (not a bare line)', () => {
    // The no-client error state is the only state reachable with the admin
    // account, so it must carry the redesign too: header appears twice
    // (main return + error return) and the error text sits in a card.
    expect(src.match(/Contact My Agency/g)?.length).toBeGreaterThanOrEqual(2);
    expect(src).toContain('card dash-card');
  });
});
