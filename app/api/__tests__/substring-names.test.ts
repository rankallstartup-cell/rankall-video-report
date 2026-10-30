import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { businessNamesMatch } from '../../../lib/dataQuality';
import { detectBusinessMention } from '../../../lib/analyser-ml';
import { buildReviewSignals } from '../../../lib/trust';

// ax87: substring name matching — "grace dental" contains "ace
// dental" as a substring, so Grace's mentions counted as Ace's.
// Names must match as whole words, never substrings.
describe('ax87 substring names do not match', () => {
  it('businessNamesMatch is whole-word', () => {
    expect(businessNamesMatch('Ace Dental', 'Grace Dental')).toBe(false);
    expect(businessNamesMatch('Grace Dental', 'Ace Dental')).toBe(false);
    expect(businessNamesMatch('Ace Dental', 'Ace Dental')).toBe(true);
    expect(businessNamesMatch('Ace Dental', 'Ace Dental LLC')).toBe(true);
    expect(businessNamesMatch('Ace Dental Care', 'Grace Dental Care')).toBe(false);
  });

  it('detectBusinessMention rejects substring names', () => {
    expect(detectBusinessMention(
      'Grace Dental is the best dentist in Austin.', 'Ace Dental')).toBe(false);
    expect(detectBusinessMention(
      'Ace Dental is the best dentist in Austin.', 'Ace Dental')).toBe(true);
    expect(detectBusinessMention(
      'Grace Dental Care has great reviews.', 'Ace Dental Care')).toBe(false);
  });

  it('trust attribution rejects substring names', () => {
    const grace = 'Grace Dental has 500 reviews and a 4.9/5 rating.';
    const signals = buildReviewSignals(
      [{ platform: 'ChatGPT', response: grace }], grace, 'Ace Dental', null);
    const byName = Object.fromEntries(signals.map(s => [s.name, s.value]));
    expect(byName['Review count']).toBe('Review count not mentioned in AI responses');
    expect(byName['Rating mentions']).toBe('No star ratings mentioned in AI platform responses');

    const ace = 'Ace Dental has 20 reviews and a 4.7/5 rating.';
    const signals2 = buildReviewSignals(
      [{ platform: 'ChatGPT', response: ace }], ace, 'Ace Dental', null);
    const byName2 = Object.fromEntries(signals2.map(s => [s.name, s.value]));
    expect(byName2['Review count']).toContain('20 reviews');
  });

  it('homepage uses the whole-word matcher, not substring includes', () => {
    const src = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8');
    expect(src).not.toContain('.includes(bizName');
    expect(src).not.toContain('includes(lower)');
  });
});
