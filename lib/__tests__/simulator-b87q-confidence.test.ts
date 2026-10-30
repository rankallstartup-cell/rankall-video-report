import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b87q — the Simulator showed TWO different confidence numbers
// with no explanation: the range line used sim.confidence while
// the confidence bar (and the saved share payload) used the
// data-basis confidence when a basis existed. One effective
// confidence now feeds every surface. (The b8aa branch made the
// same unification via its effBasis object.)
//
// b8aa supersedes the single-number premise: the range line and the
// bar are now DELIBERATELY different quantities, labeled as such —
// the range line is the fix-impact confidence, the bar (and the
// share payload) is the data confidence from effBasis. Collapsing
// them into one number is what the current correct code must not do,
// so this test pins the two-quantity design instead.
const page = readFileSync(join(process.cwd(), 'app/dashboard/simulator/page.tsx'), 'utf8');

describe('b87q — one confidence on the simulator', () => {
  it('range line, bar, and share payload use the two labeled confidences (b8aa design)', () => {
    // Range line: fix-impact confidence, explicitly labeled.
    expect(page).toContain('{basis ? basis.confidence : sim.confidence}% fix-impact confidence');
    // Bar: data confidence from effBasis, explicitly labeled.
    expect(page).toContain('Data confidence');
    expect(page).toContain('const conf = effBasis.confidence;');
    // Share payload: data confidence, same effBasis quantity as the bar.
    expect(page).toContain('confidence: effBasis.confidence,');
    // The projection is labeled as unverified, not a measured result.
    expect(page).toContain('Estimated projection — not yet verified');
    // The old unlabeled single-number line must not come back.
    expect(page).not.toContain('· {sim.confidence}% confidence');
  });
});
