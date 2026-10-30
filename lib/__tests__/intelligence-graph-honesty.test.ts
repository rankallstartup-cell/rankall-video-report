// b8aq — /intelligence-graph: one canonical weighting table, illustrative
// patterns, honest dataset state, real industry count.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8');

describe('/intelligence-graph honesty (b8aq)', () => {
  it('platform weights come from the canonical table (all 12, sum 100)', () => {
    const page = read('app/intelligence-graph/page.tsx');
    expect(page).toContain('PLATFORM_SCORING_WEIGHTS.map');
    expect(page).not.toContain("w: '11%'");
    expect(page).not.toContain("w: '8%'");
    expect(page).not.toContain("w: '7%'");
    expect(page).not.toContain("w: '3%'");
    expect(page).not.toContain("w: '4%'");
    const stats = read('lib/publicStats.ts');
    const weights = [...stats.matchAll(/weightPct: (\d+)/g)].map((m) => Number(m[1]));
    expect(weights).toHaveLength(12);
    expect(weights.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('patterns are labeled illustrative, not discovered correlations', () => {
    const page = read('app/intelligence-graph/page.tsx');
    expect(page).toContain('Illustrative examples of the patterns the graph is built to surface — not measured results from our dataset.');
    expect(page).toContain('>Illustrative</span>');
    expect(page).not.toContain('patterns we see emerging');
    expect(page).not.toContain('discovered correlations');
    expect(page).not.toContain('in our dataset');
    expect(page).not.toContain('signals we track');
  });

  it('declares the dataset state and uses real counts', () => {
    const page = read('app/intelligence-graph/page.tsx');
    expect(page).toContain('Dataset status: building — no correlations published yet.');
    expect(page).toContain('String(INDUSTRIES_TRACKED)');
    expect(page).toContain('{TRUST_SIGNAL_COUNT} signals across 6 categories — example sources shown.');
    expect(page).toContain('Trust signal categories');
    expect(page).not.toContain("l: 'Industries tracked',        c: '#34D399' },\n                { n: '7'");
  });
});
