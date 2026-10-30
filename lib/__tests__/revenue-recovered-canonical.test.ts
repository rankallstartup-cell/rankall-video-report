import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { revenueRecoveredEstimate, scanRevenueEstimate } from '../revenueModel';

// Item 9: monthly ROI + value stack used a second, score-gain revenue model.
describe('revenue recovered uses the canonical gap model', () => {
  it('= gap(before) − gap(after)', () => {
    const r = revenueRecoveredEstimate({ mentionedBefore: 2, mentionedAfter: 5, industry: 'dentist', countryCode: 'US' })!;
    const before = scanRevenueEstimate({ mentionedCount: 2, totalPlatforms: 11, industry: 'dentist', countryCode: 'US' })!;
    const after = scanRevenueEstimate({ mentionedCount: 5, totalPlatforms: 11, industry: 'dentist', countryCode: 'US' })!;
    expect(r.revenue).toBe(before.gap - after.gap);
    expect(r.revenue).toBeGreaterThan(0);
    expect(r.customers).toBe(Math.round((3 / 11) * before.monthlyAIInquiries * before.conversionRate));
    expect(r.symbol).toBe('$');
  });
  it('never negative; null when unmeasured', () => {
    expect(revenueRecoveredEstimate({ mentionedBefore: 5, mentionedAfter: 2 })!.revenue).toBe(0);
    expect(revenueRecoveredEstimate({ mentionedBefore: null, mentionedAfter: 2 })).toBeNull();
  });
  it('routes no longer carry a score-gain formula', () => {
    for (const f of ['app/api/cron/monthly-roi/route.ts', 'app/api/dashboard/value-stack/route.ts']) {
      const src = readFileSync(join(process.cwd(), f), 'utf8');
      expect(src).toContain('revenueRecoveredEstimate(');
      expect(src).not.toMatch(/\/ 100\) \* .*0\.1\)/);
    }
  });
});
