// b8b9 — /api/usage/summary must display the plan's REAL limits.
// resolvePlanServer returns plan='enterprise' for admins (the admin
// bypass is enforcement-only); the old route used that upgraded plan,
// so a Free admin saw "Unlimited" for every feature while the Plan tab
// said "Free Plan / 3 scans / month".
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const captured: { plan?: string } = {};
vi.mock('@/lib/usageLimits', () => ({
  getUsageSummary: vi.fn(async (_userId: string, plan: string) => {
    captured.plan = plan;
    return { local_scan: { used: 0, limit: plan === 'free' ? 3 : 999999, remaining: 3 } };
  }),
}));
vi.mock('@/lib/resolvePlanServer', () => ({
  resolvePlanServer: vi.fn(async () => ({
    plan: 'enterprise', // admin-upgraded — must NOT be used for display
    rawPlan: 'free',
    isTrialing: false,
  })),
}));
vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  })),
}));

import { GET } from '@/app/api/usage/summary/route';
import { getUsageSummary } from '@/lib/usageLimits';

describe('usage summary route (b8b9)', () => {
  beforeEach(() => { captured.plan = undefined; vi.clearAllMocks(); });

  it('uses the real plan (rawPlan) for the displayed limits, not the admin-upgraded plan', async () => {
    const req = new NextRequest('http://localhost/api/usage/summary?userId=user-1');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.plan).toBe('free');
    expect(captured.plan).toBe('free');
    expect(json.summary.local_scan.limit).toBe(3);
    expect(getUsageSummary).toHaveBeenCalledWith('user-1', 'free', false);
  });

  it('rejects a userId that is not the caller (b01t guard intact)', async () => {
    const req = new NextRequest('http://localhost/api/usage/summary?userId=someone-else');
    const res = await GET(req);
    expect(res.status).toBe(403);
  });
});
