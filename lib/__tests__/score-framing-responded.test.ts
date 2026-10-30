import { describe, it, expect } from 'vitest';
import { outcomeSentence, scoreWithOutcome } from '../scoreFraming';

// b0ff: platforms that never responded must not be reported as
// "recommending competitors". Only responded-but-not-mentioned counts.
describe('outcomeSentence — partial responses (b0ff)', () => {
  it('counts only responding platforms that did not mention you', () => {
    // 12 scanned, 4 responded, 1 mentioned -> 3 recommending competitors, 8 silent
    const s = outcomeSentence(1, 10, 12, 4);
    expect(s).toContain('You appear on 1 of 4 AI platforms that responded.');
    expect(s).toContain('3 are recommending competitors instead of you.');
    expect(s).toContain("8 of 12 platforms didn't respond");
    expect(s).not.toContain('10 are recommending');
  });

  it('singular verb for one non-recommending platform', () => {
    expect(outcomeSentence(10, 60, 12, 11)).toContain('1 is recommending competitors');
  });

  it('every responder mentioned you but some were silent -> no competitor claim', () => {
    const s = outcomeSentence(5, 50, 12, 5);
    expect(s).toContain('You appear on all 5 AI platforms that responded.');
    expect(s).not.toContain('recommending competitors');
  });

  it('nobody responded -> unmeasured, no competitor claim', () => {
    const s = outcomeSentence(0, 0, 12, 0);
    expect(s).toContain("couldn't be measured");
    expect(s).not.toContain('recommending competitors');
  });

  it('full response, all mentioned keeps the prominence copy', () => {
    expect(outcomeSentence(12, 80, 12, 12)).toContain('appear prominently on all 12');
    expect(outcomeSentence(12, 40, 12, 12)).toContain('low prominence');
  });

  it('responded unknown -> presence only, never a competitor claim', () => {
    const s = outcomeSentence(2, 20, 12);
    expect(s).toBe('You appear on 2 of 12 AI platforms.');
  });

  it('clamps mentions to the responded count', () => {
    expect(outcomeSentence(9, 50, 12, 3)).toContain('You appear on all 3 AI platforms that responded.');
  });

  it('scoreWithOutcome passes responded through', () => {
    expect(scoreWithOutcome(12, 1, 12, 4)).toBe(`12/100 — ${outcomeSentence(1, 12, 12, 4)}`);
  });
});
