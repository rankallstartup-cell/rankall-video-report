import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// b02b: (1) hardcoded "evidence" (847 businesses, 24 pts, 78%) presented
// as database counts; (2) score card capped at 85 while the simulator
// capped at 100; (3) two grade-band tables.
import { calculateSimulation, gradeLabel } from '@/lib/simulator';

const ROOT = process.cwd();
const simSrc = readFileSync(join(ROOT, 'lib/simulator.ts'), 'utf8');
const compSrc = readFileSync(join(ROOT, 'components/RecommendationSimulator.tsx'), 'utf8');
const reportSrc = readFileSync(join(ROOT, 'app/report/[id]/page.tsx'), 'utf8');

const fixes = [
  { id: '1', title: 'Fix one', fix_type: 'faq_schema', predicted_impact: 10 },
  { id: '2', title: 'Fix two', fix_type: 'jsonld', predicted_impact: 20 },
];
const input = {
  currentScore: 30, industry: 'Dentist', city: 'Austin', countryCode: 'US',
  competitorScore: null, platformsCovered: 3, fixes, revenueGap: 1000, revenueSymbol: '$',
};

describe('simulator engine — b02b', () => {
  it('one cap: projections cap at 85, the score-card cap', () => {
    const out = calculateSimulation({ ...input, currentScore: 70 });
    expect(out.projectedScoreMax).toBeLessThanOrEqual(85);
    // Score card = this engine's max endpoint: current + full impact sum, cap 85.
    expect(out.projectedScoreMax).toBe(Math.min(85, 70 + 10 + 20));
  });

  it('score-card formula matches the simulator max endpoint', () => {
    const out = calculateSimulation(input);
    // ax81: each fix contributes its ONE canonical impact (metadata
    // midpoint: faq_schema 8, jsonld 10), not the stored predicted_impact
    // (10/20 here) — legacy stored values are normalised at read time.
    expect(out.projectedScoreMax).toBe(Math.min(85, 30 + 8 + 10));
    expect(out.projectedScoreMin).toBeLessThan(out.projectedScoreMax);
  });

  it('no-fix confidence is the honest estimate tier, not a hardcoded 78%', () => {
    const out = calculateSimulation({ ...input, fixes: [] });
    expect(out.confidence).toBe(40);
    // Item 7: no invented +15 fallback — no fixes means no projected lift.
    expect(out.projectedScoreMax).toBe(30);
    expect(out.projectedScoreMin).toBe(30);
    expect(out.noFixesYet).toBe(true);
  });

  it('unknown fix types contribute no invented impact', () => {
    const out = calculateSimulation({ ...input, fixes: [{ id: 'x', title: 'Mystery', fix_type: 'totally_unknown_fix' }] });
    expect(out.projectedScoreMax).toBe(30);
    expect(out.fixProjections).toHaveLength(0);
    expect(out.noFixesYet).toBe(true);
    const mixed = calculateSimulation({ ...input, fixes: [...fixes, { id: 'x', title: 'Mystery', fix_type: 'totally_unknown_fix' }] });
    expect(mixed.projectedScoreMax).toBe(30 + 8 + 10);
    expect(mixed.noFixesYet).toBe(false);
  });

  it('one grade-band table (the share card table)', () => {
    expect(gradeLabel(90)).toBe('Dominant');
    expect(gradeLabel(75)).toBe('Strong');
    expect(gradeLabel(60)).toBe('Visible');
    expect(gradeLabel(35)).toBe('Emerging');
    expect(gradeLabel(10)).toBe('Not Visible');
  });
});

describe('simulator evidence + bands — b02b source checks', () => {
  it('no hardcoded benchmark presented as database evidence', () => {
    for (const bad of ['INDUSTRY_BENCHMARKS', 'SUCCESS_RATE', 'AVERAGE_IMPROVEMENT', 'similarBusinessCount', '847']) {
      expect(simSrc).not.toContain(bad);
    }
    expect(compSrc).not.toContain('similarBusinessCount');
    expect(compSrc).not.toContain('in our database');
  });

  it('simulator component uses the real basis API + labels cards illustrative', () => {
    expect(compSrc).toContain('/api/simulator/basis');
    expect(compSrc).toContain('SIMULATOR_DISCLAIMER');
    expect(compSrc).toContain('illustrative examples');
    expect(compSrc).toContain('not measured outcomes from real businesses');
  });

  it('report page grades from the shared table + one projection formula', () => {
    expect(reportSrc).toContain('gradeLabel(sc)');
    expect(reportSrc).not.toContain("sc >= 86 ? 'Dominant'");
    // Item 4: one projection formula — lib/projection.projectScore (shared
    // cap, never projects a score DOWN), not a literal 85 or a local min().
    expect(reportSrc).toContain('projectScore(currentScore, totalPredictedImpact)');
    expect(reportSrc).not.toContain('Math.min(MAX_SCORE_CAP, currentScore + totalPredictedImpact)');
    expect(reportSrc).not.toContain('Math.min(85, currentScore + totalPredictedImpact)');
  });
});
