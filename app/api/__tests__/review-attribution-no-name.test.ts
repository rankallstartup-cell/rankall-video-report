import { describe, it, expect } from 'vitest';
import { buildReviewSignals } from '../../../lib/trust';

// azzr (residual): the review extractors fell back to UNATTRIBUTED
// whole-text extraction when the business name was empty —
// sentenceMentionsBusiness('' ) returned true for every sentence,
// and extractReviewCount reverted to whole-text MAX. So a
// competitor's numbers leaked in whenever the name was missing.
// No name -> no attribution -> no claim.
describe('azzr no-name review attribution', () => {
  const competitorText =
    'Competitor Dental has 500 reviews and a 4.9/5 rating. ' +
    'Competitor Dental is reviewed on Google and Yelp. ' +
    'Competitor Dental has friendly staff and great service.';
  const results = [{ platform: 'ChatGPT', response: competitorText }];

  it('empty business name claims no review numbers', () => {
    const signals = buildReviewSignals(results, competitorText, '', null);
    const byName = Object.fromEntries(signals.map(s => [s.name, s.value]));
    expect(byName['Review count']).toBe('Review count not mentioned in AI responses');
    expect(byName['Rating mentions']).toBe('No star ratings mentioned in AI platform responses');
    expect(byName['Review keywords']).toBe('No positive review keywords detected in AI responses');
    // #11: zero attributed platforms is no longer mislabelled "single platform".
    expect(byName['Multi-platform reviews']).toBe('Reviews not referenced on any named platform in AI responses');
    expect(byName['Review mentions']).toContain('Reviews not mentioned by any');
  });

  it('attributed counts still work with a real name', () => {
    const text =
      'Competitor Dental has 500 reviews. ' +
      'Brite Smiles Dentistry has 20 reviews and a 4.7/5 rating.';
    const signals = buildReviewSignals(
      [{ platform: 'ChatGPT', response: text }], text, 'Brite Smiles Dentistry', null);
    const byName = Object.fromEntries(signals.map(s => [s.name, s.value]));
    // The business's own 20, never the competitor's 500.
    expect(byName['Review count']).toContain('20 reviews');
    expect(byName['Review count']).not.toContain('500');
    expect(byName['Rating mentions']).toContain('4.7/5');
    expect(byName['Rating mentions']).not.toContain('4.9/5');
  });
});
