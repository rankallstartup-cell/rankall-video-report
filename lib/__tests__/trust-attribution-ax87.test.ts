import { describe, it, expect, vi } from 'vitest';
import {
  businessMentionIndex,
  splitSentences,
  foldText,
  stripLocationSuffix,
  buildReviewSignals,
  buildCommunitySignals,
  ratingStatus,
} from '../trust';
import { detectTrustSignals } from '../trustServer';
import { fetchRedditMentions } from '../enrichment';

// Offline: no website is fetched in these tests, but keep DNS mocked anyway.
vi.mock('dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}));

const mentions = (sentence: string, name: string, competitors: string[] = []) =>
  businessMentionIndex(sentence, name, competitors) >= 0;

function reviews(name: string, responses: string[], google: { rating?: number | null; reviewCount?: number | null } | null = null, competitorNames: string[] = []) {
  const results = responses.map((response, i) => ({ platform: `P${i + 1}`, response }));
  return buildReviewSignals(results, responses.join('\n'), name, google, { competitorNames });
}
const sig = (list: Array<{ name: string }>, name: string) => list.find(s => s.name === name)! as { name: string; status: string; value: string };

describe('ax87 (a) full distinctive name, longest match wins', () => {
  it('"Smile Dental Group" scan does NOT take "Smile Dental has 954 reviews"', () => {
    expect(mentions('Smile Dental has 954 reviews.', 'Smile Dental Group')).toBe(false);
    const r = reviews('Smile Dental Group', ['Smile Dental has 954 reviews.']);
    expect(sig(r, 'Review count').status).toBe('missing');
  });

  it('"Smile Dental" scan is NOT credited with "Smile Dental Group has 954 reviews"', () => {
    expect(mentions('Smile Dental Group has 954 reviews.', 'Smile Dental')).toBe(false);
    const r = reviews('Smile Dental', ['Smile Dental Group has 954 reviews.']);
    expect(sig(r, 'Review count').value).not.toContain('954');
  });

  it('positive: the exact name is still attributed', () => {
    expect(mentions('Smile Dental Group has 954 reviews.', 'Smile Dental Group')).toBe(true);
    expect(mentions('We like Smile Dental, which has 80 reviews.', 'Smile Dental')).toBe(true);
    const r = reviews('Smile Dental', ['Smile Dental has 80 reviews.']);
    expect(sig(r, 'Review count').value).toContain('80');
  });

  it('a longer KNOWN competitor name containing the business name is attributed to the competitor', () => {
    // "Smile Dental Partners of Dallas" — continuation is lowercase "of", so
    // only the known-competitor list can tell them apart.
    const s = 'Smile Dental of Dallas has 954 reviews.';
    expect(mentions(s, 'Smile Dental')).toBe(true);
    expect(mentions(s, 'Smile Dental', ['Smile Dental of Dallas'])).toBe(false);
    const r = reviews('Smile Dental', [s], null, ['Smile Dental of Dallas']);
    expect(sig(r, 'Review count').status).toBe('missing');
  });

  it('short form without the trailing descriptor still counts ("Brite Smiles")', () => {
    expect(mentions('Brite Smiles fixed my tooth.', 'Brite Smiles Dentistry')).toBe(true);
    // …but not when it continues into a different business name.
    expect(mentions('Brite Smiles Dental Care has 50 reviews.', 'Brite Smiles Dentistry')).toBe(false);
  });

  it('location suffixes in the raw input are not required in every sentence', () => {
    expect(stripLocationSuffix('Bright Smile Dental Dallas TX')).toBe('Bright Smile Dental');
    expect(stripLocationSuffix('Smile Dental Group TX')).toBe('Smile Dental Group');
    expect(stripLocationSuffix('Brite Smiles in Dallas')).toBe('Brite Smiles');
    expect(stripLocationSuffix('Jack in the Box')).toBe('Jack in the Box');
    expect(stripLocationSuffix('Power Rogers, LLP')).toBe('Power Rogers, LLP');
    expect(mentions('Bright Smile Dental has 40 reviews.', 'Bright Smile Dental Dallas TX')).toBe(true);
  });
});

describe('ax87 (b) abbreviation-aware sentence splitting', () => {
  it('does not split on Dr. / St. / Mr. / decimals', () => {
    expect(splitSentences('Dr. Smith Dental has 300 reviews. It is great.')).toEqual([
      'Dr. Smith Dental has 300 reviews.',
      'It is great.',
    ]);
    expect(splitSentences('Located in St. Louis, Mr. Lee runs it.')).toHaveLength(1);
    expect(splitSentences('Rated 4.9 stars by patients.')).toHaveLength(1);
    expect(splitSentences('Acme Inc. has 50 reviews. Next one.')).toHaveLength(2);
  });

  it('a count after "Dr." stays attributed to the business', () => {
    const r = reviews('Dr. Smith Dental', ['Dr. Smith Dental has 300 reviews and a 4.9/5 rating.']);
    expect(sig(r, 'Review count').value).toContain('300');
    expect(sig(r, 'Rating mentions').value).toContain('4.9/5');
  });

  it('negative: a real sentence boundary still separates competitor numbers', () => {
    const r = reviews('Brite Smiles Dentistry', ['Brite Smiles Dentistry is nice. Competitor Dental has 500 reviews.']);
    expect(sig(r, 'Review count').status).toBe('missing');
  });
});

describe('ax87 (c) Unicode-normalised names', () => {
  it('folds accents on both sides, preserving indices', () => {
    expect(foldText('Café Müller')).toBe('cafe muller');
    expect(foldText('Café Müller').length).toBe('Café Müller'.length);
    expect(mentions('Cafe Muller has 120 reviews.', 'Café Müller')).toBe(true);
    expect(mentions('Café Müller has 120 reviews.', 'Cafe Muller')).toBe(true);
  });

  it('negative: a different accented name does not match', () => {
    expect(mentions('Café Müllerhaus has 120 reviews.', 'Café Müller')).toBe(false);
    expect(mentions('Café Schmidt has 120 reviews.', 'Café Müller')).toBe(false);
  });

  it('review count is attributed for an accented name', () => {
    const r = reviews('Café Müller', ['Cafe Muller has 120 reviews.']);
    expect(sig(r, 'Review count').value).toContain('120');
  });
});

describe('ax87 (d) signals use the resolved Places name', () => {
  it('reviews/community/AI attribute against enrichment.google.name, not the raw input', async () => {
    const report = await detectTrustSignals({
      businessInput: 'Bright Smile Dental Dallas TX', // typo'd raw input
      scanResults: [{ platform: 'ChatGPT', response: 'Brite Smiles Dentistry has 210 reviews and a 4.8/5 rating.', mentioned: true }],
      citationSources: [],
      enrichment: { google: { name: 'Brite Smiles Dentistry' } },
    }, 'US');
    const count = report.reviews.find(s => s.name === 'Review count')!;
    expect(count.value).toContain('210');
  });

  it('falls back to the raw input when no resolved name exists', async () => {
    const report = await detectTrustSignals({
      businessInput: 'Brite Smiles Dentistry',
      scanResults: [{ platform: 'ChatGPT', response: 'Brite Smiles Dentistry has 210 reviews.', mentioned: true }],
      citationSources: [],
      enrichment: null,
    }, 'US');
    expect(report.reviews.find(s => s.name === 'Review count')!.value).toContain('210');
  });
});

describe('ax87 (e) review mentions need >= 2 platforms for good', () => {
  it('"1 of 1 platforms" is warning, not good', () => {
    const r = reviews('Brite Smiles Dentistry', ['Brite Smiles Dentistry has great reviews.']);
    expect(sig(r, 'Review mentions').status).toBe('warning');
  });

  it('2 of 2 platforms is good', () => {
    const r = reviews('Brite Smiles Dentistry', [
      'Brite Smiles Dentistry has great reviews.',
      'Patients leave glowing reviews for Brite Smiles Dentistry.',
    ]);
    expect(sig(r, 'Review mentions').status).toBe('good');
  });

  it('2 of 6 platforms is not good (below half)', () => {
    const r = reviews('Brite Smiles Dentistry', [
      'Brite Smiles Dentistry has great reviews.',
      'Brite Smiles Dentistry reviews are positive.',
      'Brite Smiles Dentistry is a dentist.', 'Brite Smiles Dentistry is in Dallas.',
      'Brite Smiles Dentistry opened in 2001.', 'Brite Smiles Dentistry offers implants.',
    ]);
    expect(sig(r, 'Review mentions').status).toBe('warning');
  });
});

describe('ax87 (f) short distinctive words', () => {
  it('"Ace Dental" vs "Grace Dental" stay apart', () => {
    expect(mentions('Grace Dental has 300 reviews.', 'Ace Dental')).toBe(false);
    expect(mentions('Ace Dental has 300 reviews.', 'Ace Dental')).toBe(true);
    expect(mentions('Ace Hardware has 300 reviews.', 'Ace Dental')).toBe(false);
  });

  it('"Joe\'s Pizza" vs "Tony\'s Pizza" stay apart', () => {
    expect(mentions("Tony's Pizza has 300 reviews.", "Joe's Pizza")).toBe(false);
    expect(mentions('Joe’s Pizza has 300 reviews.', "Joe's Pizza")).toBe(true);
    expect(mentions('Joes Pizza has 300 reviews.', "Joe's Pizza")).toBe(true);
  });

  it('Reddit matching keeps short distinctive tokens ("The Dental Co", "Joe\'s Bar")', async () => {
    const stub = (children: Array<{ title: string; selftext?: string; subreddit: string }>) =>
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: { children: children.map(c => ({ data: c })) } }) })));
    try {
      stub([
        { title: "Joe's Bar is the best dive bar", subreddit: 'Austin' },
        { title: 'Best bar in Austin?', subreddit: 'Austin' },
      ]);
      expect((await fetchRedditMentions("Joe's Bar", 'Austin'))?.mentionCount).toBe(1);

      stub([
        { title: 'The Dental Co fixed my crown', subreddit: 'Dallas' },
        { title: 'Any good dental office near downtown?', subreddit: 'Dallas' },
      ]);
      expect((await fetchRedditMentions('The Dental Co', 'Dallas'))?.mentionCount).toBe(1);

      stub([
        { title: 'Grace Dental is great', subreddit: 'Dallas' },
        { title: 'Ace Dental cleaned my teeth', subreddit: 'Dallas' },
        { title: 'Best dental clinic?', subreddit: 'Dallas' },
      ]);
      expect((await fetchRedditMentions('Ace Dental', 'Dallas'))?.mentionCount).toBe(1);

      stub([{ title: "Tony's Pizza is great", subreddit: 'NYC' }]);
      expect((await fetchRedditMentions("Joe's Pizza", 'NYC'))?.mentionCount).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('#11 multi-platform dedupe, negation window, rating thresholds', () => {
  it('"Google reviews" and "google reviews" are ONE platform', () => {
    const r = reviews('Brite Smiles Dentistry', [
      'Brite Smiles Dentistry has strong Google reviews. Brite Smiles Dentistry google reviews mention gentle care.',
    ]);
    expect(sig(r, 'Multi-platform reviews').status).toBe('missing');
  });

  it('two distinct platforms are multi-platform', () => {
    const r = reviews('Brite Smiles Dentistry', ['Brite Smiles Dentistry has Google reviews and Yelp reviews.']);
    expect(sig(r, 'Multi-platform reviews').status).toBe('good');
  });

  it('"Not only does X have 300 reviews" is NOT negated', () => {
    const r = reviews('Brite Smiles Dentistry', ['Not only does Brite Smiles Dentistry have 300 reviews, it also responds to reviews.']);
    expect(sig(r, 'Review count').value).toContain('300');
    expect(sig(r, 'Response rate signals').status).toBe('good');
  });

  it('a real negation is still negated', () => {
    const r = reviews('Brite Smiles Dentistry', ['Brite Smiles Dentistry does not have 300 reviews.']);
    expect(sig(r, 'Review count').status).toBe('missing');
  });

  it('negation in an earlier clause does not leak across a comma/but', () => {
    const r = reviews('Brite Smiles Dentistry', ['Brite Smiles Dentistry is not cheap, but it has 120 reviews.']);
    expect(sig(r, 'Review count').value).toContain('120');
  });

  it('rating thresholds: good >= 4.0, warning 3.5–3.99, danger < 3.5', () => {
    expect(ratingStatus(4.0)).toBe('good');
    expect(ratingStatus(4.7)).toBe('good');
    expect(ratingStatus(3.9)).toBe('warning');
    expect(ratingStatus(3.5)).toBe('warning');
    expect(ratingStatus(3.4)).toBe('danger');
    expect(sig(reviews('X Dental', [], { rating: 3.2, reviewCount: 10 }), 'Rating mentions').status).toBe('danger');
    expect(sig(reviews('X Dental', [], { rating: 3.7, reviewCount: 10 }), 'Rating mentions').status).toBe('warning');
    expect(sig(reviews('X Dental', [], { rating: 4.6, reviewCount: 10 }), 'Rating mentions').status).toBe('good');
    expect(sig(reviews('Brite Smiles Dentistry', ['Brite Smiles Dentistry is rated 3.1/5.']), 'Rating mentions').status).toBe('danger');
    expect(sig(reviews('Brite Smiles Dentistry', []), 'Rating mentions').status).toBe('missing');
  });
});

describe('community signals use the same attribution', () => {
  it('a competitor sentence with a longer name does not give this business press', () => {
    const c = buildCommunitySignals('Smile Dental Group was featured in the Dallas Morning News.', null, 'Smile Dental');
    expect(c.find(s => s.name === 'Local news mentions')!.status).toBe('missing');
  });
});
