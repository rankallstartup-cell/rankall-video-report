import { describe, it, expect } from 'vitest';
import { detectTrustSignals } from '../trustServer';

// azzv: Local-news + Awards patterns must require real evidence.
// Generic words ('article', 'featured', 'press', 'top rated') and the
// precedence bug (`NEWS && cover || feature` => bare 'feature' = press
// coverage) used to score both signals = good with no real evidence.
const BIZ = 'Brite Smiles Dentistry';

async function community(response: string) {
  const report = await detectTrustSignals(
    {
      businessInput: BIZ,
      scanResults: [{ platform: 'ChatGPT', response, mentioned: true }],
      citationSources: [],
      enrichment: null,
    },
    'US',
  );
  const byName = (name: string) => report.community.find((s) => s.name === name)!;
  return { news: byName('Local news mentions'), awards: byName('Awards or recognition') };
}

describe('trust community signals — azzv press/award evidence', () => {
  it('generic words do not score news/awards good', async () => {
    const { news, awards } = await community(
      'In this article, Brite Smiles Dentistry features free parking and is top rated.',
    );
    expect(news.status).not.toBe('good');
    expect(awards.status).not.toBe('good');
  });

  it('the old precedence bug is gone: bare "feature" is not press coverage', async () => {
    const { news } = await community('Brite Smiles Dentistry features free parking.');
    expect(news.status).toBe('missing');
  });

  it('real press evidence scores news good ("featured in <outlet>")', async () => {
    const { news } = await community(
      'Brite Smiles Dentistry was featured in the Dallas Morning News.',
    );
    expect(news.status).toBe('good');
    expect(news.value).toContain('Press or news coverage detected');
  });

  it('real press evidence scores news good ("according to <outlet>")', async () => {
    const { news } = await community(
      'According to the Dallas Morning News, Brite Smiles Dentistry is the best.',
    );
    expect(news.status).toBe('good');
  });

  it('a named award scores awards good (award word + award/year context)', async () => {
    const { awards } = await community('Brite Smiles Dentistry won the 2024 Best Dentist award.');
    expect(awards.status).toBe('good');
  });

  it('bare praise does not score awards good ("top rated", "best of")', async () => {
    const { awards } = await community(
      'Brite Smiles Dentistry is top rated and the best of Dallas.',
    );
    expect(awards.status).toBe('warning');
  });

  it('negated award claims do not count ("won no awards")', async () => {
    const { awards } = await community('Brite Smiles Dentistry has won no awards.');
    expect(awards.status).toBe('missing');
  });

  it('a competitor’s award does not leak into this business’s signals', async () => {
    const { awards } = await community(
      'Brite Smiles Dentistry is a great clinic. Competitor Dental won the 2024 Best Dentist award.',
    );
    expect(awards.status).not.toBe('good');
  });
});
