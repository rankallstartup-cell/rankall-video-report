// b8b5 — /reports/[scan_id] (PDF) honesty: placeholder competitor,
// revenue denominator, account-manager promise, city duplication.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isPlaceholderCompetitor } from '@/lib/dataQuality';
import { revenueGapForScan } from '@/lib/scoring';

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8');

describe('/reports PDF honesty (b8b5)', () => {
  it('placeholder competitors are treated as no competitor', () => {
    expect(isPlaceholderCompetitor('If you meant a different service')).toBe(true);
    expect(isPlaceholderCompetitor('Did you mean Acme Dental?')).toBe(true);
    expect(isPlaceholderCompetitor('Select a competitor')).toBe(true);
    expect(isPlaceholderCompetitor('Park Cities Dental Group')).toBe(false);
    expect(isPlaceholderCompetitor('')).toBe(false);
    expect(isPlaceholderCompetitor(null)).toBe(false);
  });

  it('the PDF uses the placeholder filter on the stored competitor', () => {
    const pdf = read('app/api/reports/generate-pdf/route.ts');
    expect(pdf).toContain('isPlaceholderCompetitor(rawCompetitor)');
  });

  it('revenue divides by RESPONDED platforms, not all 11', () => {
    // The rankall.io scan: 9 mentioned, Mistral never answered
    // (empty response_text). Old PDF: 2/11 -> $1,745. Report page:
    // 1/10 -> $960. The PDF must now match the report page.
    const pdf = read('app/api/reports/generate-pdf/route.ts');
    expect(pdf).toContain('respondedPlatforms: respondedCount');
    expect(pdf).not.toContain('respondedPlatforms: ALL_PLATFORMS.length');
    expect(revenueGapForScan({
      mentionedCount: 9, respondedPlatforms: 10,
      avgCustomerValue: 800, monthlyAIInquiries: 120,
    })).toBe(960);
    expect(revenueGapForScan({
      mentionedCount: 9, respondedPlatforms: 11,
      avgCustomerValue: 800, monthlyAIInquiries: 120,
    })).toBe(1745);
  });

  it('no dedicated-account-manager / 5-day / 90-day promise', () => {
    const pdf = read('app/api/reports/generate-pdf/route.ts');
    expect(pdf).not.toContain('dedicated account manager');
    expect(pdf).not.toContain('within 5 business days');
    expect(pdf).not.toContain('90-day mark');
    expect(pdf).not.toContain('Contact your account manager');
  });

  it('city clause omitted when the location duplicates the business name', () => {
    const pdf = read('app/api/reports/generate-pdf/route.ts');
    expect(pdf).toContain('citySuffix');
    expect(pdf).not.toContain('`${clientHtml}${city ? ` in ${esc(city)}` :');
    // The heading had the same duplication ("rankall.io — rankall.io").
    expect(pdf).not.toContain('`${clientHtml} &mdash; ${esc(city)}` : clientHtml');
  });

  it('NULL response_text counts as NOT responded (Mistral case)', () => {
    // The first version treated NULL as "field absent -> responded"
    // and still divided by 11. In the main table NULL = no response.
    const pdf = read('app/api/reports/generate-pdf/route.ts');
    expect(pdf).toContain("typeof r.response_text === 'string'");
    expect(pdf).not.toContain('r.response_text == null ||');
  });
});
