import { describe, it, expect } from 'vitest';
import { classifyCitationSource, groupCitationSources } from '@/lib/citationOwnership';

// STD-07: citation sources must be grouped honestly — known sources get
// their category, unknown ones are 'other', never forced.

describe('classifyCitationSource', () => {
  it('classifies review platforms', () => {
    expect(classifyCitationSource('Yelp')).toBe('review');
    expect(classifyCitationSource('Healthgrades')).toBe('review');
    expect(classifyCitationSource('Trustpilot')).toBe('review');
  });

  it('classifies UGC', () => {
    expect(classifyCitationSource('Reddit')).toBe('ugc');
  });

  it('is case-insensitive and trims', () => {
    expect(classifyCitationSource('  YELP ')).toBe('review');
  });

  it('returns other for unknown sources (never forced)', () => {
    expect(classifyCitationSource('SomeRandomBlog')).toBe('other');
    expect(classifyCitationSource('')).toBe('other');
  });
});

describe('groupCitationSources', () => {
  it('groups by category with counts, most-cited first', () => {
    const groups = groupCitationSources(['Yelp', 'Reddit', 'Yelp', 'Google']);
    const review = groups.find(g => g.category === 'review')!;
    expect(review.sources[0]).toEqual({ name: 'Yelp', count: 2 });
    expect(review.total).toBe(2);
    const ugc = groups.find(g => g.category === 'ugc')!;
    expect(ugc.sources[0].name).toBe('Reddit');
  });

  it('returns empty for no sources (section hides)', () => {
    expect(groupCitationSources([])).toEqual([]);
  });

  it('ignores blanks', () => {
    const groups = groupCitationSources(['', '  ', 'Yelp']);
    expect(groups).toHaveLength(1);
    expect(groups[0].sources[0].name).toBe('Yelp');
  });
});
