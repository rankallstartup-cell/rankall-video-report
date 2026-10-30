import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { scanRevenueEstimate } from '../revenueModel';
import { revenueGapForScan } from '../scoring';
import { getAvgCustomerValue, getCountryConfig } from '../countryConfig';

describe('demo-prep uses the canonical revenue model (I)', () => {
  const src = readFileSync(join(process.cwd(), 'app/dashboard/demo-prep/page.tsx'), 'utf8');
  it('no score-based revenue formula remains', () => {
    expect(src).not.toMatch(/\(100 - scan\.score\)/);
    expect(src).not.toMatch(/avgCustomerValue \* 10/);
    expect(src).toContain('scanRevenueEstimate(');
  });
  it('the estimate equals the canonical revenueGapForScan for the same scan', () => {
    const e = scanRevenueEstimate({ mentionedCount: 3, totalPlatforms: 10, industry: 'dentist', countryCode: 'US' });
    expect(e).not.toBeNull();
    expect(e!.gap).toBe(revenueGapForScan({
      mentionedCount: 3,
      respondedPlatforms: 10,
      avgCustomerValue: getAvgCustomerValue('dentist', 'US'),
      monthlyAIInquiries: getCountryConfig('US').monthlyAIInquiries ?? 50,
    }));
  });
  it('an unmeasured scan shows no number', () => {
    expect(scanRevenueEstimate({ mentionedCount: null, totalPlatforms: 11 })).toBeNull();
  });
});
