import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { latestPerBusiness } from '../../../lib/leaderboardRows';

// Item 16: the leaderboard API had no plan check and one user's repeat
// scans filled several ranks.
describe('latestPerBusiness', () => {
  it('keeps only the latest scan per (user, business), ranked by score', () => {
    const rows = [
      { user_id: 'u1', user_business_name: 'Acme', input: null, overall_score: 90, created_at: '2026-10-01T00:00:00Z' },
      { user_id: 'u1', user_business_name: 'Acme', input: null, overall_score: 60, created_at: '2026-10-10T00:00:00Z' },
      { user_id: 'u1', user_business_name: 'acme ', input: null, overall_score: 80, created_at: '2026-10-05T00:00:00Z' },
      { user_id: 'u1', user_business_name: 'Second Biz', input: null, overall_score: 70, created_at: '2026-10-02T00:00:00Z' },
      { user_id: 'u2', user_business_name: 'Acme', input: null, overall_score: 65, created_at: '2026-10-03T00:00:00Z' },
      { user_id: 'u3', user_business_name: 'NoScore', input: null, overall_score: null, created_at: '2026-10-03T00:00:00Z' },
    ];
    const out = latestPerBusiness(rows);
    expect(out.map(r => [r.user_id, r.user_business_name, r.overall_score])).toEqual([
      ['u1', 'Second Biz', 70],
      ['u2', 'Acme', 65],
      ['u1', 'Acme', 60],
    ]);
  });
  it('caps at the limit', () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ user_id: `u${i}`, user_business_name: `B${i}`, input: null, overall_score: i, created_at: null }));
    expect(latestPerBusiness(rows, 25)).toHaveLength(25);
  });
});

const plan = { value: 'personal_pro', isAdmin: false };
vi.mock('@/lib/apiAuth', () => ({ getSessionUser: vi.fn(async () => ({ id: 'u1', email: 'a@b.c', app_metadata: {} })) }));
vi.mock('@/lib/resolvePlanServer', () => ({ resolvePlanServer: vi.fn(async () => ({ plan: plan.value, rawPlan: plan.value, isAdmin: plan.isAdmin, email: '', isTrialing: false, subscriptionStatus: null, trialStartedAt: null })) }));
const rowsData = [
  { user_id: 'u1', user_business_name: 'Mine', input: null, overall_score: 50, created_at: '2026-10-01T00:00:00Z' },
  { user_id: 'u1', user_business_name: 'Mine', input: null, overall_score: 55, created_at: '2026-10-09T00:00:00Z' },
  { user_id: 'u2', user_business_name: 'Other', input: null, overall_score: 70, created_at: '2026-10-02T00:00:00Z' },
];
vi.mock('@/lib/supabase', () => {
  const q: Record<string, unknown> = {};
  for (const m of ['from', 'select', 'eq', 'not', 'order', 'limit', 'ilike']) q[m] = () => q;
  (q as { then: unknown }).then = (res: (v: unknown) => unknown) => res({ data: rowsData, error: null });
  return { getSupabaseAdmin: () => q };
});

describe('GET /api/dashboard/leaderboard', () => {
  beforeEach(() => { plan.value = 'personal_pro'; plan.isAdmin = false; });
  it('403 for a plan without the leaderboard page', async () => {
    const { GET } = await import('../dashboard/leaderboard/route');
    const res = await GET(new NextRequest('https://rankall.io/api/dashboard/leaderboard?industry=dentist'));
    expect(res.status).toBe(403);
  });
  it('business plan gets one row per business', async () => {
    plan.value = 'business';
    const { GET } = await import('../dashboard/leaderboard/route');
    const res = await GET(new NextRequest('https://rankall.io/api/dashboard/leaderboard?industry=dentist'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows).toHaveLength(2);
    expect(body.rows[0]).toMatchObject({ rank: 1, score: 70, isUser: false });
    expect(body.rows[1]).toMatchObject({ rank: 2, score: 55, isUser: true });
  });
});
