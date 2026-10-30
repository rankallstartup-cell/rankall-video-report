import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROPOSAL_FEE_SYMBOL, formatProposalFee, proposalRevenueGap } from '../proposalCurrency';

// Item 10: proposals printed a hardcoded "$" fee next to a "£" revenue gap.
describe('one currency per proposal document', () => {
  it('quotes the gap only in the fee currency', () => {
    expect(PROPOSAL_FEE_SYMBOL).toBe('$');
    expect(proposalRevenueGap(1200, '$')).toBe(1200);
    expect(proposalRevenueGap(1200, '£')).toBeNull();
    expect(proposalRevenueGap(null, '$')).toBeNull();
    expect(formatProposalFee(1500)).toBe('$1,500/mo');
  });
  it('route and pages have no hardcoded fee symbol', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/agency/generate-proposal/route.ts'), 'utf8');
    expect(route).not.toContain('$${proposed_fee}');
    expect(route).toContain('proposalRevenueGap(');
    const list = readFileSync(join(process.cwd(), 'app/dashboard/agency/proposals/page.tsx'), 'utf8');
    expect(list).not.toContain('return `$${n.toLocaleString()}/mo`');
    expect(list).toContain('formatProposalFee(n)');
  });
});
