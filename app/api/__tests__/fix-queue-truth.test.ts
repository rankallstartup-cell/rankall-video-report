import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// b02c: (1) on total fix-load failure the code still set fixesReady, so
// projection surfaces rendered as if fixes existed; (2) the queue is
// labelled "Ranked by predicted impact" but arrived in creation order.
// Source-level checks: the report page is a large client component.
const src = readFileSync(
  join(process.cwd(), 'app/report/[id]/page.tsx'),
  'utf8',
);
const fixesSrc = readFileSync(join(process.cwd(), 'lib/fixes.ts'), 'utf8');

describe('fix queue failure + sort — b02c', () => {
  it('fixesReady is set only when real fixes arrived', () => {
    expect(src).toContain('} else {\n          setFixesReady(true);\n        }');
    expect(src).not.toContain('setFixesLoading(false);\n        setFixesReady(true);');
    // Score card shows a dash on fix-load error, not a projection.
    expect(src).toContain("{fixesError ? '—' : fixesReady ? predictedScore :");
    // "Total predicted improvement" hides on fix-load error.
    expect(src).toContain('fixesLoading || !isLoggedIn || fixesError');
  });

  it('fixes are impact-ranked at set-time (both sources)', () => {
    expect(src).toContain('const byImpactDesc = (arr: Fix[]) => [...arr].sort((a, b) => (b.predicted_impact || 0) - (a.predicted_impact || 0));');
    expect(src).toContain('setFixes(byImpactDesc(scanData.fixes.map(');
    expect(src).toContain('setFixes(byImpactDesc(data.fixes));');
  });

  it('getFixesForScan returns impact-ranked fixes', () => {
    expect(fixesSrc).toContain('return [...fixes].sort((a, b) => (b.predicted_impact ?? 0) - (a.predicted_impact ?? 0));');
  });
});
