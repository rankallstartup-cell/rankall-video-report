import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b894 — /case-studies passed its key check (nothing presented as
// a real customer; the per-fix numbers are GENERATED from the
// product's canonical impact table + projection, verified in
// code). The remaining flag: the values/ceiling were not
// documented anywhere on the page.

const page = readFileSync(join(process.cwd(), 'app/case-studies/page.tsx'), 'utf8');

describe('b894 — case studies document their estimates', () => {
  it('numbers still derive from the canonical table + projection', () => {
    expect(page).toContain('canonicalFixImpact(f.fixType)');
    expect(page).toContain('projectScore(c.before');
  });

  it('the methodology note is on the page', () => {
    expect(page).toContain('How these estimates work');
    expect(page).toContain('the same values the product&apos;s fix queue and Simulator show');
    expect(page).toContain('capped at the same projection ceiling the product uses');
    expect(page).toContain('only confirmed by a verification rescan');
  });
});
