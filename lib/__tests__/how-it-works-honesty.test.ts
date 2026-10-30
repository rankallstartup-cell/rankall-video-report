// b8am — /how-it-works honesty: platform weights are Rankall's SCORING
// weights from the single source of truth (PLATFORM_SCORING_WEIGHTS),
// never hardcoded "market share"; Step 01 example inputs are labeled.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8');

describe('how-it-works honesty (b8am)', () => {
  it('never calls the weights "market share"', () => {
    const src = read('app/how-it-works/page.tsx');
    expect(src.toLowerCase()).not.toContain('market share');
  });

  it('weights derive from PLATFORM_SCORING_WEIGHTS (array form), never hardcoded', () => {
    const src = read('app/how-it-works/page.tsx');
    expect(src).toContain('PLATFORM_SCORING_WEIGHTS');
    // Array of { name, weightPct } — Object.entries would silently yield
    // index keys, so assert the .map(p => p.weightPct) consumption.
    expect(src).toContain('PLATFORM_SCORING_WEIGHTS.map');
    expect(src).toContain('weightPct');
    expect(src).not.toMatch(/w: '25%'|w: "25%"/);
    expect(src).not.toMatch(/25% weight — ChatGPT/);
  });

  it('weights are sourced on the page', () => {
    const src = read('app/how-it-works/page.tsx');
    expect(src).toContain('Rankall scoring weights');
    expect(src).toContain('scoring configuration, October 2026');
    expect(src).toContain('not a market-share measurement');
  });

  it('Step 01 example inputs are labeled illustrative', () => {
    const src = read('app/how-it-works/page.tsx');
    expect(src).toContain('Examples — illustrative inputs, not real businesses or scans');
  });
});
