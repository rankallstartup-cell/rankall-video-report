// b8av — /market-index: high-performer count shown with its numerator,
// threshold = the product's own 'Strong' band (not an invented line),
// exclusion rule stated next to the Top lists.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8');

describe('/market-index honesty (b8av)', () => {
  it('shows the high-performer numerator, not a bare percentage', () => {
    const page = read('app/market-index/page.tsx');
    expect(page).toContain('{highPerformers} of {scores.length.toLocaleString()} scans ({highPct}%)');
  });

  it('threshold comes from the single grade table, not a hardcoded 70', () => {
    const page = read('app/market-index/page.tsx');
    expect(page).toContain("GRADE_BANDS.find((b) => b.label === 'Strong')");
    expect(page).toContain('s >= strongMin');
    expect(page).not.toContain('s >= 70');
    expect(page).not.toContain('start recommending a');
    expect(page).not.toContain('business regularly');
    expect(page).toContain("Rankall&apos;s &apos;Strong&apos; band");
    const bands = read('lib/projection.ts');
    expect(bands).toContain("{ min: 71, label: 'Strong' }");
  });

  it('states the exclusion rule next to the Top lists', () => {
    const page = read('app/market-index/page.tsx');
    expect(page).toContain('Only groups with at least {MIN_GROUP_SCANS} scans are listed.');
  });
});
