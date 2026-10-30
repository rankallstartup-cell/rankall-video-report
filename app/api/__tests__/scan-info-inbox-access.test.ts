/* eslint-disable @typescript-eslint/no-explicit-any -- loose Supabase mocks */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scanInfoAccess, scanInfoPayload } from '@/lib/scanInfoAccess';
import { canViewInboxSearch } from '@/lib/inboxShare';

const SCAN_OWNED = '11111111-1111-4111-8111-111111111111';
const SCAN_ANON = '22222222-2222-4222-8222-222222222222';
const SCAN_PUBLIC = '33333333-3333-4333-8333-333333333333';

const state: { sessionUser: any; agencyLink: boolean } = { sessionUser: null, agencyLink: false };
const scans: Record<string, any> = {
  [SCAN_OWNED]: { id: SCAN_OWNED, user_id: 'owner', business_name: 'Acme', score: 40, competitor_name: 'Rival', location: 'Austin' },
  [SCAN_ANON]: { id: SCAN_ANON, user_id: null, business_name: 'Joe', score: 10, competitor_name: 'Big Co', location: 'Austin' },
  [SCAN_PUBLIC]: { id: SCAN_PUBLIC, user_id: 'owner', is_public: true, business_name: 'Pub', score: 70, competitor_name: 'Secret', location: 'Austin' },
};
const inbox: Record<string, any> = {
  s1: { id: 's1', user_id: 'owner', query: 'q', results: { a: 1 }, created_at: 'x' },
  s2: { id: 's2', user_id: 'owner', query: 'q', results: { a: 2 }, created_at: 'x', is_shared: true },
};
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: state.sessionUser } }) } }),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      let id: string | null = null;
      const q: any = {
        select: () => q, limit: () => q,
        eq: (c: string, v: string) => { if (c === 'id') id = v; return q; },
        maybeSingle: async () => {
          if (table === 'rankall_scans') return { data: scans[id as string] ?? null, error: null };
          if (table === 'ai_inbox_searches') return { data: inbox[id as string] ?? null, error: null };
          if (table === 'agency_clients') return { data: state.agencyLink ? { id: 'l' } : null, error: null };
          return { data: null, error: null };
        },
      };
      return q;
    },
  }),
}));

function req(url: string): any { return { url, cookies: { getAll: () => [] }, headers: new Headers() }; }

beforeEach(() => { state.sessionUser = null; state.agencyLink = false; });

describe('scan-info access (pure)', () => {
  it('tiers', () => {
    expect(scanInfoAccess({ ownerOrAdmin: true, agencyLinked: false, publicShare: false })).toBe('full');
    expect(scanInfoAccess({ ownerOrAdmin: false, agencyLinked: true, publicShare: false })).toBe('full');
    expect(scanInfoAccess({ ownerOrAdmin: false, agencyLinked: false, publicShare: true })).toBe('public');
    expect(scanInfoAccess({ ownerOrAdmin: false, agencyLinked: false, publicShare: false })).toBe('none');
    expect(scanInfoPayload({ competitor_name: 'X' }, 'public')).not.toHaveProperty('competitor_name');
  });
});

describe('/api/scan-info', () => {
  async function get(id: string) {
    const { GET } = await import('../scan-info/route');
    return GET(req(`https://rankall.io/api/scan-info?scan_id=${id}`));
  }
  it('stranger: owned private scan → 404', async () => {
    expect((await get(SCAN_OWNED)).status).toBe(404);
    state.sessionUser = { id: 'someone', email: 's@x.com' };
    expect((await get(SCAN_OWNED)).status).toBe(404);
  });
  it('owner gets full fields', async () => {
    state.sessionUser = { id: 'owner', email: 'o@x.com' };
    const res = await get(SCAN_OWNED);
    expect(res.status).toBe(200);
    expect((await res.json()).competitor_name).toBe('Rival');
  });
  it('linked agency gets full fields', async () => {
    state.sessionUser = { id: 'agency', email: 'a@x.com' };
    state.agencyLink = true;
    expect((await (await get(SCAN_OWNED)).json()).competitor_name).toBe('Rival');
  });
  it('ownerless / published scans: free public fields only', async () => {
    const a = await (await get(SCAN_ANON)).json();
    expect(a.business_name).toBe('Joe');
    expect(a).not.toHaveProperty('competitor_name');
    const p = await (await get(SCAN_PUBLIC)).json();
    expect(p.score).toBe(70);
    expect(p).not.toHaveProperty('competitor_name');
  });
});

describe('/api/inbox/[id]', () => {
  async function get(id: string) {
    const { GET } = await import('../inbox/[id]/route');
    return GET(req(`https://rankall.io/api/inbox/${id}`), { params: Promise.resolve({ id }) });
  }
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'srk';
  });
  it('pure rule', () => {
    expect(canViewInboxSearch({ user_id: 'o' }, 'o')).toBe(true);
    expect(canViewInboxSearch({ user_id: 'o' }, 'x')).toBe(false);
    expect(canViewInboxSearch({ user_id: 'o' }, null)).toBe(false);
    expect(canViewInboxSearch({ user_id: 'o', is_shared: true }, null)).toBe(true);
    expect(canViewInboxSearch({ user_id: null }, null)).toBe(false);
  });
  it('unshared search: stranger 404, owner 200', async () => {
    expect((await get('s1')).status).toBe(404);
    state.sessionUser = { id: 'owner', email: 'o@x.com' };
    expect((await get('s1')).status).toBe(200);
  });
  it('shared search is readable via the link', async () => {
    const res = await get('s2');
    expect(res.status).toBe(200);
    expect((await res.json()).row).not.toHaveProperty('user_id');
  });
});
