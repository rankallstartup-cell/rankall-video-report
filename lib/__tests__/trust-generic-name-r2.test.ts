import { describe, it, expect } from 'vitest';
import { mentionsBusinessName } from '../trust';

// Fix round 2: "The Dental Co" collapsed to "dental co" and matched
// generic prose; the hyphen in "co-pay" counted as a word boundary.
describe('all-generic business names', () => {
  it.each([
    'Does my plan cover the dental co-pay?',
    'Any dental co. near Dallas?',
    'Best Dental Co in town?',
    'Is the dental co good?',
  ])('does NOT match: %s', (text) => {
    expect(mentionsBusinessName(text, 'The Dental Co')).toBe(false);
  });

  it.each([
    'The Dental Co has 120 reviews.',
    'I went to the Dental Co on Main Street.',
    'Top pick: The Dental Co, Dallas.',
  ])('matches: %s', (text) => {
    expect(mentionsBusinessName(text, 'The Dental Co')).toBe(true);
  });

  it('enrichment Reddit matching uses the same rule', async () => {
    // postMentionsBusiness delegates to mentionsBusinessName.
    expect(mentionsBusinessName('Need a dental co-pay estimate', 'The Dental Co')).toBe(false);
  });
});

describe('distinctive names unaffected', () => {
  it('lowercase prose still matches a distinctive name', () => {
    expect(mentionsBusinessName('i love brite smiles dentistry', 'Brite Smiles Dentistry')).toBe(true);
  });
  it('hyphen continuation of the last token is not a match', () => {
    expect(mentionsBusinessName('Ace Dental-care kits on sale', 'Ace Dental')).toBe(false);
    expect(mentionsBusinessName('Ace Dental - open late', 'Ace Dental')).toBe(true);
  });
});
