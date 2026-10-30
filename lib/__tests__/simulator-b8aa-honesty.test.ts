import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  calculateSimulation,
  projectScore,
  type SimulatorInput,
} from '@/lib/simulator';

// b8aa — /dashboard/simulator honesty fixes.

const page = readFileSync(join(process.cwd(), 'app/dashboard/simulator/page.tsx'), 'utf8');

function input(fixes: SimulatorInput['fixes']): SimulatorInput {
  return {
    currentScore: 2,
    industry: 'dentist',
    city: 'Dallas',
    countryCode: 'US',
    competitorScore: null,
    platformsCovered: 2,
    fixes,
    revenueGap: 7855,
    revenueSymbol: '$',
  };
}

describe('b8aa — headline reconciles with the displayed per-fix gains', () => {
  it('projectedScoreMid = current + the sum of the fix gains shown on the page', () => {
    const fixes = [
      { id: 'faq', title: 'FAQ Schema', fix_type: 'faq_schema' },
      { id: 'dir', title: 'Directory Network', fix_type: 'directory_citations' },
      { id: 'rev', title: 'Review Velocity', fix_type: 'review_velocity' },
      { id: 'content', title: 'Content Optimization', fix_type: 'content_optimization' },
    ];
    const sim = calculateSimulation(input(fixes));
    const shownSum = sim.fixProjections.reduce((s, f) => s + f.pointsGained, 0);
    expect(sim.projectedScoreMid).toBe(projectScore(sim.currentScore, shownSum));
    expect(sim.projectedScoreMid - sim.currentScore).toBe(shownSum);
  });

  it('headline still sits inside the min–max range', () => {
    const fixes = [
      { id: 'faq', title: 'FAQ Schema', fix_type: 'faq_schema' },
      { id: 'dir', title: 'Directory Network', fix_type: 'directory_citations' },
    ];
    const sim = calculateSimulation(input(fixes));
    expect(sim.projectedScoreMid).toBeGreaterThanOrEqual(sim.projectedScoreMin);
    expect(sim.projectedScoreMid).toBeLessThanOrEqual(sim.projectedScoreMax);
  });

  it('no fixes → projection equals the current score', () => {
    const sim = calculateSimulation(input([]));
    expect(sim.projectedScoreMid).toBe(sim.currentScore);
    expect(sim.noFixesYet).toBe(true);
  });
});

describe('b8aa — page copy', () => {
  it('signed-out visitors get a sign-in gate with a return URL', () => {
    expect(page).toContain('Sign in to view your roadmap');
    expect(page).toContain('/login?next=/dashboard/simulator');
    expect(page).toContain('signedIn === false');
  });

  it('the two confidences are labelled as different quantities', () => {
    expect(page).toContain('fix-impact confidence');
    expect(page).toContain('Data confidence');
    expect(page).toContain('effBasis');
  });

  it('projection names the business and the seed scan', () => {
    expect(page).toContain('Projection for');
    expect(page).toContain('scanDate');
  });

  it('the revenue derivation is stated on the page', () => {
    expect(page).toContain('How this is estimated');
    expect(page).toContain('points gained × 2.5%');
    expect(page).toContain('10% conversion rate');
  });

  it('coverage dots have a key; footer does not double "based on"', () => {
    expect(page).toContain('Covered now');
    expect(page).toContain('Recovered with fixes (estimated)');
    expect(page).toContain('Not covered');
    expect(page).toContain('Data basis:');
    expect(page).not.toContain('Projection based on');
  });

  it('fixes without a canonical impact say so instead of "+0 pts, Week 0"', () => {
    expect(page).toContain('impact not estimated');
  });
});
