import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b35u: Proposals list redesign — b35q design system on staging logic;
// v2's page had an unchecked delete (b01w vulnerability), naive fees, bare window.print.
describe('b35u proposals redesign', () => {
  const src = readFileSync(join(process.cwd(), 'app/dashboard/agency/proposals/page.tsx'), 'utf-8');
  it('new design system present: pagehead, dash-card, Geist, tokens', () => {
    for (const s of ['pagehead', 'dash-card', 'Geist', 'F6F6FB']) {
      expect(src).toContain(s);
    }
  });
  it('ownership-checked delete intact (b01w security fix)', () => {
    expect(src).toContain(".eq('agency_user_id', data.user.id)");
    expect(src).toContain('deleted.length === 0');
    expect(src).toContain('w.opener = null');
    expect(src).toContain('actionError');
  });
  it('no v2 regressions: no unchecked delete, no naive fee, no bare window.print call', () => {
    expect(src).not.toContain('`$${n.toLocaleString()}/mo`');
    expect(src).not.toContain('onClick={() => window.print()}');
    for (const s of ['No credit card', 'automated Monday', 'tracked weekly']) {
      expect(src).not.toContain(s);
    }
  });
  it('staging logic preserved: status/duplicate/print handlers', () => {
    for (const s of ['updateStatus', 'duplicateProposal', 'deleteProposal', 'printProposal', 'formatFee', 'formatDate']) {
      expect(src).toContain(s);
    }
  });
});
