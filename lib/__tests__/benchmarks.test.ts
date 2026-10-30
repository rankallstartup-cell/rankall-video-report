import { describe, it, expect } from 'vitest';
import { aggregateScores, percentileOf, industryAverages } from '../benchmarks';

// Real peer benchmarks with a minimum sample — no hardcoded 45/52 baselines.
describe('benchmarks', () => {
  const twenty = Array.from({ length: 20 }, (_, i) => i * 5); // 0..95
  it('null below the minimum sample', () => {
    expect(aggregateScores([50, 60, 70])).toBeNull();
    expect(percentileOf(50, [10, 20])).toBeNull();
  });
  it('averages ignore missing scores', () => {
    expect(aggregateScores([...twenty, null, undefined])).toEqual({ avg: 48, count: 20 });
  });
  it('percentile = share strictly below', () => {
    expect(percentileOf(50, twenty)).toBe(50);
    expect(percentileOf(null, twenty)).toBeNull();
  });
  it('industry averages only for industries meeting the sample', () => {
    const rows = [
      ...twenty.map(s => ({ industry: 'dentist', overall_score: s })),
      { industry: 'lawyer', overall_score: 90 },
    ];
    expect(industryAverages(rows)).toEqual([{ industry: 'dentist', avg: 48, count: 20 }]);
  });
});
