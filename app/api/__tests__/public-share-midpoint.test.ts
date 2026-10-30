import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ax81 (residual): the public share page (/r/) read generated_fixes
// directly — ordered by the STORED predicted_impact and displaying
// it — bypassing the canonical midpoint reader every other surface
// uses. Old rows (Claude's per-fix guesses) showed the wrong number
// here and disagreed with the dashboard/report.
// Updated (b0fm/ax8b item 2): /r/ is now a server component fed by
// lib/publicShare, which reads fixes through getFixesForScan — the
// canonical midpoint reader (withCanonicalImpact, impact-ranked) — and
// ships only fix #1. The page itself no longer touches generated_fixes.
describe('ax81 /r/ uses the canonical midpoint reader', () => {
  it('public share page normalises impacts to the midpoint', () => {
    const page = readFileSync(join(process.cwd(), 'app/r/[id]/page.tsx'), 'utf8');
    const lib = readFileSync(join(process.cwd(), 'lib/publicShare.ts'), 'utf8');
    const fixes = readFileSync(join(process.cwd(), 'lib/fixes.ts'), 'utf8');
    expect(page).not.toContain("from('generated_fixes')");
    expect(lib).toContain('getFixesForScan(id)');
    expect(lib).toContain('const first = fixes[0];');
    expect(fixes).toContain('withCanonicalImpact(dedupeByType(');
    expect(lib).not.toContain(".order('predicted_impact'");
  });
});
