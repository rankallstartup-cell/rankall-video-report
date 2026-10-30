import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { NextRequest } from 'next/server';

// b029: the report page invented competitor numbers in 4 places —
// exec summary (own score + 20), competitorScoreEst (share-gap fallback),
// score-card link (|| 0), simulator (share-gap formula). The prompt and
// template must say "not measured" when no competitor score is measured.
import { POST } from '../report/executive-summary/route';

const ROOT = process.cwd();
const reportSrc = readFileSync(join(ROOT, 'app/report/[id]/page.tsx'), 'utf8');
const cardSrc = readFileSync(join(ROOT, 'app/score-card/page.tsx'), 'utf8');
// The hiding gate moved with the file split: page.tsx computes
// competitorScore (null when absent) and passes it to ScoreCardView,
// which owns the render gate.
const cardViewSrc = readFileSync(join(ROOT, 'components/ScoreCardView.tsx'), 'utf8');
const simSrc = readFileSync(join(ROOT, 'components/RecommendationSimulator.tsx'), 'utf8');

async function execSummary(body: Record<string, unknown>) {
  const req = new NextRequest('https://rankall.io/api/report/executive-summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const res = await POST(req);
  return (await res.json()) as { bullets: string[]; source: string };
}

describe('exec-summary route — b029', () => {
  beforeEach(() => { delete process.env.ANTHROPIC_API_KEY; });
  afterEach(() => { delete process.env.ANTHROPIC_API_KEY; });

  const base = {
    businessName: 'Brite Smiles', score: 50, industry: 'Dentist',
    city: 'Austin', mentionedCount: 3, topFix: 'claim GBP', revenueGap: 1000,
  };

  it('named competitor + null score -> "not measured", no invented score', async () => {
    const { bullets } = await execSummary({ ...base, competitorName: 'Comp Dental', competitorScore: null });
    expect(bullets[0]).toContain('not measured');
    expect(bullets[0]).not.toMatch(/scores 0/);
    expect(bullets[0]).not.toMatch(/scores 70/);
  });

  it('measured competitor score -> real comparison', async () => {
    const { bullets } = await execSummary({ ...base, competitorName: 'Comp Dental', competitorScore: 72 });
    expect(bullets[0]).toContain('Comp Dental scores 72/100');
  });

  it('no competitor -> no comparison at all', async () => {
    const { bullets } = await execSummary({ ...base, competitorName: '' });
    expect(bullets[0]).not.toContain('Comp Dental');
    // Platform count grew 11 -> 12 (Meta is the 12th); the report page
    // agrees (all "of 12" there). No-comparison behaviour intact.
    expect(bullets[0]).toContain('appears on 3 of 12');
  });
});

describe('report page + score card + simulator — b029 source checks', () => {
  it('report page sends no invented competitor score anywhere', () => {
    expect(reportSrc).not.toContain('(scan.overall_score ?? 0) + 20');
    expect(reportSrc).not.toContain('competitorScore=${compScanData?.score || 0}');
    expect(reportSrc).not.toContain('currentScore + (competitorShare - recommendationShare)');
    expect(reportSrc).not.toContain('currentScore + Math.max(0, competitorShare - recommendationShare)');
    expect(reportSrc).toContain('competitorScore: compScanData?.score ?? null');
    expect(reportSrc).toContain('competitorScore={compScanData?.score ?? null}');
    expect(reportSrc).toContain('competitorScoreEst = compScanData?.score ?? null');
  });

  it('score card hides the competitor line when the score is absent', () => {
    expect(cardSrc).not.toContain("parseInt(params.get('competitorScore') || '0', 10) || 0");
    expect(cardViewSrc).toContain('competitor && competitorScore != null &&');
  });

  it('simulator prop type allows null (pass-through to calculateSimulation)', () => {
    expect(simSrc).toContain('competitorScore: number | null');
  });
});
