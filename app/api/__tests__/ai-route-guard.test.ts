/* eslint-disable @typescript-eslint/no-explicit-any -- loose request/Supabase mocks */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { aiScanAccess } from '@/lib/aiRouteGuard';

// Paid-AI routes: session (or ownerless-scan anonymous funnel) + DB rate limit.

const state: { sessionUser: any; scans: Record<string, any>; rpcCount: number; upserts: any[] } = {
  sessionUser: null, scans: {}, rpcCount: 0, upserts: [],
};

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: state.sessionUser } }) } }),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: async () => ({ data: ++state.rpcCount, error: null }),
    from: (table: string) => {
      let id: string | null = null;
      const q: any = {
        select: () => q,
        eq: (_c: string, v: string) => { id = v; return q; },
        maybeSingle: async () => ({ data: table === 'rankall_scans' ? state.scans[id as string] ?? null : null, error: null }),
        upsert: async (rows: any) => { state.upserts.push(rows); return { error: null }; },
      };
      return q;
    },
  }),
}));

function req(body: unknown): any {
  return { json: async () => body, cookies: { getAll: () => [] }, headers: new Headers({ 'x-real-ip': '9.9.9.9' }) };
}

const fetchMock = vi.fn();
beforeEach(() => {
  state.sessionUser = null;
  state.rpcCount = 0;
  state.upserts = [];
  state.scans = {
    owned: { id: 'owned', user_id: 'victim', input: 'Victim Dental', industry: 'dentist', location: 'Austin' },
    anon: { id: 'anon', user_id: null, input: 'Joe Plumbing', industry: 'plumber', location: 'Austin' },
  };
  delete process.env.ANTHROPIC_API_KEY; // template path — no network
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('aiScanAccess', () => {
  const me = { id: 'me', email: 'me@example.com' };
  it('owner ok, other user forbidden, ownerless ok only for funnel routes', () => {
    expect(aiScanAccess({ user_id: 'me' }, me, false)).toBe('ok');
    expect(aiScanAccess({ user_id: 'victim' }, me, true)).toBe('forbidden');
    expect(aiScanAccess({ user_id: null }, me, true)).toBe('ok');
    expect(aiScanAccess({ user_id: null }, me, false)).toBe('forbidden');
  });
  it('anonymous: only ownerless scans on funnel routes', () => {
    expect(aiScanAccess({ user_id: null }, null, true)).toBe('ok');
    expect(aiScanAccess({ user_id: 'victim' }, null, true)).toBe('unauthenticated');
    expect(aiScanAccess(null, null, false)).toBe('unauthenticated');
    expect(aiScanAccess(null, null, true)).toBe('ok');
  });
});

describe('generate-fixes', () => {
  it('anonymous on a customer scan → 401, nothing persisted', async () => {
    const { POST } = await import('../generate-fixes/route');
    const res = await POST(req({ businessInput: 'x', scanId: 'owned' }));
    expect(res.status).toBe(401);
    expect(state.upserts).toHaveLength(0);
  });
  it('another signed-in user on a customer scan → 403', async () => {
    state.sessionUser = { id: 'me', email: 'me@example.com', app_metadata: {} };
    const { POST } = await import('../generate-fixes/route');
    const res = await POST(req({ businessInput: 'x', scanId: 'owned' }));
    expect(res.status).toBe(403);
    expect(state.upserts).toHaveLength(0);
  });
  it('requires a scanId', async () => {
    const { POST } = await import('../generate-fixes/route');
    const res = await POST(req({ businessInput: 'x' }));
    expect(res.status).toBe(400);
  });
  it('anonymous free report on an ownerless scan works and uses the stored scan facts', async () => {
    const { POST } = await import('../generate-fixes/route');
    const res = await POST(req({ businessInput: 'IGNORED body text', scanId: 'anon' }));
    expect(res.status).toBe(200);
    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0][0].scan_id).toBe('anon');
  });
  it('anonymous per-IP limit → 429', async () => {
    state.rpcCount = 100;
    const { POST } = await import('../generate-fixes/route');
    const res = await POST(req({ scanId: 'anon' }));
    expect(res.status).toBe(429);
  });
  it('owner may generate for their own scan', async () => {
    state.sessionUser = { id: 'victim', email: 'v@example.com', app_metadata: {} };
    const { POST } = await import('../generate-fixes/route');
    const res = await POST(req({ scanId: 'owned' }));
    expect(res.status).toBe(200);
  });
});

describe('session-only AI routes', () => {
  const LOADERS: Record<string, () => Promise<any>> = {
    'personal-fix': () => import('../personal-fix/route'),
    'personal-fix/pitch-kit': () => import('../personal-fix/pitch-kit/route'),
    'personal-peer': () => import('../personal-peer/route'),
    'personal-competitor': () => import('../personal-competitor/route'),
    'seo-audit/fix': () => import('../seo-audit/fix/route'),
  };
  for (const [name, load] of Object.entries(LOADERS)) {
    it(`${name}: anonymous → 401 with no outbound call`, async () => {
      const { POST } = await load();
      const res = await POST(req({ fix_type: 'wikipedia_stub', name: 'Jane Doe', specialty: 'dentist' }));
      expect(res.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }
  it('personal-fix: signed-in user over the daily limit → 429', async () => {
    state.sessionUser = { id: 'me', email: 'me@example.com', app_metadata: {} };
    state.rpcCount = 1000;
    const { POST } = await import('../personal-fix/route');
    const res = await POST(req({ fix_type: 'wikipedia_stub', name: 'Jane Doe' }));
    expect(res.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('personal-linkedin keeps the homepage funnel (anonymous, per-IP)', () => {
  it('anonymous allowed under the IP limit', async () => {
    const { POST } = await import('../personal-linkedin/route');
    const res = await POST(req({ name: 'Jane Doe' }));
    expect(res.status).not.toBe(401);
  });
  it('anonymous over the IP limit → 429', async () => {
    state.rpcCount = 100;
    const { POST } = await import('../personal-linkedin/route');
    const res = await POST(req({ name: 'Jane Doe' }));
    expect(res.status).toBe(429);
  });
});
