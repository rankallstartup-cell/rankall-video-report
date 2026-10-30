import { describe, it, expect } from 'vitest';
import {
  calculateRevenueGap,
  revenueGapBreakdown,
  revenueGapForScan,
  revenueGapForScanBreakdown,
  lostShareFromMentionedShare,
  REVENUE_CONVERSION_RATE,
} from '../scoring';
import { scanRevenueEstimate } from '../revenueModel';

// ONE definition: lostShare = share of the AI platforms that RESPONDED which
// did NOT recommend you = 1 − mentioned / responded. The old model computed
// competitorShare − mentionedShare with callers passing the complement, i.e.
// 1 − 2 × mentionedShare: 2/11 used 64% (copy says 82%) and ≥ 6/11 got $0.
const base = { avgCustomerValue: 800, monthlyAIInquiries: 120 };
const gapFor = (lost: number) => Math.round(lost * 120 * 800 * REVENUE_CONVERSION_RATE);

describe('canonical revenue lost share', () => {
  it('0/12 mentioned → 100% lost', () => {
    const bd = revenueGapForScanBreakdown({ mentionedCount: 0, respondedPlatforms: 12, ...base });
    expect(bd.lostShare).toBe(1);
    expect(bd.gap).toBe(gapFor(1));
  });

  it('2/12 mentioned → 83% lost (matches the report copy), not 64%', () => {
    const bd = revenueGapForScanBreakdown({ mentionedCount: 2, respondedPlatforms: 12, ...base });
    expect(Math.round(bd.lostShare * 100)).toBe(83);
    expect(bd.gap).toBe(gapFor(10 / 12));
    expect(revenueGapForScan({ mentionedCount: 2, respondedPlatforms: 12, ...base })).toBe(bd.gap);
  });

  it('6/12 mentioned → 6/12 lost, a non-zero gap (was $0)', () => {
    const gap = revenueGapForScan({ mentionedCount: 6, respondedPlatforms: 12, ...base });
    expect(gap).toBe(gapFor(6 / 12));
    expect(gap).toBeGreaterThan(0);
  });

  it('12/12 mentioned → 0 gap', () => {
    expect(revenueGapForScan({ mentionedCount: 12, respondedPlatforms: 12, ...base })).toBe(0);
  });

  it('partial responses use responding platforms as the denominator', () => {
    // 3 of the 8 platforms that answered recommend you → 5/8 lost.
    const bd = revenueGapForScanBreakdown({ mentionedCount: 3, respondedPlatforms: 8, ...base });
    expect(bd.lostShare).toBeCloseTo(5 / 8);
    expect(bd.gap).toBe(gapFor(5 / 8));
  });

  it('nothing responded → nothing measured → 0, and mentions are clamped', () => {
    expect(revenueGapForScan({ mentionedCount: 0, respondedPlatforms: 0, ...base })).toBe(0);
    expect(revenueGapForScan({ mentionedCount: 20, respondedPlatforms: 12, ...base })).toBe(0);
  });

  it('calculateRevenueGap / revenueGapBreakdown use the same lost share', () => {
    expect(lostShareFromMentionedShare(0.25)).toBe(0.75);
    expect(lostShareFromMentionedShare(1.5)).toBe(0);
    expect(lostShareFromMentionedShare(-1)).toBe(1);
    const bd = revenueGapBreakdown({ mentionedShare: 0.25, ...base });
    expect(bd.lostShare).toBe(0.75);
    expect(bd.gap).toBe(calculateRevenueGap({ mentionedShare: 0.25, ...base }));
  });

  it('lib/revenueModel implements the same definition', () => {
    const e = scanRevenueEstimate({ mentionedCount: 6, totalPlatforms: 12, countryCode: 'US', ...base })!;
    expect(e.lostShare).toBeCloseTo(6 / 12);
    expect(e.gap).toBe(gapFor(6 / 12));
  });
});
