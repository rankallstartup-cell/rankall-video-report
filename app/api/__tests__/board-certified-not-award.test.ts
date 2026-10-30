import { describe, it, expect } from 'vitest';
import { buildCommunitySignals } from '../../../lib/trust';

// azzv (residual): "board-certified" satisfied the award-word
// ("certified") + context ("board") pair on its own, marking
// Awards = good for a credential, not an award. Same for
// "certified by the board". Certification phrases are stripped
// before the award-evidence check; a real award still counts.
describe('azzv board-certification is not an award', () => {
  const awards = (text: string) =>
    buildCommunitySignals(text, null, 'Brite Smiles Dentistry')
      .find(s => s.name === 'Awards or recognition')!;

  it('board-certified alone is not award evidence', () => {
    const s = awards('Brite Smiles Dentistry is board-certified.');
    expect(s.status).not.toBe('good');
    expect(s.value).toContain('no verifiable award named');
  });

  it('certified by the board alone is not award evidence', () => {
    const s = awards('Brite Smiles Dentistry is certified by the state board.');
    expect(s.status).not.toBe('good');
  });

  it('a real award still counts, with or without the credential', () => {
    const s1 = awards('Brite Smiles Dentistry won the Best of Austin award.');
    expect(s1.status).toBe('good');
    const s2 = awards('Brite Smiles Dentistry is board-certified and won the Best of Austin award.');
    expect(s2.status).toBe('good');
  });
});
