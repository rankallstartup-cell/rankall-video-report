import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync('app/dashboard/competitor/page.tsx', 'utf8');

describe('b364 competitor redesign', () => {
  it('keeps the shared gain helper + aiPlatforms signals (ax88)', () => {
    expect(src).toContain("import { trustFixGainPoints } from '@/lib/trust'");
    expect(src).toContain('trustFixGainPoints({ status: userStatusByName.get(s.name)');
    expect(src).toContain('aiPlatforms');
    expect(src).not.toContain('s.pointsImpact');
  });
  it('keeps snapshot-time your_score via attachUserScores (ax8r)', () => {
    expect(src).toContain('attachUserScores');
    expect(src).toContain('your_score');
    expect(src).toContain('scan_id');
    expect(src).not.toContain('userScore={userScore}');
  });
  it('uses PLATFORMS_ALL.length, never a hardcoded denominator', () => {
    expect(src).toContain('PLATFORMS_ALL.length');
    // The ax8r comment states the rule (PLATFORMS_ALL.length, never hardcoded); strip it so the assertion checks the code, not the comment.
    const withoutComment = src.replace(/\/\/ ax8r: coverage uses PLATFORMS_ALL\.length \(12 active platforms incl\. Meta AI\) — never a hardcoded denominator\./, '');
    expect(withoutComment).not.toContain('/12');
  });
  it('keeps the truthful rescan copy, never the 30-day countdown', () => {
    expect(src).toContain('Rescan anytime to track their progress');
    expect(src).not.toContain('next automated rescan');
    expect(src).not.toContain('track their progress automatically');
  });
  it('error state renders the page header + card (not a bare line)', () => {
    expect(src.match(/Competitor Intel/g)?.length).toBeGreaterThanOrEqual(2);
    expect(src).toContain('card dash-card');
  });
  it('no fabricated signals', () => {
    expect(src).not.toContain('response_text');
    expect(src).not.toContain('Optimisation fix');
  });
});
