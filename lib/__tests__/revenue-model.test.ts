import { describe, it, expect } from 'vitest';
import { scanRevenueEstimate, revenueEstimateBasis } from '../revenueModel';
import { revenueGapForScan } from '../scoring';
import { getAvgCustomerValue, getCountryConfig } from '../countryConfig';

// ax80: every surface uses the report's complement model over the scan's
// REAL mention count, with the report's inputs and local currency.
describe('scanRevenueEstimate', () => {
  it('equals the canonical revenueGapForScan with report inputs', () => {
    const e = scanRevenueEstimate({ mentionedCount: 3, totalPlatforms: 11, industry: 'dentist', countryCode: 'US' })!;
    expect(e.gap).toBe(revenueGapForScan({
      mentionedCount: 3, respondedPlatforms: 11,
      avgCustomerValue: getAvgCustomerValue('dentist', 'US'),
      monthlyAIInquiries: getCountryConfig('US').monthlyAIInquiries,
    }));
    expect(e.symbol).toBe('$');
    // canonical: lostShare = responding platforms NOT recommending you = 1 - 3/11
    expect(e.lostShare).toBeCloseTo(8 / 11);
  });

  it('uses the scan market currency (not always "$")', () => {
    const gb = scanRevenueEstimate({ mentionedCount: 2, totalPlatforms: 11, industry: 'dentist', countryCode: 'GB' })!;
    expect(gb.symbol).toBe('£');
  });

  it('agency proposal: depends on mentions, not on (competitor - score) × 80 floored at 500', () => {
    // Fully visible business → no gap. The old formula floored at $500.
    const e = scanRevenueEstimate({ mentionedCount: 11, totalPlatforms: 11, industry: 'dentist', countryCode: 'US' })!;
    expect(e.gap).toBe(0);
  });

  it('dashboard simulator: mention-rate share, sliders only override inputs', () => {
    const viaSliders = scanRevenueEstimate({
      mentionedCount: 4, totalPlatforms: 11, countryCode: 'US', avgCustomerValue: 1000, monthlyAIInquiries: 200,
    })!;
    expect(viaSliders.gap).toBe(revenueGapForScan({ mentionedCount: 4, respondedPlatforms: 11, avgCustomerValue: 1000, monthlyAIInquiries: 200 }));
  });

  it('returns null (not measured) without a real mention count', () => {
    expect(scanRevenueEstimate({ mentionedCount: null, totalPlatforms: 11 })).toBeNull();
    expect(scanRevenueEstimate({ mentionedCount: undefined, totalPlatforms: 11 })).toBeNull();
    expect(scanRevenueEstimate({ mentionedCount: 3, totalPlatforms: 0 })).toBeNull();
  });

  it('clamps mentions above the platform total', () => {
    expect(scanRevenueEstimate({ mentionedCount: 20, totalPlatforms: 11 })!.gap).toBe(0);
  });

  it('labels its inputs as an estimate', () => {
    const e = scanRevenueEstimate({ mentionedCount: 3, totalPlatforms: 11, countryCode: 'US' })!;
    expect(revenueEstimateBasis(e)).toMatch(/^Estimate:/);
  });
});
