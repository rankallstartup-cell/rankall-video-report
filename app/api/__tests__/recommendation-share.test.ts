import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// b02f: one canonical recommendation_share writer (mentioned/12).
const scanSrc = readFileSync(join(process.cwd(), 'app/api/scan/route.ts'), 'utf8');
const outreachSrc = readFileSync(join(process.cwd(), 'app/api/outreach/run-scan/route.ts'), 'utf8');
const rescanSrc = readFileSync(join(process.cwd(), 'app/api/rescan-weekly/route.ts'), 'utf8');
const scoringSrc = readFileSync(join(process.cwd(), 'lib/scoring.ts'), 'utf8');
const qaSrc = readFileSync(join(process.cwd(), 'app/admin/qa-checklist/QAChecklist.tsx'), 'utf8');

describe('recommendation_share — one canonical writer — b02f', () => {
  it('no writer uses the weight-based formula', () => {
    for (const [name, s] of [['scan', scanSrc], ['outreach', outreachSrc], ['rescan', rescanSrc]] as const) {
      expect(s, name).not.toContain('calculateRecommendationShare(scoreInputs)');
    }
    expect(scoringSrc).not.toContain('mentionedWeight');
    expect(scoringSrc).not.toContain('competitorWeight');
    expect(scoringSrc).not.toContain('ShareInput');
  });

  it('scan route writes the same canonical value to both columns', () => {
    expect(scanSrc).toContain('calculateRecommendationShare(mentionedCount, PLATFORMS.length)');
    expect(scanSrc).not.toContain('const recShare =');
    expect(scanSrc).toContain('recommendation_share: recommendationShare,');
  });

  it('outreach + rescan-weekly write the canonical value too', () => {
    expect(outreachSrc).toContain('calculateRecommendationShare(mentionedCount, PLATFORMS.length)');
    expect(rescanSrc).toContain('calculateRecommendationShare(mentionedCount, PLATFORMS.length)');
    expect(rescanSrc).toContain('recommendationShare: calculateRecommendationShare(mentionedCount, PLATFORMS.length),');
  });

  it('QA checklist pins the canonical formula, not the old 71', () => {
    expect(qaSrc).not.toContain('=== 71');
    expect(qaSrc).toContain('mentioned/12 (canonical, matches report page)');
  });
});

describe('calculateRecommendationShare — canonical', () => {
  it('mentioned/total as a percentage', async () => {
    const { calculateRecommendationShare } = await import('@/lib/scoring');
    expect(calculateRecommendationShare(3, 11)).toBe(27);
    expect(calculateRecommendationShare(0, 11)).toBe(0);
    expect(calculateRecommendationShare(11, 11)).toBe(100);
    expect(calculateRecommendationShare(1, 11)).toBe(9);
    expect(calculateRecommendationShare(1, 0)).toBe(0);
  });
});
