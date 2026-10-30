import { describe, it, expect } from 'vitest';
import { trustFixGainPoints, calculateOverall } from '../../../lib/trust';

// b0fh (residual): the fix-gain badges divided by allSignals.length,
// INCLUDING not_checked signals — while calculateOverall divides by
// the measured count only. The badges understated the gain and
// contradicted the score math. The function now takes the signals
// array and counts measured itself.
describe('b0fh fix gain divides by measured signals only', () => {
  const sig = (status: string) => ({ status });
  // 22 measured (1 good, 1 warning, 20 missing) + 15 not_checked.
  const signals = [
    sig('good'), sig('warning'), ...Array(20).fill(sig('missing')),
    ...Array(15).fill(sig('not_checked')),
  ];

  it('gain uses the measured denominator', () => {
    // Fixing a missing signal gains 1/22 of the score ≈ 5 pts,
    // NOT 1/37 ≈ 3 pts.
    expect(trustFixGainPoints(sig('missing'), signals)).toBe(5);
    // Warning -> good gains 0.5/22 ≈ 2 pts.
    expect(trustFixGainPoints(sig('warning'), signals)).toBe(2);
    // Good: nothing to gain. Unmeasured: no promised gain.
    expect(trustFixGainPoints(sig('good'), signals)).toBe(0);
    expect(trustFixGainPoints(sig('not_checked'), signals)).toBe(0);
  });

  it('gain matches calculateOverall arithmetic within rounding', () => {
    const before = calculateOverall(signals as never);
    const fixed = calculateOverall([
      sig('good'), sig('good'), sig('warning'), ...Array(19).fill(sig('missing')),
      ...Array(15).fill(sig('not_checked')),
    ] as never);
    // One missing -> good: unrounded gain 1/22 = 4.5 pts; the rounded
    // score delta is within 1 of the badge.
    const badge = trustFixGainPoints(sig('missing'), signals);
    expect(Math.abs((fixed - before) - badge)).toBeLessThanOrEqual(1);
  });
});
