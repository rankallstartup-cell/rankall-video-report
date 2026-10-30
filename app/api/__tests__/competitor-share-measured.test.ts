import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ax7x (residual): the competitor share was the plain complement
// (100 - yours), which fabricates share — if you're on 2/12 (17%)
// and the competitor on 5/12 (42%), the other 41% is neither, not
// the competitor's. The competitor share must be MEASURED from the
// competitor scan (compScanData.mentioned), or null ("Not
// measured"). The revenue model's lost-share complement
// (revenueGapBreakdown) is a different concept — inquiries you
// don't win — and stays untouched.
describe('ax7x competitor share is measured', () => {
  it('report page measures the competitor share', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/report/[id]/page.tsx'), 'utf8');
    expect(src).toContain('const competitorShare = compScanData ? Math.round(compScanData.mentioned / 12 * 100) : null;');
    expect(src).not.toContain('const competitorShare = 100 - recommendationShare;');
    expect(src).toContain("'Not measured'");
    expect(src).toContain('not measured — no competitor scan');
    // The revenue lost share is the canonical lib/scoring one
    // (1 - mentioned/responded) — no competitorShare input any more.
    expect(src).toContain('revenueGapForScanBreakdown({');
    expect(src).toContain('respondedPlatforms: completedPlatformCount,');
  });
});
