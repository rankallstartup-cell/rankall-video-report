import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pauseOwnSubscription } from '../billingAuth';

function makeAdmin(updateResults: Array<{ error: unknown } | Error>) {
  const updateUserById = vi.fn(async () => {
    const r = updateResults.shift() ?? { error: null };
    if (r instanceof Error) throw r;
    return r;
  });
  const admin = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1', status: 'active', plan: 'business' }, error: null }),
        }),
      }),
    }),
    auth: { admin: { updateUserById } },
  };
  return { admin, updateUserById };
}

const user = { id: 'u1', app_metadata: {}, user_metadata: {} };

describe('pauseOwnSubscription never leaves Stripe paused while the account resolves as paid (G)', () => {
  const calls: Array<{ url: string; body: string }> = [];
  let stripeOk: boolean[] = [];
  beforeEach(() => {
    calls.length = 0;
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: String(init?.body ?? '') });
      const ok = stripeOk.length ? stripeOk.shift()! : true;
      return new Response(JSON.stringify(ok ? { id: 'sub_1' } : { error: { message: 'x' } }), { status: ok ? 200 : 500 });
    }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.STRIPE_SECRET_KEY;
  });

  it('ok when the metadata write succeeds', async () => {
    stripeOk = [true];
    const { admin } = makeAdmin([{ error: null }]);
    const r = await pauseOwnSubscription(admin as never, user as never, Date.UTC(2026, 9, 16));
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('retries once, then reverts the Stripe pause and returns an error', async () => {
    stripeOk = [true, true];
    const { admin, updateUserById } = makeAdmin([{ error: { message: 'db down' } }, new Error('boom')]);
    const r = await pauseOwnSubscription(admin as never, user as never, Date.UTC(2026, 9, 16));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('pause_failed');
    expect(updateUserById).toHaveBeenCalledTimes(2);
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toContain('subscriptions/sub_1');
    expect(calls[1].body).toBe('pause_collection=');
  });

  it('a successful retry is ok (no revert)', async () => {
    stripeOk = [true];
    const { admin } = makeAdmin([{ error: { message: 'blip' } }, { error: null }]);
    const r = await pauseOwnSubscription(admin as never, user as never, Date.UTC(2026, 9, 16));
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('reports an inconsistent state when the revert also fails', async () => {
    stripeOk = [true, false];
    const { admin } = makeAdmin([{ error: { message: 'x' } }, { error: { message: 'x' } }]);
    const r = await pauseOwnSubscription(admin as never, user as never, Date.UTC(2026, 9, 16));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('pause_inconsistent');
  });
});
