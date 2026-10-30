import { describe, it, expect } from 'vitest';
import {
  verifyStripeSignature,
  computeStripeSignature,
  parseStripeSignatureHeader,
  decideEventClaim,
  isMissingTableError,
  buildSubscriptionUpsert,
  mapStripeStatus,
  WEBHOOK_CLAIM_STALE_MS,
} from '../stripeWebhook';

const SECRET = 'whsec_test_secret';
const PAYLOAD = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });
const NOW = 1_800_000_000;

function header(ts: number, sigs: string[]) {
  return [`t=${ts}`, ...sigs.map((s) => `v1=${s}`)].join(',');
}

describe('verifyStripeSignature', () => {
  const good = computeStripeSignature(PAYLOAD, String(NOW), SECRET);

  it('accepts a valid signature', () => {
    expect(verifyStripeSignature(PAYLOAD, header(NOW, [good]), SECRET, NOW)).toBe(true);
  });

  it('rejects a wrong signature', () => {
    const bad = computeStripeSignature(PAYLOAD, String(NOW), 'whsec_other');
    expect(verifyStripeSignature(PAYLOAD, header(NOW, [bad]), SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(PAYLOAD + ' ', header(NOW, [good]), SECRET, NOW)).toBe(false);
  });

  it('rejects an old timestamp (replay) and a far-future one', () => {
    const oldTs = NOW - 301;
    const oldSig = computeStripeSignature(PAYLOAD, String(oldTs), SECRET);
    expect(verifyStripeSignature(PAYLOAD, header(oldTs, [oldSig]), SECRET, NOW)).toBe(false);
    const futureTs = NOW + 301;
    const futureSig = computeStripeSignature(PAYLOAD, String(futureTs), SECRET);
    expect(verifyStripeSignature(PAYLOAD, header(futureTs, [futureSig]), SECRET, NOW)).toBe(false);
    // Inside the window is fine.
    const recentTs = NOW - 299;
    const recentSig = computeStripeSignature(PAYLOAD, String(recentTs), SECRET);
    expect(verifyStripeSignature(PAYLOAD, header(recentTs, [recentSig]), SECRET, NOW)).toBe(true);
  });

  it('checks every v1 (secret rotation): valid in any position passes', () => {
    const stale = computeStripeSignature(PAYLOAD, String(NOW), 'whsec_rotated_out');
    expect(verifyStripeSignature(PAYLOAD, header(NOW, [good, stale]), SECRET, NOW)).toBe(true);
    expect(verifyStripeSignature(PAYLOAD, header(NOW, [stale, good]), SECRET, NOW)).toBe(true);
    expect(verifyStripeSignature(PAYLOAD, header(NOW, [stale, 'zz', 'abc']), SECRET, NOW)).toBe(false);
  });

  it('rejects missing header / timestamp / secret', () => {
    expect(verifyStripeSignature(PAYLOAD, null, SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(PAYLOAD, `v1=${good}`, SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(PAYLOAD, header(NOW, [good]), '', NOW)).toBe(false);
  });

  it('parses multiple v1 entries', () => {
    expect(parseStripeSignatureHeader('t=1,v1=a,v0=x,v1=b')).toEqual({ timestamp: '1', v1: ['a', 'b'] });
  });
});

describe('webhook idempotency decision', () => {
  const now = Date.parse('2026-10-16T12:00:00Z');
  it('processes a new event', () => {
    expect(decideEventClaim(null, now)).toBe('process');
  });
  it('skips an already-processed event (no repeated emails)', () => {
    expect(decideEventClaim({ processed_at: '2026-10-16T11:00:00Z', received_at: '2026-10-16T11:00:00Z' }, now)).toBe('duplicate');
  });
  it('defers while another delivery is in flight, reprocesses a stale claim', () => {
    expect(decideEventClaim({ processed_at: null, received_at: new Date(now - 10_000).toISOString() }, now)).toBe('in_flight');
    expect(decideEventClaim({ processed_at: null, received_at: new Date(now - WEBHOOK_CLAIM_STALE_MS - 1).toISOString() }, now)).toBe('process');
  });
  it('recognises a missing table', () => {
    expect(isMissingTableError({ code: '42P01' })).toBe(true);
    expect(isMissingTableError({ code: 'PGRST205', message: "Could not find the table 'public.stripe_webhook_events'" })).toBe(true);
    expect(isMissingTableError({ code: '23505' })).toBe(false);
  });
});

describe('event-order upsert (buildSubscriptionUpsert)', () => {
  const nowIso = '2026-10-16T12:00:00.000Z';
  const trialingSub = {
    id: 'sub_1',
    status: 'trialing',
    customer: 'cus_1',
    trial_start: 1_790_000_000,
    trial_end: 1_790_604_800,
    current_period_end: 1_790_604_800,
    metadata: { user_id: 'u1', plan: 'business' },
  };

  it('subscription.created(trialing) arriving FIRST creates the full row', () => {
    const r = buildSubscriptionUpsert({ userId: 'u1', sub: trialingSub, plan: 'business', existing: null, nowIso });
    expect(r.skip).toBe(false);
    if (r.skip) return;
    expect(r.row).toMatchObject({
      user_id: 'u1',
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
      plan: 'business',
      status: 'trialing',
      trial_end: new Date(1_790_604_800 * 1000).toISOString(),
      current_period_end: new Date(1_790_604_800 * 1000).toISOString(),
      created_at: new Date(1_790_000_000 * 1000).toISOString(),
    });
  });

  it('checkout.session.completed arriving SECOND keeps trialing (status comes from Stripe, not hardcoded active)', () => {
    const existing = { status: 'trialing', stripe_subscription_id: 'sub_1', created_at: '2026-10-01T00:00:00Z' };
    const r = buildSubscriptionUpsert({ userId: 'u1', sub: trialingSub, plan: 'business', existing, nowIso });
    expect(r.skip).toBe(false);
    if (r.skip) return;
    expect(r.row.status).toBe('trialing');
    // created_at is not moved for the same subscription.
    expect('created_at' in r.row).toBe(false);
  });

  it('period end falls back to the item when the top-level field is absent', () => {
    const sub = { ...trialingSub, current_period_end: null, items: { data: [{ current_period_end: 1_791_000_000 }] } };
    const r = buildSubscriptionUpsert({ userId: 'u1', sub, plan: 'business', existing: null, nowIso });
    if (r.skip) throw new Error('unexpected skip');
    expect(r.row.current_period_end).toBe(new Date(1_791_000_000 * 1000).toISOString());
  });

  it('an event for a superseded subscription does not clobber the live row', () => {
    const existing = { status: 'active', stripe_subscription_id: 'sub_new' };
    const r = buildSubscriptionUpsert({ userId: 'u1', sub: { ...trialingSub, id: 'sub_old', status: 'canceled' }, plan: 'business', existing, nowIso });
    expect(r.skip).toBe(true);
  });

  it('maps Stripe statuses to stored statuses', () => {
    expect(mapStripeStatus('canceled')).toBe('cancelled');
    expect(mapStripeStatus('incomplete_expired')).toBe('expired');
    expect(mapStripeStatus('trialing')).toBe('trialing');
  });
});
