import { describe, it, expect } from 'vitest';
import { detectTrustSignals } from '../trustServer';

// azzw: 'Platform consensus' must measure AGREEMENT, not coverage.
// The old `mentionRate >= 0.7` relabelled coverage as consensus, and the
// Consistent-description signal scored a single response 'missing'
// ('Inconsistent descriptions') when there was nothing inconsistent.
const BIZ = 'Brite Smiles Dentistry';

async function aiSignals(responses: (string | null)[]) {
  const report = await detectTrustSignals(
    {
      businessInput: BIZ,
      scanResults: responses.map((response, i) => ({
        platform: `Platform${i + 1}`,
        response,
        mentioned: response !== null,
      })),
      citationSources: [],
      enrichment: null,
    },
    'US',
  );
  const byName = (name: string) => report.aiPlatforms.find((s) => s.name === name)!;
  return {
    mentionRate: byName('Platform mention rate'),
    consensus: byName('Platform consensus'),
    consistent: byName('Consistent description'),
  };
}

// Nine mentioning responses with pairwise-disjoint vocabularies:
// high coverage (9/11) but zero agreement.
const DIVERGENT = [
  'Brite Smiles Dentistry veneers whitening cosmetic porcelain.',
  'Brite Smiles Dentistry extractions canals emergency surgery.',
  'Brite Smiles Dentistry braces orthodontics aligners retainers.',
  'Brite Smiles Dentistry implants titanium crowns bridges.',
  'Brite Smiles Dentistry cleanings fluoride hygiene polishing.',
  'Brite Smiles Dentistry fillings cavities composite amalgam.',
  'Brite Smiles Dentistry dentures partials relines impressions.',
  'Brite Smiles Dentistry sedation anxiety nitrous comfort.',
  'Brite Smiles Dentistry pediatric children toddlers playroom.',
];

describe('trust AI-platform signals — azzw real consensus', () => {
  it('high coverage with divergent descriptions is NOT consensus', async () => {
    const { mentionRate, consensus } = await aiSignals([...DIVERGENT, null, null]);
    expect(mentionRate.status).toBe('good'); // 9/11 mentioned
    expect(consensus.status).toBe('warning');
    expect(consensus.value).toContain('disagree');
  });

  it('agreeing descriptions score consensus good', async () => {
    const { consensus } = await aiSignals([
      'Brite Smiles Dentistry offers gentle cleanings, whitening, and fluoride treatments in Flower Mound.',
      'Brite Smiles Dentistry provides gentle cleanings, whitening, and fluoride treatments in Flower Mound.',
    ]);
    expect(consensus.status).toBe('good');
    expect(consensus.value).toContain('agree');
  });

  it('a single response is good (not missing) for consensus + consistent description', async () => {
    const { consensus, consistent } = await aiSignals([
      'Brite Smiles Dentistry offers gentle cleanings in Flower Mound.',
    ]);
    expect(consensus.status).toBe('good');
    expect(consistent.status).toBe('good');
    expect(consistent.value).toContain('nothing to disagree with');
  });

  it('zero mentions is missing (not warning) for consensus + consistent description', async () => {
    const { consensus, consistent } = await aiSignals([null, null]);
    expect(consensus.status).toBe('missing');
    expect(consensus.value).toContain('not measurable');
    expect(consistent.status).toBe('missing');
  });

  it('divergent descriptions score consistent-description missing', async () => {
    const { consistent } = await aiSignals(DIVERGENT.slice(0, 2));
    expect(consistent.status).toBe('missing');
  });
});
