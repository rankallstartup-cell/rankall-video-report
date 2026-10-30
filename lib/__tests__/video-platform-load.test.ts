// Platform-results load regression (Oct 26, Vercel logs): the old query
// selected a bare `rank` column that does NOT exist on
// rankall_platform_results (the real column is rank_position). PostgREST
// resolves bare `rank` to the ordered-set aggregate rank() → error 42809
// "WITHIN GROUP is required". The old code logged that error and
// swallowed it, proceeding with ZERO platforms — a silently degraded
// video. These tests pin the fixed query (rank_position) and mapping
// through the real loader with a mocked admin. No keys, no live calls.
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: vi.fn() }));

import { getSupabaseAdmin } from '@/lib/supabase';
import { loadScanAggregates } from '@/app/api/hackathon/video-report/route';

const mockedAdmin = getSupabaseAdmin as unknown as ReturnType<typeof vi.fn>;

function makeAdmin(selects: string[], scanRow: unknown, platformRows: unknown[], platformError: unknown = null) {
  return {
    from: (table: string) => ({
      select: (cols: string) => {
        selects.push(`${table}:${cols}`);
        return {
          eq: () => ({
            async maybeSingle() {
              return { data: scanRow, error: null };
            },
            async order() {
              return { data: platformError ? null : platformRows, error: platformError };
            },
          }),
        };
      },
    }),
  };
}

const SCAN_ROW = {
  id: 'scan-1',
  user_business_name: 'Tech Ridge Dental',
  input: 'Tech Ridge Dental in Austin, TX',
  industry: 'Dental',
  location: 'Austin, TX',
  overall_score: 91,
  competitor_name: 'Comp Dental',
  mentioned_count: 10,
};

describe('loadScanAggregates platform load', () => {
  it('selects rank_position (never bare rank) and maps it to rank', async () => {
    const selects: string[] = [];
    mockedAdmin.mockReturnValue(
      makeAdmin(selects, SCAN_ROW, [
        { platform: 'ChatGPT', score: 100, mentioned: true, sentiment: 'positive', rank_position: 1 },
        { platform: 'Gemini', score: 80, mentioned: true, sentiment: 'neutral', rank_position: 2 },
        { platform: 'Perplexity', score: 0, mentioned: false, sentiment: 'neutral', rank_position: null },
      ]),
    );
    const out = await loadScanAggregates('scan-1');
    expect(selects).toContain(
      'rankall_platform_results:platform, score, mentioned, sentiment, rank_position',
    );
    expect(selects.join(' ')).not.toMatch(/rankall_platform_results:[^|]*\brank\b(?!_position)/);
    expect(out.businessName).toBe('Tech Ridge Dental');
    expect(out.totalPlatforms).toBe(3);
    expect(out.mentionedCount).toBe(10);
    expect(out.platforms).toEqual([
      { platform: 'ChatGPT', score: 100, mentioned: true, sentiment: 'positive', rank: 1 },
      { platform: 'Gemini', score: 80, mentioned: true, sentiment: 'neutral', rank: 2 },
      { platform: 'Perplexity', score: 0, mentioned: false, sentiment: 'neutral', rank: null },
    ]);
  });

  it('null rank_position maps to null rank; mentionedCount falls back to rows', async () => {
    const selects: string[] = [];
    mockedAdmin.mockReturnValue(
      makeAdmin(selects, { ...SCAN_ROW, mentioned_count: null }, [
        { platform: 'ChatGPT', score: 100, mentioned: true, sentiment: 'positive', rank_position: null },
        { platform: 'Gemini', score: 0, mentioned: false, sentiment: 'neutral', rank_position: null },
      ]),
    );
    const out = await loadScanAggregates('scan-1');
    expect(out.mentionedCount).toBe(1);
    expect(out.totalPlatforms).toBe(2);
    expect((out.platforms as { rank: unknown }[]).map((p) => p.rank)).toEqual([null, null]);
  });

  it('a platform-load error throws instead of degrading to zero platforms', async () => {
    mockedAdmin.mockReturnValue(
      makeAdmin([], SCAN_ROW, [], { code: '42809', message: 'WITHIN GROUP is required' }),
    );
    await expect(loadScanAggregates('scan-1')).rejects.toThrow(/Platform results load failed/);
  });
});
