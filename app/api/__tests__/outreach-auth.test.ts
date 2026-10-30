/* eslint-disable @typescript-eslint/no-explicit-any -- loose request/Supabase mocks */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Outreach back-office routes: admin session or internal automation only,
// and a DB rate limit per actor. Unauthenticated calls must 401 BEFORE any
// paid API (Resend, Instantly, Apollo, Hunter, SerpAPI, LLMs) is touched.

const state: { sessionUser: any; rpcCount: number; inserts: any[] } = { sessionUser: null, rpcCount: 0, inserts: [] };

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: state.sessionUser } }) } }),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: async () => ({ data: ++state.rpcCount, error: null }),
    from: () => {
      const q: any = {
        select: () => q, eq: () => q, ilike: () => q, gte: () => q, order: () => q, limit: () => q,
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: null }),
        insert: async (row: any) => { state.inserts.push(row); return { error: null }; },
        update: () => q,
      };
      return q;
    },
  }),
}));

function req(body: unknown, headers: Record<string, string> = {}): any {
  return { json: async () => body, cookies: { getAll: () => [] }, headers: new Headers(headers), url: 'https://rankall.io/x' };
}

const fetchMock = vi.fn();
beforeEach(() => {
  state.sessionUser = null;
  state.rpcCount = 0;
  state.inserts = [];
  process.env.CRON_SECRET = 'cron-test-secret';
  process.env.RESEND_API_KEY = 're_test';
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const LOADERS: Record<string, () => Promise<any>> = {
  'send-email': () => import('../outreach/send-email/route'),
  'run-scan': () => import('../outreach/run-scan/route'),
  'find-email': () => import('../outreach/find-email/route'),
  'find-targets': () => import('../outreach/find-targets/route'),
};
const ROUTES = Object.keys(LOADERS);
const BODY = { to: 'x@y.com', businessName: 'Acme', city: 'Austin', industry: 'dentist', platformResults: { ChatGPT: true } };

describe('outreach routes require admin or internal automation', () => {
  for (const r of ROUTES) {
    it(`${r}: anonymous → 401, no outbound call`, async () => {
      const { POST } = await LOADERS[r]();
      const res = await POST(req(BODY));
      expect(res.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it(`${r}: non-admin session → 401`, async () => {
      state.sessionUser = { id: 'u1', email: 'someone@example.com', app_metadata: {} };
      const { POST } = await LOADERS[r]();
      const res = await POST(req(BODY));
      expect(res.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it(`${r}: "Bearer undefined" with CRON_SECRET unset → 401`, async () => {
      delete process.env.CRON_SECRET;
      const { POST } = await LOADERS[r]();
      const res = await POST(req(BODY, { authorization: 'Bearer undefined' }));
      expect(res.status).toBe(401);
    });

    it(`${r}: internal bearer passes auth but is rate limited`, async () => {
      state.rpcCount = 10_000; // already over every daily cap
      const { POST } = await LOADERS[r]();
      const res = await POST(req(BODY, { authorization: 'Bearer cron-test-secret' }));
      expect(res.status).toBe(429);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }
});

describe('outreach/unsubscribe requires the HMAC token', () => {
  it('rejects a bare email', async () => {
    const { POST } = await import('../outreach/unsubscribe/route');
    const res = await POST(req({ email: 'victim@example.com' }));
    expect(res.status).toBe(403);
    expect(state.inserts).toHaveLength(0);
  });
  it('rejects a wrong token', async () => {
    const { POST } = await import('../outreach/unsubscribe/route');
    const res = await POST(req({ email: 'victim@example.com', token: 'deadbeefdeadbeefdeadbeefdeadbeef' }));
    expect(res.status).toBe(403);
  });
  it('accepts the token from the email link', async () => {
    const { generateUnsubscribeToken } = await import('@/lib/outreachGuard');
    const { POST } = await import('../outreach/unsubscribe/route');
    const res = await POST(req({ email: 'Victim@Example.com', token: generateUnsubscribeToken('victim@example.com') }));
    expect(res.status).toBe(200);
    expect(state.inserts[0].email).toBe('victim@example.com');
  });
  it('fails closed when no signing secret is configured', async () => {
    delete process.env.CRON_SECRET;
    delete process.env.UNSUBSCRIBE_SECRET;
    const { POST } = await import('../outreach/unsubscribe/route');
    const res = await POST(req({ email: 'a@b.com', token: '' }));
    expect(res.status).toBe(403);
  });
});

describe('outreach/track redirect allow-list', () => {
  async function go(redirect: string) {
    const { GET } = await import('../outreach/track/route');
    const res = await GET({ url: `https://rankall.io/api/outreach/track?event=click&redirect=${encodeURIComponent(redirect)}`, headers: new Headers() } as any);
    return res.headers.get('location');
  }
  it('follows rankall.io links', async () => {
    expect(await go('https://rankall.io/report/abc')).toBe('https://rankall.io/report/abc');
    expect(await go('https://www.rankall.io/video/abc?x=1')).toBe('https://www.rankall.io/video/abc?x=1');
  });
  it('refuses other hosts and schemes', async () => {
    for (const bad of ['https://evil.com', 'https://rankall.io.evil.com/', '//evil.com', 'javascript:alert(1)', 'http://rankall.io/', 'https://user@rankall.io/', 'https://rankall.io:8443/']) {
      expect(await go(bad)).toBe('https://rankall.io/');
    }
  });
});
