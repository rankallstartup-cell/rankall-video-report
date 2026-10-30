import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gradeLabel, GRADE_BANDS } from '../projection';

// Item 6: PDF (Dominant ≥75), agency dashboard (≥80) and /score/[slug]
// (>85) disagreed with lib/projection. All now call gradeLabel.
describe('one grade-band table', () => {
  const files = [
    'app/api/reports/generate-pdf/route.ts',
    'app/dashboard/agency/page.tsx',
    'app/score/[slug]/page.tsx',
  ];
  it.each(files)('%s uses gradeLabel and no local thresholds', (f) => {
    const src = readFileSync(join(process.cwd(), f), 'utf8');
    expect(src).toContain('gradeLabel(score)');
    expect(src).not.toMatch(/score >= (75|80)\) return/);
    expect(src).not.toMatch(/score <= (30|50|70|85)\) return/);
    expect(src).not.toContain("'At Risk' }");
  });
  it('band edges', () => {
    expect(gradeLabel(84)).toBe('Strong');
    expect(gradeLabel(GRADE_BANDS[0].min)).toBe('Dominant');
    expect(gradeLabel(76)).toBe('Strong'); // PDF used to say Dominant
    expect(gradeLabel(80)).toBe('Strong'); // agency page used to say Dominant
  });
});
