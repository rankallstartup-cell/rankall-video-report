import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// INT-01: the CSV export must fail closed — owner only, paid plans only,
// never for free or trialing accounts.

let scanRow: Record<string, unknown> | null = null;
let platformRows: Array<Record<string, unknown>> = [];
let fixRows: Array<Record<string, unknown>> = [];
let authedUserId: string | null = null;
let serverPlan: { plan: string; isTrialing: boolean } = { plan: 'free', isTrialing: false };

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: vi.fn((table: string) => {
      const rows =
        table === 'rankall_platform_results' ? platformRows :
        table === 'generated_fixes' ? fixRows : null;
      const q: Record<string, unknown> = {};
      q.select = vi.fn(() => q);
      q.eq = vi.fn(() => q);
      q.maybeSingle = vi.fn(async () => ({ data: scanRow, error: null }));
      q.order = vi.fn(async () => ({ data: rows, error: null }));
      // rankall_platform_results is awaited directly (no terminal call)
      (q as unknown as { then: unknown }).then = (resolve: (v: unknown) => void) =>
        Promise.resolve({ data: rows, error: null }).then(resolve);
      return q;
    }),
  }),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: authedUserId ? { id: authedUserId } : null } }) },
  }),
}));

vi.mock('@/lib/resolvePlanServer', () => ({
  resolvePlanServer: async () => ({ plan: serverPlan.plan, isTrialing: serverPlan.isTrialing }),
}));

import { GET } from '@/app/api/report/[id]/export/route';

const SCAN = {
  id: '123e4567-e89b-12d3-a456-426614174000', user_id: 'user-1', user_business_name: 'Brite Smiles',
  input: 'Brite Smiles in Austin', overall_score: 55, industry: 'Dentist',
  city: 'Austin', created_at: '2026-10-01T00:00:00Z',
};

function req() {
  return new NextRequest('https://rankall.io/api/report/123e4567-e89b-12d3-a456-426614174000/export', { method: 'GET' });
}
const params = Promise.resolve({ id: '123e4567-e89b-12d3-a456-426614174000' });

beforeEach(() => {
  scanRow = { ...SCAN };
  platformRows = [
    { platform: 'chatgpt', mentioned: true, sentiment: 'positive' },
    { platform: 'gemini', mentioned: false, sentiment: null },
  ];
  fixRows = [{ fix_type: 'faq_schema', title: 'Add FAQ schema', impact: '+8 pts', status: 'pending' }];
  authedUserId = 'user-1';
  serverPlan = { plan: 'business', isTrialing: false };
  vi.clearAllMocks();
});

describe('GET /api/report/[id]/export', () => {
  it('401s when not signed in', async () => {
    authedUserId = null;
    const res = await GET(req(), { params });
    expect(res.status).toBe(401);
  });

  it('404s for a stranger (owner-only, same as the report)', async () => {
    authedUserId = 'user-2';
    const res = await GET(req(), { params });
    expect(res.status).toBe(404);
  });

  it('403s for free plans with an honest message', async () => {
    serverPlan = { plan: 'free', isTrialing: false };
    const res = await GET(req(), { params });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/paid-plan/);
  });

  it('403s for trialing accounts with an honest message', async () => {
    serverPlan = { plan: 'business', isTrialing: true };
    const res = await GET(req(), { params });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/trial/);
  });

  it('returns a CSV download for paid plans', async () => {
    const res = await GET(req(), { params });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toContain('attachment');
    const csv = await res.text();
    expect(csv).toContain('Brite Smiles');
    expect(csv).toContain('55');
    expect(csv).toContain('chatgpt');
    expect(csv).toContain('Add FAQ schema');
  });
});
