/* eslint-disable @typescript-eslint/no-explicit-any -- loose Supabase/Stripe mocks */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isAccountPaused, resolvePlanFromSources } from '@/lib/planConfig';
import { pauseCooldownRemainingDays, PAUSE_COOLDOWN_DAYS } from '@/lib/billingAuth';

const DAY = 24 * 60 * 60 * 1000;

describe('paused accounts resolve to free', () => {
  const future = new Date(Date.now() + 5 * DAY).toISOString();
  const past = new Date(Date.now() - DAY).toISOString();
  it('isAccountPaused needs the flag AND a future pause_until', () => {
    expect(isAccountPaused({ account_paused: true, pause_until: future })).toBe(true);
    expect(isAccountPaused({ account_paused: true, pause_until: past })).toBe(false);
    expect(isAccountPaused({ account_paused: false, pause_until: future })).toBe(false);
    expect(isAccountPaused({ account_paused: true })).toBe(false);
    expect(isAccountPaused(undefined)).toBe(false);
  });
  it('an active paid subscription resolves to free while paused, paid after', () => {
    const sub = { plan: 'business', status: 'active' };
    expect(resolvePlanFromSources(sub, { account_paused: true, pause_until: future })).toBe('free');
    expect(resolvePlanFromSources(sub, { account_paused: true, pause_until: past })).toBe('business');
    expect(resolvePlanFromSources(sub, {})).toBe('business');
  });
});

describe('one pause per 6 months', () => {
  it('cooldown counts from last_paused_at', () => {
    const now = Date.UTC(2026, 9, 16);
    expect(pauseCooldownRemainingDays({}, now)).toBe(0);
    expect(pauseCooldownRemainingDays({ last_paused_at: new Date(now - 10 * DAY).toISOString() }, now)).toBe(PAUSE_COOLDOWN_DAYS - 10);
    expect(pauseCooldownRemainingDays({ last_paused_at: new Date(now - 200 * DAY).toISOString() }, now)).toBe(0);
  });
});

// ── route-level: pause + unpause against mocked Stripe ────────────────────
const state: { sessionUser: any; updates: any[] } = { sessionUser: null, updates: [] };
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: state.sessionUser } }) } }),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const q: any = {
        select: () => q, eq: () => q,
        maybeSingle: async () => ({ data: { stripe_customer_id: 'cus_me', stripe_subscription_id: 'sub_me', status: 'active', plan: 'business' }, error: null }),
      };
      return q;
    },
    auth: { admin: { updateUserById: async (id: string, attrs: any) => { state.updates.push({ id, attrs }); return { error: null }; } } },
  }),
}));
vi.mock('@/lib/emailTemplates', () => ({ sendEmail: vi.fn(async () => ({})) }));

function req(): any {
  return { json: async () => ({}), cookies: { getAll: () => [] }, headers: new Headers() };
}
const fetchMock = vi.fn();
beforeEach(() => {
  state.updates = [];
  state.sessionUser = { id: 'me', email: 'me@example.com', app_metadata: {}, user_metadata: {} };
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('pause route', () => {
  it('refuses a second pause inside 6 months, without calling Stripe', async () => {
    state.sessionUser.app_metadata = { last_paused_at: new Date(Date.now() - 40 * DAY).toISOString() };
    const { POST } = await import('../user/pause-subscription/route');
    const res = await POST(req());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('pause_limit_reached');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('first pause stamps last_paused_at on app_metadata only', async () => {
    fetchMock.mockImplementation(async () => new Response('{}', { status: 200 }));
    const { POST } = await import('../user/pause-subscription/route');
    const res = await POST(req());
    expect(res.status).toBe(200);
    const attrs = state.updates[0].attrs;
    expect(attrs.app_metadata.last_paused_at).toBeTruthy();
    expect(attrs.user_metadata.last_paused_at).toBeUndefined();
  });
  it('escapes the user-controlled full_name in the confirmation email', async () => {
    fetchMock.mockImplementation(async () => new Response('{}', { status: 200 }));
    state.sessionUser.user_metadata = { full_name: '<img src=x onerror=alert(1)>' };
    const { sendEmail } = await import('@/lib/emailTemplates');
    const { POST } = await import('../user/pause-subscription/route');
    await POST(req());
    const html = (sendEmail as any).mock.calls.at(-1)[0].html as string;
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });
});

describe('unpause after a voided renewal starts a charged period', () => {
  const pausedAm = { account_paused: true, paused_at: new Date(Date.now() - 3 * DAY).toISOString(), pause_until: new Date(Date.now() + 27 * DAY).toISOString() };
  function stripe(voidedCount: number, updateStatus = 200) {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/invoices?')) return new Response(JSON.stringify({ data: Array.from({ length: voidedCount }, (_, i) => ({ id: `in_${i}` })) }), { status: 200 });
      return new Response(JSON.stringify(updateStatus === 200 ? { id: 'sub_me' } : { error: { type: 'card_error' } }), { status: updateStatus });
    });
  }
  function subUpdateBody(): URLSearchParams {
    const call = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/subscriptions/sub_me'));
    return new URLSearchParams(call![1].body);
  }
  it('voided invoice → billing_cycle_anchor=now, no proration, error_if_incomplete', async () => {
    state.sessionUser.app_metadata = pausedAm;
    stripe(1);
    const { POST } = await import('../user/unpause-subscription/route');
    const res = await POST(req());
    expect(res.status).toBe(200);
    const b = subUpdateBody();
    expect(b.get('billing_cycle_anchor')).toBe('now');
    expect(b.get('proration_behavior')).toBe('none');
    expect(b.get('payment_behavior')).toBe('error_if_incomplete');
  });
  it('no voided invoice → plain resume', async () => {
    state.sessionUser.app_metadata = pausedAm;
    stripe(0);
    const { POST } = await import('../user/unpause-subscription/route');
    await POST(req());
    expect(subUpdateBody().get('billing_cycle_anchor')).toBeNull();
  });
  it('declined card → stays paused (402, flags not cleared)', async () => {
    state.sessionUser.app_metadata = pausedAm;
    stripe(1, 402);
    const { POST } = await import('../user/unpause-subscription/route');
    const res = await POST(req());
    expect(res.status).toBe(402);
    expect(state.updates).toHaveLength(0);
  });
  it('invoice lookup failure → fails closed (still paused)', async () => {
    state.sessionUser.app_metadata = pausedAm;
    fetchMock.mockImplementation(async () => new Response('{}', { status: 500 }));
    const { POST } = await import('../user/unpause-subscription/route');
    const res = await POST(req());
    expect(res.status).toBe(502);
    expect(state.updates).toHaveLength(0);
  });
});
