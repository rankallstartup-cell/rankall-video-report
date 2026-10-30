import { describe, it, expect } from 'vitest';
import { PROJECTION_CAP, projectScore, effectiveCap, gradeLabel, GRADE_BANDS } from '../projection';
import { calculateSimulation, MAX_SCORE_CAP } from '../simulator';
import { computePredictedScoreLift } from '../fixIntelligence';

// b02b: projection = max(current, min(cap, current + gains)); a score at or
// above the cap keeps itself as the cap; grade bands align with the cap.
describe('projectScore edge cases', () => {
  it('current 90 (above the cap) is never projected down', () => {
    expect(projectScore(90, 0)).toBe(90);
    expect(projectScore(90, 12)).toBe(90);
    expect(effectiveCap(90)).toBe(90);
  });
  it('current 85 (= cap) stays at 85', () => {
    expect(projectScore(85, 10)).toBe(85);
    expect(effectiveCap(85)).toBe(PROJECTION_CAP);
  });
  it('current 0 gains up to the cap', () => {
    expect(projectScore(0, 18)).toBe(18);
    expect(projectScore(0, 200)).toBe(PROJECTION_CAP);
  });
  it('negative or NaN gains never lower the score', () => {
    expect(projectScore(40, -10)).toBe(40);
    expect(projectScore(40, Number.NaN)).toBe(40);
  });
});

describe('simulator uses the shared rule', () => {
  const base = {
    industry: 'dentist', city: 'Austin', countryCode: 'US', competitorScore: null,
    platformsCovered: 2, revenueGap: 5000, revenueSymbol: '$',
    fixes: [
      { id: '1', title: 'FAQ', fix_type: 'faq_schema' },
      { id: '2', title: 'Schema', fix_type: 'jsonld' },
    ],
  };
  it('90 → 90, revenue recovered is 0 (never negative)', () => {
    const out = calculateSimulation({ ...base, currentScore: 90 });
    expect(out.projectedScoreMin).toBe(90);
    expect(out.projectedScoreMax).toBe(90);
    expect(out.revenueRecovered).toBe(0);
    expect(out.revenueAfterFixes).toBe(5000);
  });
  it('85 → 85', () => {
    const out = calculateSimulation({ ...base, currentScore: 85 });
    expect(out.projectedScoreMax).toBe(85);
    expect(out.revenueRecovered).toBe(0);
  });
  it('0 → gains (8 + 10)', () => {
    const out = calculateSimulation({ ...base, currentScore: 0 });
    expect(out.projectedScoreMax).toBe(18);
    expect(out.revenueRecovered).toBeGreaterThan(0);
  });
  it('a negative revenue gap input never yields negative recovery', () => {
    const out = calculateSimulation({ ...base, currentScore: 10, revenueGap: -500 });
    expect(out.revenueRecovered).toBe(0);
    expect(out.revenueAfterFixes).toBe(0);
  });
  it('MAX_SCORE_CAP is the shared PROJECTION_CAP', () => {
    expect(MAX_SCORE_CAP).toBe(PROJECTION_CAP);
  });
});

describe('grade bands align with the cap', () => {
  it('"Dominant" is reachable by a capped projection', () => {
    expect(gradeLabel(PROJECTION_CAP)).toBe('Dominant');
    expect(gradeLabel(projectScore(70, 100))).toBe('Dominant');
    expect(GRADE_BANDS[0].min).toBe(PROJECTION_CAP);
  });
  it('lower bands unchanged', () => {
    expect(gradeLabel(84)).toBe('Strong');
    expect(gradeLabel(71)).toBe('Strong');
    expect(gradeLabel(51)).toBe('Visible');
    expect(gradeLabel(31)).toBe('Emerging');
    expect(gradeLabel(0)).toBe('Not Visible');
  });
});

describe('fix page predicted lift uses the same cap', () => {
  it('has no headroom at or above the cap', () => {
    expect(computePredictedScoreLift(['faq_schema'], { overallScore: 90, platformsMentioned: 5 })).toBe(0);
    expect(computePredictedScoreLift(['faq_schema'], { overallScore: 85, platformsMentioned: 5 })).toBe(0);
    expect(computePredictedScoreLift(['faq_schema'], { overallScore: 80, platformsMentioned: 5 })).toBe(5);
  });
});
