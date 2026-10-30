import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// azxc residual: (1) the programmatic share card
// (opengraph-image.tsx) still rendered the HARDCODED per-industry
// avgScore as the city's average, plus a hardcoded "12 platforms".
// (2) The page named a "leading competitor" from a SINGLE scan's
// competitor_name — no sample gate.
describe('azxc residual: real OG average + gated top competitor', () => {
  it('OG card uses the real aggregate, never the hardcoded avgScore', () => {
    const src = readFileSync(join(process.cwd(), 'app/[industry]/[city]/opengraph-image.tsx'), 'utf-8');
    expect(src).toContain('getComboAggregate');
    expect(src).not.toContain('ind?.avgScore');
    expect(src).not.toContain('>12</div>');
    // azxc follow-up: platform count comes from publicStats (was a literal
    // 11), the fixed per-industry "+fixPts" stat is gone, and the no-data
    // label covers "below minimum sample", not just "zero scans".
    expect(src).toContain('{PLATFORMS_SCANNED}');
    expect(src).not.toContain('fixPts');
    expect(src).toContain('not enough data yet');
  });
  it('top competitor needs a sample gate: mode across >= 2 scans', () => {
    const src = readFileSync(join(process.cwd(), 'lib/programmaticAggregates.ts'), 'utf-8');
    expect(src).not.toContain('scans.find((s) => s.competitor_name)');
    expect(src).toContain('competitorCounts');
    expect(src).toContain('if (topCount < 2) topCompetitor = null');
  });
});
