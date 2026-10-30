import { describe, it, expect } from 'vitest';
import {
  canonicalFixImpact,
  withCanonicalImpacts,
  impactRangeForFix,
  buildFixEvidence,
} from '../fixIntelligence';

// ax81 / ax6v: ONE impact number per fix — the metadata range midpoint —
// on every surface, normalised at read time so legacy rows with old stored
// numbers (16/18/20/22) show the queue's number.
describe('canonicalFixImpact', () => {
  it('is the metadata range midpoint', () => {
    expect(canonicalFixImpact('faq_schema')).toBe(impactRangeForFix('faq_schema').mid);
    expect(canonicalFixImpact('faq_schema')).toBe(8);     // +6 to +10
    expect(canonicalFixImpact('jsonld')).toBe(10);        // alias → +8 to +12
    expect(canonicalFixImpact('knowledge_panel')).toBe(23);
  });

  it('lies inside the displayed range for every known type', () => {
    for (const ft of ['faq_schema', 'jsonld', 'reviews', 'reddit', 'directory', 'gbp_optimizer', 'directory_citations', 'review_velocity', 'content_optimization', 'google_business']) {
      const r = impactRangeForFix(ft);
      const v = canonicalFixImpact(ft)!;
      expect(v).toBeGreaterThanOrEqual(r.min);
      expect(v).toBeLessThanOrEqual(r.max);
    }
  });

  it('returns null (omit the number) when the fix type is unknown/missing', () => {
    expect(canonicalFixImpact(null)).toBeNull();
    expect(canonicalFixImpact(undefined)).toBeNull();
    expect(canonicalFixImpact('')).toBeNull();
    // Item 7: a type with no metadata range used to get the parser's default
    // 4–7 range and read "+5". It now has no number.
    expect(canonicalFixImpact('totally_unknown_fix')).toBeNull();
    expect(canonicalFixImpact('trust_signals')).toBeNull();
    expect(canonicalFixImpact('crawler_access')).toBeNull();
    expect(canonicalFixImpact('bing_places')).toBeNull();
  });
});

describe('withCanonicalImpacts', () => {
  it('ignores legacy stored predicted_impact and sorts by the canonical number', () => {
    const legacy = [
      { fix_title: 'FAQ', fix_type: 'faq_schema', predicted_impact: 18 },        // legacy 18 → 8
      { fix_title: 'KP', fix_type: 'knowledge_panel', predicted_impact: 1 },     // → 23
      { fix_title: 'Schema', fix_type: 'jsonld', predicted_impact: 16 },         // legacy 16 → 10
      { fix_title: 'Unknown', fix_type: null, predicted_impact: 99 },            // → null, last
    ];
    const out = withCanonicalImpacts(legacy);
    expect(out.map(f => f.fix_title)).toEqual(['KP', 'Schema', 'FAQ', 'Unknown']);
    expect(out.map(f => f.predicted_impact)).toEqual([23, 10, 8, null]);
  });

  it('does not mutate the input rows', () => {
    const rows = [{ fix_type: 'faq_schema', predicted_impact: 18 }];
    withCanonicalImpacts(rows);
    expect(rows[0].predicted_impact).toBe(18);
  });
});

describe('buildFixEvidence', () => {
  it('stores the canonical number, not the old hardcoded literals', () => {
    expect(buildFixEvidence({ fixType: 'jsonld' }).predictedImpact).toBe(canonicalFixImpact('jsonld'));
    expect(buildFixEvidence({ fixType: 'faq_schema' }).predictedImpact).toBe(canonicalFixImpact('faq_schema'));
    expect(buildFixEvidence({ fixType: 'crawler_access' }).predictedImpact).toBe(canonicalFixImpact('crawler_access'));
    expect(buildFixEvidence({ fixType: 'bing_places' }).predictedImpact).not.toBe(20);
  });
});
