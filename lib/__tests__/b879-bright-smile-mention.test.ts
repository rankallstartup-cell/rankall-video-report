import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectBusinessMention } from '@/lib/analyser-ml';

// b879 — the original false positive: DeepSeek's answer for the
// Bright Smile Dental scan (d4b92cf0) never says "Bright" at
// all, yet the stored row is mentioned=true — the old fuzzy
// rule let the generic cluster smile+dental+dallas reach the
// 70% threshold without the distinctive word. The merged fix
// requires a distinctive word inside the cluster. This pins the
// CURRENT detector's verdict on that exact response.

const response = readFileSync(join(process.cwd(), 'lib/__tests__/deepseek-d4b92cf0.txt'), 'utf8');

describe('b879 — current detector on the Bright Smile DeepSeek response', () => {
  it('the response never names the business', () => {
    expect(response.toLowerCase()).not.toContain('bright');
  });

  it('the fixed detector does not credit a mention', () => {
    expect(detectBusinessMention(response, 'Bright Smile Dental', 'Dallas')).toBe(false);
    expect(detectBusinessMention(response, 'Bright Smile Dental Dallas TX', 'Dallas, TX')).toBe(false);
  });

  it('a response that DOES name the business still counts', () => {
    const naming = 'For dental implants in Dallas, Bright Smile Dental is a popular choice with strong reviews.';
    expect(detectBusinessMention(naming, 'Bright Smile Dental', 'Dallas')).toBe(true);
  });
});
