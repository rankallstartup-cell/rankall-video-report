/* eslint-disable @typescript-eslint/no-explicit-any -- loose Supabase/Stripe mocks */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeStripeSignature } from '@/lib/stripeWebhook';
import { openCheckoutAction, parseOpenCheckout, pickDuplicateToCancel } from '@/lib/checkoutGuard';
import { chargeIdentityKey, emailIdentityKey, paymentMethodIdentityKey } from '@/lib/paymentIdentity';

describe('checkoutGuard (pure)', () => {
  const now = 1_800_000_000;
  const stored = { id: 'cs_1', plan: 'business', interval: 'monthly', expires_at: now + 1800 };
  it('reuses the open session for the same plan+interval, expires one for another plan', () => {
    expect(openCheckoutAction(stored, 'business', 'monthly', now)).toBe('reuse');
    expect(openCheckoutAction(stored, 'agency', 'monthly', now)).toBe('expire');
    expect(openCheckoutAction(stored, 'business', 'annual', now)).toBe('expire');
    expect(openCheckoutAction({ ...stored, expires_at: now + 30 }, 'business', 'monthly', now)).toBe('create');
    expect(openCheckoutAction(null, 'business', 'monthly', now)).toBe('create');
  });
  it('parseOpenCheckout rejects junk', () => {
    expect(parseOpenCheckout({ id: 'x', plan: 'b', interval: 'm', expires_at: 1 })).toBeNull();
    expect(parseOpenCheckout('cs_1')).toBeNull();
    expect(parseOpenCheckout(stored)?.id).toBe('cs_1');
  });
  it('pickDuplicateToCancel cancels the newer live subscription only', () => {
    expect(pickDuplicateToCancel({ id: 'a', created: 100, status: 'active' }, { id: 'b', created: 200, status: 'active' })).toBe('b');
    expect(pickDuplicateToCancel({ id: 'a', created: 300, status: 'trialing' }, { id: 'b', created: 200, status: 'active' })).toBe('a');
    expect(pickDuplicateToCancel({ id: 'a', created: 100, status: 'canceled' }, { id: 'b', created: 200, status: 'active' })).toBeNull();
    expect(pickDuplicateToCancel({ id: 'a', created: 100, status: 'active' }, { id: 'a', created: 100, status: 'active' })).toBeNull();
    expect(pickDuplicateToCancel(null, { id: 'b', created: 1, status: 'active' })).toBeNull();
  });
});

describe('paymentIdentity', () => {
  it('card fingerprint first, then Link email, then billing email; never the customer email', () => {
    expect(paymentMethodIdentityKey({ card: { fingerprint: 'fp_1' }, billing_details: { email: 'a@b.com' } })).toBe('fp_1');
    expect(paymentMethodIdentityKey({ link: { email: 'Me@X.com' } })).toBe(emailIdentityKey('me@x.com'));
    expect(paymentMethodIdentityKey({ billing_details: { email: 'me@x.com' } })).toMatch(/^email:[0-9a-f]{64}$/);
    expect(paymentMethodIdentityKey({})).toBeNull();
    expect(paymentMethodIdentityKey(null)).toBeNull();
  });
  it('charge key: fingerprint → billing email → null (support)', () => {
    expect(chargeIdentityKey({ payment_method_details: { card: { fingerprint: 'fp' } } })).toBe('fp');
    expect(chargeIdentityKey({ billing_details: { email: 'a@b.co' } })).toBe(emailIdentityKey('a@b.co'));
    expect(chargeIdentityKey({ payment_method_details: {} })).toBeNull();
  });
});

// ── Route-level: billing webhook duplicate + no-identity trial ────────────
const db: { row: any; upserts: Array<{ table: string; row: any }>; fingerprints: any[] } = { row: null, upserts: [], fingerprints: [] };
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: async () => ({ error: null }),
    from: (table: string) => {
      const q: any = {
        insert: async () => ({ error: null }),
        select: () => q,
        eq: () => q,
        in: () => q,
        or: () => q,
        maybeSingle: async () => ({ data: table === 'subscriptions' ? db.row : null, error: null }),
        then: (res: any) => res({ data: table === 'trial_fingerprints' ? db.fingerprints : [], error: null }),
        upsert: async (row: any) => { db.upserts.push({ table, row }); return { error: null }; },
        update: () => q,
      };
      return q;
    },
    auth: { admin: {
      updateUserById: async () => ({ error: null }),
      getUserById: async () => ({ data: { user: { email: 'me@example.com', app_metadata: {} } }, error: null }),
    } },
  }),
}));

type Stub = (url: string, init?: any) => any;
let stripeStub: Stub = () => ({});
const fetchMock = vi.fn(async (url: string, init?: any) => {
  const u = String(url);
  if (!u.startsWith('https://api.stripe.com/')) return new Response('{}', { status: 200 });
  return new Response(JSON.stringify(stripeStub(u, init)), { status: 200 });
});

function signed(event: unknown) {
  const payload = JSON.stringify(event);
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = computeStripeSignature(payload, ts, 'whsec_x');
  return new Request('http://x/api/billing/webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': `t=${ts},v1=${sig}` } });
}
const stripeCalls = () => fetchMock.mock.calls.map((c) => `${(c[1] as any)?.method ?? 'GET'} ${String(c[0]).replace('https://api.stripe.com/v1/', '')}`).filter((s) => !s.includes('resend') && !s.startsWith('POST https'));

beforeEach(() => {
  db.row = null; db.upserts = []; db.fingerprints = [];
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  process.env.STRIPE_SECRET_KEY = 'sk_test';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
});

describe('billing webhook — concurrent checkout duplicate', () => {
  it('cancels + refunds the newer subscription and never writes it as the live row', async () => {
    db.row = { status: 'active', stripe_subscription_id: 'sub_old', plan: 'business' };
    stripeStub = (u) => {
      if (u.endsWith('subscriptions/sub_new')) return { id: 'sub_new', created: 200, status: 'active', customer: 'cus_1', latest_invoice: 'in_new', metadata: { user_id: 'u1', plan: 'business' } };
      if (u.endsWith('subscriptions/sub_old')) return { id: 'sub_old', created: 100, status: 'active', customer: 'cus_1' };
      if (u.endsWith('invoices/in_new')) return { id: 'in_new', amount_paid: 3900, payment_intent: 'pi_new' };
      if (u.endsWith('/refunds')) return { id: 're_1' };
      return {};
    };
    const { POST } = await import('../billing/webhook/route');
    const res = await POST(signed({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { metadata: { user_id: 'u1', plan: 'business' }, subscription: 'sub_new', customer_email: 'me@example.com' } } }));
    expect(res.status).toBe(200);
    const calls = stripeCalls();
    expect(calls).toContain('DELETE subscriptions/sub_new');
    const refund = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/v1/refunds'));
    expect(new URLSearchParams((refund![1] as any).body).get('payment_intent')).toBe('pi_new');
    expect(db.upserts.filter((u) => u.table === 'subscriptions')).toEqual([]);
  });

  it('a first subscription is applied normally (no cancel)', async () => {
    db.row = null;
    stripeStub = (u) => {
      if (u.includes('subscriptions/sub_a')) return { id: 'sub_a', created: 200, status: 'active', customer: 'cus_1', metadata: { user_id: 'u1', plan: 'business' } };
      return {};
    };
    const { POST } = await import('../billing/webhook/route');
    const res = await POST(signed({ id: 'evt_2', type: 'checkout.session.completed', data: { object: { metadata: { user_id: 'u1' }, subscription: 'sub_a' } } }));
    expect(res.status).toBe(200);
    expect(stripeCalls().some((c) => c.startsWith('DELETE'))).toBe(false);
    expect(db.upserts.find((u) => u.table === 'subscriptions')?.row.stripe_subscription_id).toBe('sub_a');
  });
});

describe('billing webhook — trial without a payer identity', () => {
  it('Link payment with no email anywhere → trial ended now', async () => {
    stripeStub = (u, init) => {
      if (u.endsWith('subscriptions/sub_t') && (init?.method ?? 'GET') === 'GET') return { id: 'sub_t', created: 1, status: 'trialing', customer: 'cus_1', default_payment_method: 'pm_link', metadata: { user_id: 'u1' } };
      if (u.endsWith('payment_methods/pm_link')) return { id: 'pm_link', type: 'link', link: {} };
      return { id: 'sub_t', status: 'active' };
    };
    const { POST } = await import('../billing/webhook/route');
    await POST(signed({ id: 'evt_3', type: 'checkout.session.completed', data: { object: { metadata: { user_id: 'u1' }, subscription: 'sub_t' } } }));
    const end = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('subscriptions/sub_t') && (c[1] as any)?.method === 'POST');
    expect(new URLSearchParams((end![1] as any).body).get('trial_end')).toBe('now');
  });

  it('Link payment WITH a Link email is keyed on it (trial kept when first use)', async () => {
    stripeStub = (u, init) => {
      if (u.endsWith('subscriptions/sub_t2') && (init?.method ?? 'GET') === 'GET') return { id: 'sub_t2', created: 1, status: 'trialing', customer: 'cus_1', default_payment_method: 'pm_l2', metadata: { user_id: 'u1' } };
      if (u.endsWith('payment_methods/pm_l2')) return { id: 'pm_l2', type: 'link', link: { email: 'payer@example.com' } };
      return {};
    };
    db.fingerprints = [{ id: 1, stripe_subscription_id: 'sub_t2', created_at: '2026-10-16T00:00:00Z' }];
    const { POST } = await import('../billing/webhook/route');
    await POST(signed({ id: 'evt_4', type: 'checkout.session.completed', data: { object: { metadata: { user_id: 'u1' }, subscription: 'sub_t2' } } }));
    const fpUpsert = db.upserts.find((u) => u.table === 'trial_fingerprints');
    expect(fpUpsert?.row.fingerprint).toBe(emailIdentityKey('payer@example.com'));
    const end = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('subscriptions/sub_t2') && (c[1] as any)?.method === 'POST');
    expect(end).toBeUndefined();
  });
});
