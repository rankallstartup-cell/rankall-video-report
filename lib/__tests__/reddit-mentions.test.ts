import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchRedditMentions } from '../enrichment';

// azzx: fetchRedditMentions must count ONLY results that actually mention
// the business. Reddit search is fuzzy/OR-ish, so results about the
// neighbourhood, the city, or dentists generally used to count as
// 'mentions' (mentionCount = posts.length).
const BIZ = 'Brite Smiles Dentistry';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubReddit(children: Array<{ title: string; selftext?: string; subreddit: string }>) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({
      data: { children: children.map((c) => ({ data: c })) },
    }),
  })));
}

describe('fetchRedditMentions — azzx mention filtering', () => {
  it('counts only posts whose title or selftext mentions the business', async () => {
    stubReddit([
      { title: 'Brite Smiles Dentistry is amazing', subreddit: 'Dentistry' },
      { title: 'Best dentist in Flower Mound?', selftext: 'I went to Brite Smiles Dentistry and loved it', subreddit: 'FlowerMound' },
      { title: 'Best dentists in Dallas?', selftext: 'Looking for recommendations in the area', subreddit: 'Dallas' },
    ]);
    const result = await fetchRedditMentions(BIZ, 'Flower Mound, TX');
    expect(result?.mentionCount).toBe(2);
    expect(result?.topSubreddits).toEqual(['Dentistry', 'FlowerMound']);
  });

  it('counts short-form mentions ("Brite Smiles")', async () => {
    stubReddit([
      { title: 'Brite Smiles fixed my tooth', subreddit: 'Dentistry' },
    ]);
    const result = await fetchRedditMentions(BIZ, 'Flower Mound, TX');
    expect(result?.mentionCount).toBe(1);
  });

  it('does not count a competitor post as a mention', async () => {
    stubReddit([
      { title: 'Competitor Dental is great', selftext: 'Best dentist in town', subreddit: 'Dallas' },
    ]);
    const result = await fetchRedditMentions(BIZ, 'Flower Mound, TX');
    expect(result?.mentionCount).toBe(0);
    expect(result?.topSubreddits).toEqual([]);
    expect(result?.sentiment).toBeNull();
  });

  it('computes sentiment from mentioning posts only', async () => {
    stubReddit([
      { title: 'Brite Smiles Dentistry is great and amazing', subreddit: 'Dentistry' },
      { title: 'Terrible scam dentist, avoid', subreddit: 'Dallas' },
    ]);
    const result = await fetchRedditMentions(BIZ, 'Flower Mound, TX');
    expect(result?.mentionCount).toBe(1);
    expect(result?.sentiment).toBe('positive');
  });
});
