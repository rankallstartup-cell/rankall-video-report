import { describe, it, expect } from 'vitest';
import { calculateSimulation, MAX_SCORE_CAP } from '../../../lib/simulator';

// b02b residual: the dashboard simulator chart hardcoded a 95 cap
// while the engine capped at its own constant — the two surfaces
// disagreed. The cap is now exported from the engine and the chart
// uses it, so no surface can hardcode its own cap again.
describe('b02b chart cap = engine cap', () => {
  it('a score above the cap is never projected down', () => {
    const out = calculateSimulation({
      currentScore: 90,
      industry: 'dentist',
      city: 'Austin',
      countryCode: 'US',
      competitorScore: null,
      platformsCovered: 2,
      fixes: [
        { id: '1', fix_type: 'faq_schema', title: 'FAQ Schema', impact: 'high', pointsGained: 0 } as never,
        { id: '2', fix_type: 'google_business', title: 'GBP', impact: 'high', pointsGained: 0 } as never,
        { id: '3', fix_type: 'reviews', title: 'Reviews', impact: 'high', pointsGained: 0 } as never,
      ],
      revenueGap: 0,
      revenueSymbol: '$',
    });
    // b02b: a 90 start is already above the cap — the projection keeps
    // the current score as its ceiling and never projects DOWN to the cap
    // (the old assertion here encoded that 90 → 85 bug).
    expect(out.projectedScoreMax).toBe(90);
    expect(out.projectedScoreMin).toBe(90);
    expect(out.revenueRecovered).toBeGreaterThanOrEqual(0);
  });

  it('below the cap, projections never exceed MAX_SCORE_CAP', () => {
    const out = calculateSimulation({
      currentScore: 80, industry: 'dentist', city: 'Austin', countryCode: 'US',
      competitorScore: null, platformsCovered: 2,
      fixes: [
        { id: '1', fix_type: 'faq_schema', title: 'FAQ Schema' },
        { id: '2', fix_type: 'jsonld', title: 'JSON-LD' },
      ],
      revenueGap: 0, revenueSymbol: '$',
    });
    expect(out.projectedScoreMax).toBe(MAX_SCORE_CAP);
    expect(out.projectedScoreMin).toBeLessThanOrEqual(MAX_SCORE_CAP);
  });
});
