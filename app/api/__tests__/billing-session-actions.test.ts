/* eslint-disable @typescript-eslint/no-explicit-any -- loose Supabase/Stripe mocks */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Session-derived billing actions: cancel / cancel-flow / pause must act on
// the SESSION user's own subscription and ignore body ids.

const state: {
  sessionUser: any;
  subRows: Record<string, any>;
  updateUserCalls: any[];
} = { sessionUser: null, subRows: {}, updateUserCalls: [] };

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.sessionUser } }) },
  }),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      let filterUser: string | null = null;
      const q: any = {
        select: () => q,
        eq: (_col: string, v: string) => { filterUser = v; return q; },
        maybeSingle: async () => ({ data: table === 'subscriptions' ? state.subRows[filterUser as string] ?? null : null, error: null }),
        insert: async () => ({ error: null }),
      };
      return q;
    },
    auth: {
      admin: {
        updateUserById: async (id: string, attrs: any) => { state.updateUserCalls.push({ id, attrs }); return { error: null }; },
      },
    },
  }),
}));

function req(body: unknown): any {
  return {
    json: async () => body,
    cookies: { getAll: () => [] },
    headers: new Headers(),
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  state.sessionUser = { id: 'me', email: 'me@example.com', app_metadata: {}, user_metadata: {} };
  state.subRows = {
    me: { stripe_customer_id: 'cus_me', stripe_subscription_id: 'sub_me', status: 'active', plan: 'business' },
    victim: { stripe_customer_id: 'cus_victim', stripe_subscription_id: 'sub_victim', status: 'active', plan: 'business' },
  };
  state.updateUserCalls = [];
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  delete process.env.RESEND_API_KEY;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ id: 'sub_me', cancel_at: 1_900_000_000 }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cancel-subscription is session-derived', () => {
  it('401 without a session, never calling Stripe', async () => {
    state.sessionUser = null;
    const { POST } = await import('../cancel-subscription/route');
    const res = await POST(req({ userId: 'victim', reason: 'x' }));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores a body userId and cancels only the caller at period end', async () => {
    const { POST } = await import('../cancel-subscription/route');
    const res = await POST(req({ userId: 'victim', subscription_id: 'sub_victim', reason: 'too_expensive' }));
    expect(res.status).toBe(200);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('sub_victim'))).toBe(false);
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('subscriptions/sub_me'));
    expect(call).toBeTruthy();
    expect(call![1].method).toBe('POST');
    expect(String(call![1].body)).toContain('cancel_at_period_end=true');
  });

  it('reports failure honestly when Stripe refuses', async () => {
    fetchMock.mockImplementation(async () => new Response('{}', { status: 400 }));
    const { POST } = await import('../cancel-subscription/route');
    const res = await POST(req({ reason: 'x' }));
    expect(res.status).toBe(502);
  });
});

describe('cancel-flow accept_offer', () => {
  it('pause acts on the caller only, with a 30-day resumes_at', async () => {
    const { POST } = await import('../cancel-flow/route');
    const before = Math.floor(Date.now() / 1000);
    const res = await POST(req({ step: 'accept_offer', offer: 'pause', user_id: 'victim', subscription_id: 'sub_victim' }));
    expect(res.status).toBe(200);
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('subscriptions/sub_me'));
    expect(call).toBeTruthy();
    const params = new URLSearchParams(String(call![1].body));
    const resumes = Number(params.get('pause_collection[resumes_at]'));
    expect(resumes).toBeGreaterThanOrEqual(before + 30 * 86400 - 5);
    expect(resumes).toBeLessThanOrEqual(before + 30 * 86400 + 5);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('sub_victim'))).toBe(false);
  });

  it('refuses to pause (void) a trialing subscription — no free trial-end invoice', async () => {
    state.subRows.me.status = 'trialing';
    const { POST } = await import('../cancel-flow/route');
    const res = await POST(req({ step: 'accept_offer', offer: 'pause' }));
    expect(res.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('discount applies a coupon to the caller sub and never touches invoices', async () => {
    process.env.STRIPE_RETENTION_COUPON_ID = 'coupon_50';
    const { POST } = await import('../cancel-flow/route');
    const res = await POST(req({ step: 'accept_offer', offer: 'discount', subscription_id: 'sub_victim' }));
    expect(res.status).toBe(200);
    const call = fetchMock.mock.calls[0];
    expect(String(call[0])).toContain('subscriptions/sub_me');
    expect(String(call[1].body)).toContain('coupon_50');
    expect(String(call[1].body)).not.toContain('void');
    expect(state.updateUserCalls[0].attrs.app_metadata.discount_offer_used).toBe(true);
    delete process.env.STRIPE_RETENTION_COUPON_ID;
  });
});

describe('unpause clears Stripe pause_collection', () => {
  it('posts pause_collection= to the caller subscription and clears trusted flags', async () => {
    const { POST } = await import('../user/unpause-subscription/route');
    const res = await POST(req({}));
    expect(res.status).toBe(200);
    // Fix round 2: unpause first lists voided invoices (pause loophole);
    // with none voided it is a plain pause_collection clear.
    expect(String(fetchMock.mock.calls[0][0])).toContain('invoices?subscription=sub_me&status=void');
    const call = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('subscriptions/sub_me'))!;
    expect(String(call[0])).toContain('subscriptions/sub_me');
    expect(String(call[1].body)).toBe('pause_collection=');
    expect(state.updateUserCalls[0].attrs.app_metadata.account_paused).toBe(false);
  });
});

describe('ids never come from user_metadata', () => {
  it('a user_metadata stripe_subscription_id is ignored', async () => {
    state.subRows = {};
    state.sessionUser.user_metadata = { stripe_subscription_id: 'sub_victim' };
    const { POST } = await import('../cancel-subscription/route');
    const res = await POST(req({ reason: 'x' }));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
