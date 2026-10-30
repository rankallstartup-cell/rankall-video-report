import { describe, it, expect } from 'vitest';
import { detectBusinessMention } from '../analyser-ml';

// b879: fuzzy matches need a distinctive word of the name.
describe('detectBusinessMention — b879', () => {
  const answer = 'For a great smile in Dallas, top dental offices include Uptown Dental Studio and DTX Dental Studio. Many patients love their smile results in Dallas.';
  it('generic + city words alone are not a mention', () => {
    expect(detectBusinessMention(answer, 'Bright Smile Dental Dallas', 'Dallas')).toBe(false);
    expect(detectBusinessMention(answer, 'Bright Smile Dental', 'Dallas')).toBe(false);
  });
  it('a real mention still counts', () => {
    expect(detectBusinessMention('I recommend Bright Smile Dental in Dallas for cleanings.', 'Bright Smile Dental', 'Dallas')).toBe(true);
    expect(detectBusinessMention('Try Bright Smile dentistry on Main — the bright smile dental team is friendly.', 'Bright Smile Dental Dallas', 'Dallas')).toBe(true);
  });
});
