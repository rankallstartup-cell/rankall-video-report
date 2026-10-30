import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b35t: Proposal Builder redesign — b35q design system on staging logic;
// v2's page had the same structure but hardcoded fabricated projection inputs.
describe('b35t proposal builder redesign', () => {
  const src = readFileSync(join(process.cwd(), 'app/dashboard/agency/proposal/page.tsx'), 'utf-8');
  it('new design system present: shared classes, Geist, tokens', () => {
    for (const s of ['PAGE_CLASSES', 'btn-blue', 'Geist', 'F6F6FB']) {
      expect(src).toContain(s);
    }
  });
  it('no v2 fabricated projection inputs', () => {
    for (const s of ['competitorScore: 62', 'platformsCovered: 3', 'revenueGap: 3500', '?? 35', 'No credit card', 'automated Monday', 'tracked weekly']) {
      expect(src).not.toContain(s);
    }
    expect(src.match(/countryCode: 'US'/g)?.length ?? 0).toBe(1);
  });
  it('staging logic preserved: real simulation, honest empty state, handlers', () => {
    for (const s of ['calculateSimulation', 'Projection unavailable', 'PROPOSAL_FEE_SYMBOL', 'handleSubmit', 'handlePrint', 'DEFAULT_FIXES', 'agency_settings']) {
      expect(src).toContain(s);
    }
  });
  it('same steps present', () => {
    for (const s of ['Proposal Builder', 'Building your proposal', 'Your proposal is ready']) {
      expect(src).toContain(s);
    }
  });
});
