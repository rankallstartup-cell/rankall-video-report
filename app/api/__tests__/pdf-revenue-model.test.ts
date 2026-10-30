import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { revenueGapForScan } from '../../../lib/scoring';

// ax80 (residual): the PDF report used its own revenue formula
// (gap-to-70 x 180) instead of the canonical revenueGapForScan,
// so the PDF disagreed with the report page for the same scan —
// and it hardcoded £, billing every business in GBP.
describe('ax80 pdf uses the canonical revenue model', () => {
  it('pdf uses revenueGapForScan + the scan-country currency', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/api/reports/generate-pdf/route.ts'), 'utf8');
    expect(src).toContain('revenueGapForScan({');
    expect(src).toContain('getRevenueSymbol(');
    expect(src).not.toContain('gap * 180');
    expect(src).not.toContain('£${');
    // After-fixes mirrors the simulator (min(0.6, points/40)),
    // not the old flat 0.35 (65% recovery, above the 60% cap).
    expect(src).toContain('Math.min(0.6, pointsGained / 40)');
    expect(src).not.toContain('monthlyLoss * 0.35');
  });

  it('canonical model agrees with itself for a known input', () => {
    // 2/12 mentioned, US dentist defaults: lostShare 10/12 of the
    // market opportunity, damped by the 0.1 conversion rate.
    const gap = revenueGapForScan({
      mentionedCount: 2,
      respondedPlatforms: 12,
      avgCustomerValue: 800,
      monthlyAIInquiries: 120,
    });
    expect(gap).toBeGreaterThan(0);
    // Same inputs -> same gap (deterministic, no second formula).
    expect(revenueGapForScan({
      mentionedCount: 2,
      respondedPlatforms: 12,
      avgCustomerValue: 800,
      monthlyAIInquiries: 120,
    })).toBe(gap);
  });
});
