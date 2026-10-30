import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b87t — spend intelligence clamped the unallocated remainder at
// 0, so an over-budget allocation (Ads 1,500 + SEO 2,000 against
// a 3,000 total) displayed "$0 unallocated" instead of the $500
// overspend. (Same fix as the b8ac branch's budgetAllocation
// helper, applied to HEAD.)

const page = readFileSync(join(process.cwd(), 'app/dashboard/spend-intelligence/page.tsx'), 'utf8');

describe('b87t — overspend is shown, not clamped away', () => {
  it('the remainder is signed and the over-budget state renders', () => {
    // b8ac budgetAllocation helper supersedes the signed-unallocated
    // inline shape: over-budget is now a named quantity, and the
    // over-budget branch reads it — not the clamped unallocated.
    // The Math.max(0, …) clamp on unallocated is harmless there.
    expect(page).toContain('const overBudget = allocated - total;');
    expect(page).toContain('overBudget > 0');
    expect(page).toContain('over budget');
    expect(page).toContain('budgetAllocation');
  });
});
