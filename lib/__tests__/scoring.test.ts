import { describe, it, expect } from 'vitest';
import { calculateOverallScore, calculateRecommendationShare, type ScoreInput } from '../scoring';

describe('calculateRecommendationShare — canonical mentioned/total (b02f)', () => {
  it('mentioned/total as a percentage', () => {
    expect(calculateRecommendationShare(3, 12)).toBe(25);
    expect(calculateRecommendationShare(0, 11)).toBe(0);
    expect(calculateRecommendationShare(12, 12)).toBe(100);
    expect(calculateRecommendationShare(1, 12)).toBe(8);
  });
  it('zero total platforms returns 0 (no divide-by-zero)', () => {
    expect(calculateRecommendationShare(1, 0)).toBe(0);
  });
});

describe('calculateOverallScore', () => {
  it('excludes failed platforms from denominator', () => {
    const platforms: ScoreInput[] = [
      { weight: 1, mentionRate: 1, status: 'success' },
      { weight: 1, mentionRate: 0, status: 'success' },
      { weight: 1, mentionRate: 0, status: 'error' },
    ];
    const result = calculateOverallScore(platforms, 3);
    // Only 2 platforms responded: 1 mentioned (weight 1), 1 not (weight 1)
    // Score = (1*1) / (1+1) * 100 = 50
    expect(result.score).toBe(50);
    expect(result.respondedCount).toBe(2);
    expect(result.totalCount).toBe(3); // total passed in, not responders
  });

  it('1 of 12 platforms fails, score equals 11-platform result', () => {
    const mkPlatform = (weight: number, mentioned: boolean, status: 'success' | 'error'): ScoreInput => ({
      weight, mentionRate: mentioned ? 1 : 0, status,
    });
    // 11 successful platforms, 3 mention the business
    const elevenPlatforms: ScoreInput[] = [
      mkPlatform(1.5, true, 'success'),
      mkPlatform(1.2, true, 'success'),
      mkPlatform(1.0, true, 'success'),
      mkPlatform(1.0, false, 'success'),
      mkPlatform(1.0, false, 'success'),
      mkPlatform(0.8, false, 'success'),
      mkPlatform(0.8, false, 'success'),
      mkPlatform(0.7, false, 'success'),
      mkPlatform(0.5, false, 'success'),
      mkPlatform(0.5, false, 'success'),
      mkPlatform(1.0, false, 'success'),
    ];
    const elevenResult = calculateOverallScore(elevenPlatforms, 3);

    // Same 11 platforms + 1 failed platform
    const twelvePlatforms: ScoreInput[] = [
      ...elevenPlatforms,
      mkPlatform(1.0, false, 'error'),
    ];
    const twelveResult = calculateOverallScore(twelvePlatforms, 3);

    expect(twelveResult.score).toBe(elevenResult.score);
    expect(twelveResult.mentionedCount).toBe(elevenResult.mentionedCount);
    expect(twelveResult.totalCount).toBe(12); // total passed in, not responders
  });

  it('all platforms succeed, score uses full denominator', () => {
    const platforms: ScoreInput[] = [
      { weight: 1, mentionRate: 1, status: 'success' },
      { weight: 1, mentionRate: 0, status: 'success' },
    ];
    const result = calculateOverallScore(platforms, 3);
    expect(result.score).toBe(50);
    expect(result.totalCount).toBe(2);
  });

  it('selects highest-scoring competitor from three candidates', () => {
    // Simulate 5 platforms, 3 queries each
    const platforms: ScoreInput[] = [
      { weight: 1.5, mentionRate: 0, status: 'success' },
      { weight: 1.2, mentionRate: 0, status: 'success' },
      { weight: 1.0, mentionRate: 0, status: 'success' },
      { weight: 0.8, mentionRate: 0, status: 'success' },
      { weight: 0.5, mentionRate: 0, status: 'success' },
    ];

    // Competitor A: mentioned on platforms 0,1 (weight 1.5+1.2=2.7)
    const compA = platforms.map((p, i) => ({ ...p, mentionRate: [0, 1].includes(i) ? 1 : 0 }));
    const scoreA = calculateOverallScore(compA, 3);

    // Competitor B: mentioned on platforms 0,1,2 (weight 1.5+1.2+1.0=3.7)
    const compB = platforms.map((p, i) => ({ ...p, mentionRate: [0, 1, 2].includes(i) ? 1 : 0 }));
    const scoreB = calculateOverallScore(compB, 3);

    // Competitor C: mentioned on platforms 3,4 (weight 0.8+0.5=1.3)
    const compC = platforms.map((p, i) => ({ ...p, mentionRate: [3, 4].includes(i) ? 1 : 0 }));
    const scoreC = calculateOverallScore(compC, 3);

    // B has highest score (most weighted mentions)
    const scores = [
      { name: 'A', score: scoreA.score, platformCount: scoreA.mentionedCount },
      { name: 'B', score: scoreB.score, platformCount: scoreB.mentionedCount },
      { name: 'C', score: scoreC.score, platformCount: scoreC.mentionedCount },
    ];
    const top = scores.sort((a, b) => b.score - a.score || b.platformCount - a.platformCount)[0];

    expect(top.name).toBe('B');
    expect(scoreB.score).toBeGreaterThan(scoreA.score);
    expect(scoreA.score).toBeGreaterThan(scoreC.score);
  });
});
