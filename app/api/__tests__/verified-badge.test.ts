import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// STD-03: the verified-outcome API must fail closed — public reads only for
// verified + public outcomes, and only the owner can flip is_public.

type OutcomeRow = Record<string, unknown> | null;

let outcomeRow: OutcomeRow = null;
let updateCalls: Array<{ table: string; values: unknown }> = [];
let authedUserId: string | null = null;

function makeQuery(row: OutcomeRow) {
  const q: Record<string, unknown> = {};
  q.select = vi.fn(() => q);
  q.eq = vi.fn(() => q);
  q.maybeSingle = vi.fn(async () => ({ data: row, error: null }));
  q.update = vi.fn((values: unknown) => {
    updateCalls.push({ table: 'verified_outcomes', values });
    return q;
  });
  return q;
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: vi.fn((_table: string) => makeQuery(outcomeRow)),
  }),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: authedUserId ? { id: authedUserId } : null } }) },
  }),
}));

import { GET, PATCH } from '@/app/api/verified/[id]/route';
import { GET as GET_BADGE } from '@/app/api/badge/verified/[id]/route';

const VERIFIED_PUBLIC = {
  id: 'vo-1', user_id: 'user-1', business_name: 'Brite Smiles',
  fix_type: 'faq_schema', score_before: 40, score_after: 55, score_improvement: 15,
  verified_at: '2026-10-01T00:00:00Z', is_verified: true, is_public: true,
  confidence_level: 'verified',
};

function req(method: string, body?: unknown) {
  return new NextRequest('https://rankall.io/api/verified/vo-1', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const params = Promise.resolve({ id: 'vo-1' });

beforeEach(() => {
  outcomeRow = null;
  updateCalls = [];
  authedUserId = null;
  vi.clearAllMocks();
});

describe('GET /api/verified/[id] — public proof', () => {
  it('404s when the outcome does not exist', async () => {
    outcomeRow = null;
    const res = await GET(req('GET'), { params });
    expect(res.status).toBe(404);
  });

  it('404s when verified but NOT public (no leak without permission)', async () => {
    outcomeRow = { ...VERIFIED_PUBLIC, is_public: false };
    const res = await GET(req('GET'), { params });
    expect(res.status).toBe(404);
  });

  it('404s when public but NOT verified (predictions are never proof)', async () => {
    outcomeRow = { ...VERIFIED_PUBLIC, is_verified: false, is_public: true };
    const res = await GET(req('GET'), { params });
    expect(res.status).toBe(404);
  });

  it('returns the outcome without user_id when verified + public', async () => {
    outcomeRow = { ...VERIFIED_PUBLIC };
    const res = await GET(req('GET'), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.score_before).toBe(40);
    expect(body.score_after).toBe(55);
    expect(body.user_id).toBeUndefined();
  });
});

describe('PATCH /api/verified/[id] — publish permission', () => {
  it('401s when not signed in', async () => {
    authedUserId = null;
    outcomeRow = { ...VERIFIED_PUBLIC, is_public: false };
    const res = await PATCH(req('PATCH', { is_public: true }), { params });
    expect(res.status).toBe(401);
  });

  it('403s when not the owner', async () => {
    authedUserId = 'user-2';
    outcomeRow = { ...VERIFIED_PUBLIC, is_public: false };
    const res = await PATCH(req('PATCH', { is_public: true }), { params });
    expect(res.status).toBe(403);
    expect(updateCalls).toHaveLength(0);
  });

  it('422s when the outcome is not verified (only verified outcomes go public)', async () => {
    authedUserId = 'user-1';
    outcomeRow = { ...VERIFIED_PUBLIC, is_verified: false, is_public: false };
    const res = await PATCH(req('PATCH', { is_public: true }), { params });
    expect(res.status).toBe(422);
    expect(updateCalls).toHaveLength(0);
  });

  it('lets the owner publish a verified outcome', async () => {
    authedUserId = 'user-1';
    outcomeRow = { ...VERIFIED_PUBLIC, is_public: false };
    const res = await PATCH(req('PATCH', { is_public: true }), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.is_public).toBe(true);
    expect(updateCalls).toHaveLength(1);
    expect((updateCalls[0].values as Record<string, unknown>).is_public).toBe(true);
  });

  it('lets the owner unpublish', async () => {
    authedUserId = 'user-1';
    outcomeRow = { ...VERIFIED_PUBLIC, is_public: true };
    const res = await PATCH(req('PATCH', { is_public: false }), { params });
    expect(res.status).toBe(200);
    expect((await res.json()).is_public).toBe(false);
  });
});

describe('GET /api/badge/verified/[id] — fail closed', () => {
  it('serves the generic badge when not public (no scores leak)', async () => {
    outcomeRow = { ...VERIFIED_PUBLIC, is_public: false };
    const res = await GET_BADGE(req('GET'), { params });
    expect(res.status).toBe(200);
    const svg = await res.text();
    expect(svg).toContain('Verified by Rankall');
    expect(svg).not.toContain('+15');
  });

  it('serves the real badge with the improvement when verified + public', async () => {
    outcomeRow = { ...VERIFIED_PUBLIC };
    const res = await GET_BADGE(req('GET'), { params });
    expect(res.status).toBe(200);
    const svg = await res.text();
    expect(svg).toContain('+15 pts verified');
    expect(svg).toContain('Brite Smiles');
  });

  it('escapes business names in the badge SVG', async () => {
    outcomeRow = { ...VERIFIED_PUBLIC, business_name: 'A&B <Dental>' };
    const res = await GET_BADGE(req('GET'), { params });
    const svg = await res.text();
    expect(svg).toContain('A&amp;B &lt;Dental&gt;');
    expect(svg).not.toContain('A&B <Dental>');
  });
});
