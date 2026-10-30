import { describe, it, expect } from 'vitest';
import { buildDirectorySignals } from '../trust';

// Fix round 2: directory 'mentioned in scan' used the whole response.
const yelp = (text: string) =>
  buildDirectorySignals([], text, ['yelp.com'], { businessName: 'Brite Smiles Dentistry' }).find(s => s.name === 'Yelp');

describe('directory signals are sentence-attributed', () => {
  it('generic advice sentence does not count', () => {
    const s = yelp('Brite Smiles Dentistry is a popular choice. Look for reviews on Yelp before you book.');
    expect(s?.status).toBe('missing');
  });
  it('a sentence naming the business AND the directory counts', () => {
    const s = yelp('Brite Smiles Dentistry has strong reviews on Yelp.');
    expect(s?.status).toBe('warning');
  });
  it('competitor sentence with Yelp does not count', () => {
    const s = yelp('Brite Smiles Dentistry is nearby. Smile Co has 400 reviews on Yelp.');
    expect(s?.status).toBe('missing');
  });
  it('without a business name the legacy whole-text behaviour is kept', () => {
    const s = buildDirectorySignals([], 'Look for reviews on Yelp.', ['yelp.com']).find(x => x.name === 'Yelp');
    expect(s?.status).toBe('warning');
  });
});
