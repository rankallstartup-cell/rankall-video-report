import { describe, it, expect } from 'vitest';
import { sanitizeScanInput } from '../video/scanInput';

// Privacy + honesty: the sanitizer is the single choke point between raw
// scan JSON and the pipeline. response_text must never survive it.

describe('sanitizeScanInput', () => {
  it('strips response_text at top level and inside platform rows', () => {
    const input = sanitizeScanInput({
      businessName: 'Tech Ridge Dental',
      overallScore: 34,
      mentionedCount: 3,
      totalPlatforms: 11,
      response_text: 'SECRET RAW AI OUTPUT — must never reach the script',
      platforms: [
        { platform: 'ChatGPT', score: 80, mentioned: true, response_text: 'also secret' },
        { platform: 'Gemini', score: 20, mentioned: false },
      ],
    });
    expect(JSON.stringify(input)).not.toContain('response_text');
    expect(JSON.stringify(input)).not.toContain('SECRET RAW');
    expect(input.businessName).toBe('Tech Ridge Dental');
    expect(input.platforms).toHaveLength(2);
    expect(input.platforms![0].platform).toBe('ChatGPT');
  });

  it('maps rankall_scans snake_case aliases', () => {
    const input = sanitizeScanInput({
      user_business_name: 'Brite Smiles',
      overall_score: 42,
      mentioned_count: 5,
      total_platforms: 11,
      competitor_name: 'Smile Bright Co',
    });
    expect(input.businessName).toBe('Brite Smiles');
    expect(input.overallScore).toBe(42);
    expect(input.mentionedCount).toBe(5);
    expect(input.totalPlatforms).toBe(11);
    expect(input.competitorName).toBe('Smile Bright Co');
  });

  it('keeps NULLs as null instead of backfilling', () => {
    const input = sanitizeScanInput({
      businessName: 'Tech Ridge Dental',
      rating: 5.0,
      reviewCount: 1186,
      mentionNote: 'rarely mentioned',
    });
    expect(input.overallScore).toBeNull();
    expect(input.mentionedCount).toBeNull();
    expect(input.totalPlatforms).toBeNull();
    expect(input.rating).toBe(5.0);
    expect(input.reviewCount).toBe(1186);
    expect(input.mentionNote).toBe('rarely mentioned');
  });

  it('drops platform rows without a platform name', () => {
    const input = sanitizeScanInput({
      businessName: 'Acme',
      platforms: [{ score: 10, mentioned: false }, { platform: 'Perplexity', score: 50, mentioned: true }],
    });
    expect(input.platforms).toHaveLength(1);
    expect(input.platforms![0].platform).toBe('Perplexity');
  });

  it('throws on a missing business name', () => {
    expect(() => sanitizeScanInput({ overallScore: 10 })).toThrow(/business name/);
    expect(() => sanitizeScanInput(null)).toThrow();
    expect(() => sanitizeScanInput('nope')).toThrow();
  });
});
