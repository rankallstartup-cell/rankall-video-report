import { describe, it, expect } from 'vitest';
import { detectTrustSignals } from '../trustServer';

const BIZ = 'Brite Smiles Dentistry';

function review(name: string) {
  return (s: { name: string; value: string; status: string }) => s.name === name;
}

async function run(opts: {
  responses: string[];
  google?: { rating?: number | null; reviewCount?: number | null } | null;
  businessInput?: string;
}) {
  const report = await detectTrustSignals(
    {
      businessInput: opts.businessInput ?? BIZ,
      scanResults: opts.responses.map((response, i) => ({
        platform: `Platform${i + 1}`,
        response,
        mentioned: true,
      })),
      citationSources: [],
      enrichment: opts.google === undefined ? null : { google: opts.google },
    },
    'US',
  );
  return report.reviews;
}

describe('trust review signals — azzr attribution + Places reconciliation', () => {
  it('does not leak a competitor count/ratings from a separate sentence', async () => {
    const reviews = await run({
      responses: [
        'Brite Smiles Dentistry has 20 reviews and a 4.8/5 rating. Competitor Dental has 500 reviews and a 5.0/5 rating.',
      ],
    });
    const count = reviews.find(review('Review count'))!;
    expect(count.value).toContain('20');
    expect(count.value).not.toContain('500');
    const ratings = reviews.find(review('Rating mentions'))!;
    expect(ratings.value).toContain('4.8/5');
    expect(ratings.value).not.toContain('5.0/5');
  });

  it('picks the count nearest AFTER the business name in a mixed sentence', async () => {
    const reviews = await run({
      responses: [
        'Competitor Dental has 500 reviews, but Brite Smiles Dentistry has 20 reviews.',
      ],
    });
    const count = reviews.find(review('Review count'))!;
    expect(count.value).toContain('20');
    expect(count.value).not.toContain('500');
  });

  it('prefers verified Places data and shows the AI figure with its source', async () => {
    const reviews = await run({
      responses: ['Brite Smiles Dentistry has 800 reviews and a 4.9/5 rating.'],
      google: { reviewCount: 312, rating: 4.7 },
    });
    const count = reviews.find(review('Review count'))!;
    expect(count.value).toContain('312 reviews (Google Places)');
    expect(count.value).toContain('AI responses cite up to 800');
    expect(count.status).toBe('good'); // Places 312 >= 50
    const ratings = reviews.find(review('Rating mentions'))!;
    expect(ratings.value).toContain('Google Places rating: 4.7/5');
    expect(ratings.value).toContain('AI responses mention 4.9/5');
  });

  it('labels AI-cited numbers as AI-cited when Places data is absent', async () => {
    const reviews = await run({
      responses: ['Brite Smiles Dentistry has 800 reviews.'],
      google: null,
    });
    const count = reviews.find(review('Review count'))!;
    expect(count.value).toContain('AI responses cite up to 800 reviews');
    expect(count.value).not.toContain('detected');
  });

  it('skips negated matches (no reviews / does not respond / not friendly)', async () => {
    const reviews = await run({
      responses: [
        'Brite Smiles Dentistry has no reviews. It does not respond to reviews. The staff is not friendly.',
      ],
    });
    expect(reviews.find(review('Review count'))!.status).toBe('missing');
    expect(reviews.find(review('Review mentions'))!.status).toBe('missing');
    expect(reviews.find(review('Response rate signals'))!.status).toBe('missing');
    expect(reviews.find(review('Review keywords'))!.status).toBe('missing');
    expect(reviews.find(review('Review keywords'))!.value).not.toContain('friendly');
  });

  it('parses comma counts (1,200 reviews = 1200, not 200)', async () => {
    const reviews = await run({
      responses: ['Brite Smiles Dentistry has 1,200 reviews.'],
      google: null,
    });
    const count = reviews.find(review('Review count'))!;
    expect(count.value).toContain('1,200');
  });

  it('does not count a competitor-only response as a review mention', async () => {
    const reviews = await run({
      responses: ['Competitor Dental has 500 reviews.'],
    });
    expect(reviews.find(review('Review mentions'))!.status).toBe('missing');
    expect(reviews.find(review('Review count'))!.status).toBe('missing');
  });
});
