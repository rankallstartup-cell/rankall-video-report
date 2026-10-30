import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { platformListSentence } from '../platformList';
import { ACTIVE_PLATFORMS } from '../platforms';

describe('item 15: platform count derived from the scanned list', () => {
  it('3 named + others = the 12 active platforms', () => {
    const names = ACTIVE_PLATFORMS.map(p => p.name);
    expect(names).toHaveLength(12);
    expect(platformListSentence(names, ['ChatGPT', 'Gemini', 'Perplexity'])).toBe('ChatGPT, Gemini, Perplexity, and 9 other AI platforms');
    expect(platformListSentence(['A', 'B'], ['A', 'B'])).toBe('A and B');
    expect(platformListSentence(['A', 'B'], [])).toBe('2 AI platforms');
  });
  it('dashboard no longer hardcodes "and 9 other"', () => {
    const src = readFileSync(join(process.cwd(), 'app/dashboard/page.tsx'), 'utf8');
    expect(src).not.toContain('and 9 other AI platforms');
    expect(src).toContain("platformListSentence(ACTIVE_PLATFORMS.map(p => p.name), ['ChatGPT', 'Gemini', 'Perplexity'])");
  });
});

describe('item 14: unmeasured agency client scores are not 0', () => {
  it('maps a missing score to null and averages measured scores only', () => {
    const src = readFileSync(join(process.cwd(), 'app/dashboard/page.tsx'), 'utf8');
    expect(src).not.toContain("score: typeof c.score === 'number' ? c.score : 0,");
    expect(src).toContain("score: typeof c.score === 'number' ? c.score : null,");
    expect(src).toContain("value: avg != null ? avg.toString() : '—'");
  });
});
