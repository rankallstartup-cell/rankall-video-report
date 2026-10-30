// lib/stripeWebhook.ts — pure / testable pieces of the Stripe billing webhook
// (app/api/billing/webhook/route.ts). Route files may only export route
// handlers, so the logic that needs unit tests lives here.

import { createHmac, timingSafeEqual } from 'crypto';

// ── Signature verification ────────────────────────────────────────────────
// Stripe-Signature: t=<unix>,v1=<hex>[,v1=<hex>...][,v0=...]
// - Every v1 signature is checked (Stripe sends several during secret
//   rotation; the old code kept only the LAST v1 in the header).
// - Constant-time comparison (crypto.timingSafeEqual) — the old `===` on
//   hex strings leaks timing.
// - Replay protection: timestamps older (or further in the future) than
//   SIGNATURE_TOLERANCE_SECONDS are rejected, so a captured payload cannot
//   be replayed later.
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export function parseStripeSignatureHeader(header: string | null | undefined): { timestamp: string | null; v1: string[] } {
  const out = { timestamp: null as string | null, v1: [] as string[] };
  if (!header) return out;
  for (const part of header.split(',')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!v) continue;
    if (k === 't') out.timestamp = v;
    else if (k === 'v1') out.v1.push(v);
  }
  return out;
}

export function computeStripeSignature(payload: string, timestamp: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${payload}`, 'utf8').digest('hex');
}

export function verifyStripeSignature(
  payload: string,
  sigHeader: string | null | undefined,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  toleranceSeconds: number = SIGNATURE_TOLERANCE_SECONDS,
): boolean {
  if (!secret) return false;
  const { timestamp, v1 } = parseStripeSignatureHeader(sigHeader);
  if (!timestamp || v1.length === 0) return false;
  if (!/^\d+$/.test(timestamp)) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > toleranceSeconds) return false;

  const expected = Buffer.from(computeStripeSignature(payload, timestamp, secret), 'hex');
  let match = false;
  for (const sig of v1) {
    if (!/^[0-9a-f]+$/i.test(sig)) continue;
    const given = Buffer.from(sig, 'hex');
    if (given.length !== expected.length) continue;
    // No early return: compare every candidate in constant time.
    if (timingSafeEqual(given, expected)) match = true;
  }
  return match;
}

// ── Idempotency (stripe_webhook_events) ───────────────────────────────────
// A claim row is inserted when an event starts processing and stamped
// processed_at when it finishes. A redelivery of a processed event is
// skipped (no repeated emails / Slack / referral conversions). A claim that
// is still unprocessed and recent means another delivery is in flight → ask
// Stripe to retry later. A stale unprocessed claim (crashed attempt) is
// reprocessed.
export const WEBHOOK_CLAIM_STALE_MS = 2 * 60 * 1000;

export type EventClaimDecision = 'process' | 'duplicate' | 'in_flight';

export function decideEventClaim(
  existing: { processed_at?: string | null; received_at?: string | null } | null,
  nowMs: number = Date.now(),
): EventClaimDecision {
  if (!existing) return 'process';
  if (existing.processed_at) return 'duplicate';
  const received = existing.received_at ? new Date(existing.received_at).getTime() : 0;
  if (received && nowMs - received < WEBHOOK_CLAIM_STALE_MS) return 'in_flight';
  return 'process';
}

// PostgREST / Postgres "relation does not exist" — the migration has not
// been applied yet. Idempotency then degrades to "process every delivery".
export function isMissingTableError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST204') return true;
  return /does not exist|could not find the table|schema cache/i.test(e.message ?? '');
}

// ── Event ordering → subscriptions row ────────────────────────────────────
// Stripe does not guarantee event order: customer.subscription.created
// (trialing) can land before checkout.session.completed, and a delayed
// .created can land after .updated(active). The webhook therefore always
// builds the row from the CURRENT Stripe subscription object (re-fetched),
// and upserts by user_id — whichever event arrives first creates the row,
// later ones converge on Stripe's truth. checkout.session.completed can no
// longer stamp 'active' over 'trialing'.

// Stripe status → our stored status (codebase spelling 'cancelled').
export function mapStripeStatus(status: string | null | undefined): string {
  switch (status) {
    case 'canceled':
      return 'cancelled';
    case 'incomplete_expired':
      return 'expired';
    case 'trialing':
    case 'active':
    case 'past_due':
    case 'unpaid':
    case 'incomplete':
    case 'paused':
      return status;
    default:
      return status || 'incomplete';
  }
}

const LIVE_STATUSES = new Set(['trialing', 'active', 'past_due', 'unpaid']);

export interface StripeSubscriptionLike {
  id: string;
  status?: string | null;
  customer?: string | { id?: string } | null;
  trial_start?: number | null;
  trial_end?: number | null;
  current_period_end?: number | null;
  items?: { data?: Array<{ current_period_end?: number | null }> } | null;
  metadata?: Record<string, string> | null;
}

export interface ExistingSubscriptionRow {
  status?: string | null;
  stripe_subscription_id?: string | null;
  created_at?: string | null;
}

export type SubscriptionUpsert =
  | { skip: true; reason: string }
  | { skip: false; row: Record<string, unknown> };

const isoFromUnix = (v: number | null | undefined): string | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? new Date(v * 1000).toISOString() : null;

export function buildSubscriptionUpsert(input: {
  userId: string;
  sub: StripeSubscriptionLike;
  plan: string;
  existing: ExistingSubscriptionRow | null;
  nowIso?: string;
}): SubscriptionUpsert {
  const { userId, sub, plan, existing } = input;
  const nowIso = input.nowIso ?? new Date().toISOString();
  const status = mapStripeStatus(sub.status);

  // An event about an OLD subscription (e.g. the deleted/updated event of a
  // previous sub arriving after the user started a new one) must not
  // overwrite the row of the live subscription.
  if (
    existing?.stripe_subscription_id &&
    existing.stripe_subscription_id !== sub.id &&
    LIVE_STATUSES.has(existing.status ?? '') &&
    !LIVE_STATUSES.has(status)
  ) {
    return { skip: true, reason: 'event for a superseded subscription' };
  }

  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null;
  const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null;
  const row: Record<string, unknown> = {
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    plan,
    status,
    trial_end: isoFromUnix(sub.trial_end),
    current_period_end: isoFromUnix(periodEnd),
    updated_at: nowIso,
  };
  // created_at marks when this subscription (and its trial) started — the
  // scan route's trial-period scan set reads it. Set it when the row is new
  // or now belongs to a different subscription; never move it otherwise.
  if (!existing || existing.stripe_subscription_id !== sub.id) {
    row.created_at = isoFromUnix(sub.trial_start) ?? nowIso;
  }
  return { skip: false, row };
}

// Payment method id on a subscription (string id or expanded object).
export function defaultPaymentMethodId(
  obj: { default_payment_method?: string | { id?: string } | null } | null | undefined,
): string | null {
  const pm = obj?.default_payment_method;
  if (typeof pm === 'string' && pm) return pm;
  if (pm && typeof pm === 'object' && typeof pm.id === 'string') return pm.id;
  return null;
}
