/* eslint-disable @typescript-eslint/no-explicit-any -- loose Supabase/Stripe mocks */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// One refund per payer: a charge with no card fingerprint (Link / some
// wallets) used to skip the per-card check. Now: billing email key, or no
// self-serve refund at all.
const db: { inserts: any[]; orFilter: string | null } = { inserts: [], orFilter: null };
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'me@example.com' } } }) } }),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: async () => ({ data: 1, error: null }),
    from: (table: string) => {
      const q: any = {
        select: () => q,
        eq: () => q,
        or: (f: string) => { db.orFilter = f; return q; },
        maybeSingle: async () => ({ data: table === 'subscriptions' ? { stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1' } : null, error: null }),
        then: (res: any) => res({ data: [], error: null }),
        insert: async (row: any) => { db.inserts.push(row); return { error: null }; },
        delete: () => q,
      };
      return q;
    },
  }),
}));

let charge: any = null;
const fetchMock = vi.fn(async (url: string) => {
  const u = String(url);
  if (u.includes('/v1/charges?')) return new Response(JSON.stringify({ data: [charge], has_more: false }), { status: 200 });
  if (u.endsWith('/v1/refunds')) return new Response(JSON.stringify({ id: 're_1', status: 'succeeded' }), { status: 200 });
  return new Response('{}', { status: 200 });
});

function req(): any { return { json: async () => ({}), cookies: { getAll: () => [] }, headers: new Headers() }; }

beforeEach(() => {
  db.inserts = []; db.orFilter = null;
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  process.env.STRIPE_SECRET_KEY = 'sk_test';
  const created = Math.floor(Date.now() / 1000) - 3600;
  charge = { id: 'ch_1', created, status: 'succeeded', paid: true, amount: 3900, currency: 'usd', payment_method_details: { type: 'link', link: {} } };
});

describe('refund identity fallback', () => {
  it('no fingerprint and no billing email → routed to support, nothing refunded', async () => {
    const { POST } = await import('../billing/refund/route');
    const res = await POST(req());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('refund_needs_support');
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/v1/refunds'))).toBe(false);
    expect(db.inserts).toEqual([]);
  });
  it('Link charge with a billing email is keyed on the email hash', async () => {
    charge.billing_details = { email: 'Payer@Example.com' };
    const { POST } = await import('../billing/refund/route');
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(db.inserts[0].card_fingerprint).toMatch(/^email:[0-9a-f]{64}$/);
    expect(db.orFilter).toContain(db.inserts[0].card_fingerprint);
  });
});
