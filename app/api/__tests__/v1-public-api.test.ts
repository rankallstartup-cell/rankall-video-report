import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// STD-06 Part A: the public v1 API must fail closed — public scans (or owner)
// only, private scans are 404, rate limits are 429.

let scanRow: Record<string, unknown> | null = null;
let platformRows: Array<Record<string, unknown>> = [];
let outcomeRow: Record<string, unknown> | null = null;
let authedUserId: string | null = null;

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: vi.fn((table: string) => {
      const q: Record<string, unknown> = {};
      q.select = vi.fn(() => q);
      q.eq = vi.fn(() => q);
      q.maybeSingle = vi.fn(async () => ({
        data: table === 'rankall_scans' ? scanRow
          : table === 'verified_outcomes' ? outcomeRow : null,
        error: null,
      }));
      (q as unknown as { then: unknown }).then = (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: platformRows, error: null }).then(resolve);
      return q;
    }),
  }),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: authedUserId ? { id: authedUserId } : null } }) },
  }),
}));

import { GET as getScore } from '@/app/api/v1/score/[scanId]/route';
import { GET as getVerification } from '@/app/api/v1/verification/[id]/route';

const SCAN_ID = '123e4567-e89b-12d3-a456-426614174000';
const VERIF_ID = '223e4567-e89b-12d3-a456-426614174000';

function scoreReq() {
  return new NextRequest(`https://rankall.io/api/v1/score/${SCAN_ID}`);
}
function verifReq() {
  return new NextRequest(`https://rankall.io/api/v1/verification/${VERIF_ID}`);
}

beforeEach(() => {
  scanRow = {
    id: SCAN_ID, user_id: 'user-1', user_business_name: 'Brite Smiles',
    input: 'Brite Smiles in Austin', overall_score: 55, industry: 'Dentist',
    city: 'Austin', is_public: true, created_at: '2026-10-01T00:00:00Z',
  };
  platformRows = [
    { platform: 'chatgpt', mentioned: true, sentiment: 'positive' },
    { platform: 'gemini', mentioned: false, sentiment: null },
  ];
  outcomeRow = {
    id: VERIF_ID, business_name: 'Brite Smiles', business_industry: 'Dentist',
    fix_type: 'faq_schema', score_before: 40, score_after: 55,
    score_improvement: 15, verified_at: '2026-10-10T00:00:00Z', confidence_level: 'high',
  };
  authedUserId = null;
  vi.clearAllMocks();
});

describe('GET /api/v1/score/[scanId]', () => {
  it('404s for a non-UUID id', async () => {
    const res = await getScore(scoreReq(), { params: Promise.resolve({ scanId: 'nope' }) });
    expect(res.status).toBe(404);
  });

  it('404s for a private scan viewed by a stranger', async () => {
    scanRow = { ...(scanRow as object), is_public: false };
    authedUserId = 'user-2';
    const res = await getScore(scoreReq(), { params: Promise.resolve({ scanId: SCAN_ID }) });
    expect(res.status).toBe(404);
  });

  it('serves a private scan to its owner', async () => {
    scanRow = { ...(scanRow as object), is_public: false };
    authedUserId = 'user-1';
    const res = await getScore(scoreReq(), { params: Promise.resolve({ scanId: SCAN_ID }) });
    expect(res.status).toBe(200);
  });

  it('returns the score payload for a public scan', async () => {
    const res = await getScore(scoreReq(), { params: Promise.resolve({ scanId: SCAN_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.business).toBe('Brite Smiles');
    expect(body.ai_visibility_score).toBe(55);
    expect(body.platforms_mentioned).toBe(1);
    expect(body.source).toBe('rankall.io');
  });
});

describe('GET /api/v1/verification/[id]', () => {
  it('404s for a non-UUID id', async () => {
    const res = await getVerification(verifReq(), { params: Promise.resolve({ id: 'nope' }) });
    expect(res.status).toBe(404);
  });

  it('returns the verification payload', async () => {
    const res = await getVerification(verifReq(), { params: Promise.resolve({ id: VERIF_ID }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.score_before).toBe(40);
    expect(body.score_after).toBe(55);
    expect(body.verified_by).toBe('rankall.io');
  });

  it('404s when the outcome is missing (not verified/public)', async () => {
    outcomeRow = null;
    const res = await getVerification(verifReq(), { params: Promise.resolve({ id: VERIF_ID }) });
    expect(res.status).toBe(404);
  });
});
