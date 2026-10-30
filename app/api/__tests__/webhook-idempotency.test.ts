/* eslint-disable @typescript-eslint/no-explicit-any -- loose Supabase/Stripe mocks */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeStripeSignature } from '@/lib/stripeWebhook';

// Route-level: a redelivered, already-processed event is skipped without
// touching Stripe, Supabase state, or sending email.
const calls: string[] = [];
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: async () => ({ error: null }),
    from: (table: string) => {
      const q: any = {
        insert: async () => { calls.push(`insert:${table}`); return { error: { code: '23505', message: 'duplicate key' } }; },
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: { processed_at: '2026-10-16T00:00:00Z', received_at: '2026-10-16T00:00:00Z' }, error: null }),
        upsert: async () => { calls.push(`upsert:${table}`); return { error: null }; },
        update: () => { calls.push(`update:${table}`); return q; },
      };
      return q;
    },
    auth: { admin: { updateUserById: async () => { calls.push('updateUser'); return { error: null }; } } },
  }),
}));

const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));

beforeEach(() => {
  calls.length = 0;
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  process.env.STRIPE_SECRET_KEY = 'sk_test';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
});

describe('billing webhook idempotency', () => {
  it('skips an already-processed event id', async () => {
    const payload = JSON.stringify({ id: 'evt_dup', type: 'checkout.session.completed', data: { object: { metadata: { user_id: 'u1' }, subscription: 'sub_1' } } });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = computeStripeSignature(payload, ts, 'whsec_x');
    const { POST } = await import('../billing/webhook/route');
    const res = await POST(new Request('http://x/api/billing/webhook', {
      method: 'POST',
      body: payload,
      headers: { 'stripe-signature': `t=${ts},v1=${sig}` },
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(calls.filter((c) => c !== 'insert:stripe_webhook_events')).toEqual([]);
  });

  it('rejects a bad signature with 400', async () => {
    const { POST } = await import('../billing/webhook/route');
    const res = await POST(new Request('http://x', { method: 'POST', body: '{}', headers: { 'stripe-signature': 't=1,v1=00' } }));
    expect(res.status).toBe(400);
  });
});
