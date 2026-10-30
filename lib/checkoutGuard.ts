// lib/checkoutGuard.ts — pure helpers against duplicate subscriptions.
//
// Two checkout sessions completed at once (two tabs, double click, a retried
// request) each created a billed subscription. Two layers:
//   1. create-checkout reuses the user's still-open session for the same
//      plan + interval (stored on app_metadata.open_checkout) and expires a
//      stale one for a different plan, so at most one session is payable.
//   2. the billing webhook, if a user already has a LIVE subscription and a
//      second one arrives, cancels the NEWER one immediately and refunds
//      anything it charged (pickDuplicateToCancel).

export interface OpenCheckout {
  id: string;
  plan: string;
  interval: string;
  expires_at: number; // unix seconds
  trial?: boolean;
}

export const CHECKOUT_SESSION_TTL_SECONDS = 60 * 60; // Stripe minimum is 30 min

export function parseOpenCheckout(v: unknown): OpenCheckout | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id.startsWith('cs_')) return null;
  if (typeof o.plan !== 'string' || typeof o.interval !== 'string') return null;
  if (typeof o.expires_at !== 'number') return null;
  return { id: o.id, plan: o.plan, interval: o.interval, expires_at: o.expires_at, trial: o.trial === true };
}

/** 'reuse' the stored session, 'expire' it (different plan) then create, or
 *  'create' (none / expired). A minute of slack avoids handing out a session
 *  that expires while the user is on the Stripe page. */
export function openCheckoutAction(
  stored: OpenCheckout | null,
  plan: string,
  interval: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): 'reuse' | 'expire' | 'create' {
  if (!stored || stored.expires_at <= nowSeconds + 60) return 'create';
  if (stored.plan === plan && stored.interval === interval) return 'reuse';
  return 'expire';
}

const LIVE = new Set(['trialing', 'active', 'past_due', 'unpaid', 'incomplete']);

export interface SubFacts { id: string; created: number; status: string | null | undefined }

/** Which subscription to cancel when a user would end up with two live
 *  ones: the newer (larger `created`; id as tiebreak). null = no conflict. */
export function pickDuplicateToCancel(existing: SubFacts | null, incoming: SubFacts): string | null {
  if (!existing || existing.id === incoming.id) return null;
  if (!LIVE.has(existing.status ?? '') || !LIVE.has(incoming.status ?? '')) return null;
  if (incoming.created !== existing.created) return incoming.created > existing.created ? incoming.id : existing.id;
  return incoming.id > existing.id ? incoming.id : existing.id;
}
