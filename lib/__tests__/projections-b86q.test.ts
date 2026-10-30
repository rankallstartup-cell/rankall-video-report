import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculateSimulation } from '@/lib/simulator';

// b86q — one report showed: two end scores (19 point vs 15–19
// range), two timeframes (4 weeks vs a 30-day plan that
// scheduled FAQ a week later than the timeline), per-fix gains
// that differed between the queue (+8) and the timeline
// (+6–8 ranges / +7 mids), and a confidence that flipped
// 55% <-> 85% across reloads as the basis fetch landed.

describe('b86q — the simulator engine gives one number per fix and one end score', () => {
  const out = calculateSimulation({
    currentScore: 1,
    industry: 'dentist',
    city: 'Dallas',
    countryCode: 'US',
    competitorScore: null,
    platformsCovered: 9,
    fixes: [
      { id: 'a', title: 'LocalBusiness JSON-LD', fix_type: 'jsonld' },
      { id: 'b', title: 'FAQ Schema', fix_type: 'faq_schema' },
      { id: 'c', title: 'Bing Places', fix_type: 'bing_places' },
    ],
    revenueGap: 8533,
    revenueSymbol: '$',
  });

  it('per-fix gains are the canonical queue numbers', () => {
    const byType = new Map(out.fixProjections.map(p => [p.fixType, p.pointsGained]));
    expect(byType.get('jsonld')).toBe(10);
    expect(byType.get('faq_schema')).toBe(8);
    // bing_places has no canonical impact range — the engine
    // excludes it rather than inventing a number (item-7 rule).
    expect(byType.has('bing_places')).toBe(false);
  });

  it('the headline projection equals the queue total (1 + 18 = 19)', () => {
    expect(out.projectedScoreMid).toBe(19);
    expect(out.projectedScoreMax).toBe(19);
    expect(out.projectedScoreMin).toBeLessThanOrEqual(19);
  });
});

const sim = readFileSync(join(process.cwd(), 'components/RecommendationSimulator.tsx'), 'utf8');
const report = readFileSync(join(process.cwd(), 'app/report/[id]/page.tsx'), 'utf8');

describe('b86q — deterministic basis + one scheduler', () => {
  it('basis-dependent text waits for the basis fetch to settle', () => {
    expect(sim).toContain('basisSettled');
    expect(sim).toContain('Calculating the data basis for this projection…');
    expect(sim).toContain('Confidence level: calculating…');
  });

  it('the report fix plan derives its weeks from the same engine', () => {
    expect(report).toContain('calculateSimulation({');
    expect(report).toContain('projByType.get(fix.fix_type)');
    expect(report).toContain('Your Fix Plan');
    expect(report).not.toContain('Your 30-Day Plan');
    expect(report).not.toContain("{ wk: 'Week 2–3', fix: roadmapFixes[1] }");
  });
});
