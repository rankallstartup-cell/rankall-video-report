// lib/billingAuth.ts — shared, session-derived identity + Stripe helpers for
// the billing action routes (cancel, cancel-flow, pause, unpause, discount).
//
// Every billing action acts on the SESSION user's own subscription. A
// body-supplied userId / user_id / subscription_id is never trusted: the
// old routes took them from the body with no session, so anyone could
// cancel, pause or void any customer's subscription.
//
// Stripe ids come from the subscriptions table (service role) or
// app_metadata (admin API only) — NEVER user_metadata, which every user can
// rewrite with supabase.auth.updateUser.

import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

export function getBillingAdminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// The authenticated user from the request cookies, or null.
export async function getSessionUser(req: NextRequest): Promise<User | null> {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } },
    );
    const { data } = await supabase.auth.getUser();
    return data?.user ?? null;
  } catch {
    return null;
  }
}

export interface OwnSubscription {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: string | null;
  plan: string | null;
}

// The session user's own subscription ids. Source order: subscriptions row
// (service role) → app_metadata. user_metadata is deliberately ignored.
export async function getOwnSubscription(
  admin: SupabaseClient,
  user: Pick<User, 'id' | 'app_metadata'>,
): Promise<OwnSubscription> {
  let row: Record<string, unknown> | null = null;
  try {
    const { data, error } = await admin
      .from('subscriptions')
      .select('stripe_customer_id, stripe_subscription_id, status, plan')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!error) row = (data as Record<string, unknown> | null) ?? null;
  } catch {
    row = null;
  }
  const am = (user.app_metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  return {
    stripeCustomerId: str(row?.stripe_customer_id) ?? str(am.stripe_customer_id),
    stripeSubscriptionId: str(row?.stripe_subscription_id) ?? str(am.stripe_subscription_id),
    status: str(row?.status) ?? str(am.subscription_status),
    plan: str(row?.plan),
  };
}

// Minimal Stripe REST call (form-encoded). Returns ok + parsed JSON.
export async function stripeRequest(
  path: string,
  method: 'GET' | 'POST' | 'DELETE',
  params?: Record<string, string>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Stripe JSON
): Promise<{ ok: boolean; status: number; json: any }> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { ok: false, status: 503, json: { error: { message: 'Stripe not configured' } } };
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    ...(params ? { body: new URLSearchParams(params).toString() } : {}),
  });
  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

export const PAUSE_DAYS = 30;
// One pause per rolling 6 months. Stamped as app_metadata.last_paused_at
// (service-role only; never cleared by unpause).
export const PAUSE_COOLDOWN_DAYS = 183;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Pure: may this account start a pause now? */
export function pauseCooldownRemainingDays(appMetadata: unknown, nowMs: number = Date.now()): number {
  const am = (appMetadata ?? {}) as Record<string, unknown>;
  const last = typeof am.last_paused_at === 'string' ? new Date(am.last_paused_at).getTime() : NaN;
  if (!Number.isFinite(last)) return 0;
  const until = last + PAUSE_COOLDOWN_DAYS * DAY_MS;
  return until > nowMs ? Math.ceil((until - nowMs) / DAY_MS) : 0;
}

// Pause the caller's own subscription for PAUSE_DAYS. Stripe billing pauses
// with a fixed resumes_at (the copy promises "30 days" — the old cancel-flow
// paused indefinitely), and the trusted pause flags go on app_metadata (the
// scan route enforces them) with a display copy on user_metadata.
//
// Refused while trialing or past_due: pausing collection with
// behavior=void on those would void the trial-end / overdue invoice and
// grant free paid access. A trialing user who wants out simply cancels —
// nothing is charged.
export type PauseResult =
  | { ok: true; pauseUntil: string; stripePaused: boolean }
  | { ok: false; status: number; error: string; message: string };

export async function pauseOwnSubscription(
  admin: SupabaseClient,
  user: Pick<User, 'id' | 'app_metadata' | 'user_metadata'>,
  now: number = Date.now(),
): Promise<PauseResult> {
  const sub = await getOwnSubscription(admin, user);
  if (sub.status === 'trialing') {
    return {
      ok: false,
      status: 409,
      error: 'pause_not_available_trial',
      message: 'Pausing is not available during your free trial. Cancel before the trial ends and you will not be charged.',
    };
  }
  if (sub.status === 'past_due' || sub.status === 'unpaid') {
    return {
      ok: false,
      status: 409,
      error: 'pause_not_available_past_due',
      message: 'Your last payment did not go through, so the subscription cannot be paused. Update your payment method or cancel instead.',
    };
  }

  // Pause loophole (QA round 2): pausing right before renewal voids that
  // renewal invoice; resuming right after gave a free month, every cycle.
  // Policy: (1) one pause per 6 months; (2) while paused the plan resolves
  // to free (planConfig.isAccountPaused), so nothing paid is used for free;
  // (3) resuming after a voided invoice starts a NEW billing period that is
  // charged immediately (unpauseOwnSubscription).
  const am = (user.app_metadata ?? {}) as Record<string, unknown>;
  if (am.account_paused === true && typeof am.pause_until === 'string' && new Date(am.pause_until).getTime() > now) {
    return { ok: false, status: 409, error: 'already_paused', message: 'Your account is already paused.' };
  }
  const cooldown = pauseCooldownRemainingDays(am, now);
  if (cooldown > 0) {
    return {
      ok: false,
      status: 409,
      error: 'pause_limit_reached',
      message: `Subscriptions can be paused once every 6 months. You can pause again in ${cooldown} day${cooldown === 1 ? '' : 's'}, or cancel instead.`,
    };
  }

  const pauseUntilMs = now + PAUSE_DAYS * 24 * 60 * 60 * 1000;
  const pauseUntil = new Date(pauseUntilMs).toISOString();

  let stripePaused = false;
  if (sub.stripeSubscriptionId && process.env.STRIPE_SECRET_KEY) {
    const r = await stripeRequest(`subscriptions/${encodeURIComponent(sub.stripeSubscriptionId)}`, 'POST', {
      'pause_collection[behavior]': 'void',
      'pause_collection[resumes_at]': String(Math.floor(pauseUntilMs / 1000)),
    });
    if (!r.ok) {
      return {
        ok: false,
        status: 502,
        error: 'pause_failed',
        message: 'Could not pause billing with our payment provider. Nothing was changed — please try again or contact hello@rankall.io.',
      };
    }
    stripePaused = true;
  }

  const flags = { account_paused: true, paused_at: new Date(now).toISOString(), pause_until: pauseUntil };
  // The app_metadata flags are what make the plan resolve to free while
  // paused (planConfig.isAccountPaused). If they are not written, Stripe
  // would be voiding invoices while the account still resolves as PAID —
  // free paid access. So: retry once, and if the write still fails, undo
  // the Stripe pause and report an error. Never return ok in that state.
  const writeFlags = async (): Promise<boolean> => {
    try {
      const { error } = await admin.auth.admin.updateUserById(user.id, {
        // GoTrue merges top-level metadata keys, so only the flags are sent.
        // last_paused_at lives on app_metadata only (it gates the cooldown).
        app_metadata: { ...flags, last_paused_at: flags.paused_at },
        user_metadata: flags,
      });
      if (error) console.error('pauseOwnSubscription metadata error:', error);
      return !error;
    } catch (err) {
      console.error('pauseOwnSubscription metadata error:', err);
      return false;
    }
  };
  if (!(await writeFlags()) && !(await writeFlags())) {
    if (stripePaused && sub.stripeSubscriptionId) {
      const revert = await stripeRequest(`subscriptions/${encodeURIComponent(sub.stripeSubscriptionId)}`, 'POST', {
        pause_collection: '',
      }).catch(() => ({ ok: false, status: 0, json: null }));
      if (!revert.ok) {
        console.error('[CRITICAL] pauseOwnSubscription: metadata write failed AND Stripe pause revert failed — subscription paused while account resolves as paid', { userId: user.id, subscription: sub.stripeSubscriptionId });
        return {
          ok: false,
          status: 500,
          error: 'pause_inconsistent',
          message: 'Something went wrong while pausing your subscription. Please contact hello@rankall.io so we can fix your billing.',
        };
      }
    }
    return {
      ok: false,
      status: 500,
      error: 'pause_failed',
      message: 'Could not pause your account. Nothing was changed — please try again or contact hello@rankall.io.',
    };
  }
  return { ok: true, pauseUntil, stripePaused };
}

// Resume: clear Stripe pause_collection (empty value unsets it) AND the
// pause flags. The old unpause only cleared a user_metadata flag, so Stripe
// kept voiding invoices — free access with "resumed" status.
//
// If the pause VOIDED a renewal invoice, the period it covered was never paid
// for, so resuming starts a new billing period now and charges it
// immediately (billing_cycle_anchor=now, no proration credit for the unpaid
// period, error_if_incomplete so a declined card leaves the account paused
// instead of handing out a free period). If nothing was voided (paused and
// resumed inside an already-paid period) billing simply continues.
// Fails CLOSED: if Stripe cannot tell us whether an invoice was voided, the
// account stays paused.
export async function unpauseOwnSubscription(
  admin: SupabaseClient,
  user: Pick<User, 'id' | 'app_metadata' | 'user_metadata'>,
): Promise<{ ok: boolean; status: number; message?: string; chargedNewPeriod?: boolean }> {
  const sub = await getOwnSubscription(admin, user);
  let chargedNewPeriod = false;
  if (sub.stripeSubscriptionId && process.env.STRIPE_SECRET_KEY) {
    const subId = encodeURIComponent(sub.stripeSubscriptionId);
    const am = (user.app_metadata ?? {}) as Record<string, unknown>;
    const pausedAtMs = typeof am.paused_at === 'string' ? new Date(am.paused_at).getTime() : NaN;
    // No trusted pause start → look back one full pause window.
    const since = Math.floor((Number.isFinite(pausedAtMs) ? pausedAtMs : Date.now() - PAUSE_DAYS * DAY_MS) / 1000);
    const voided = await stripeRequest(`invoices?subscription=${subId}&status=void&created[gte]=${since}&limit=10`, 'GET');
    if (!voided.ok) {
      return { ok: false, status: 502, message: 'Could not resume billing with our payment provider. Please try again or contact hello@rankall.io.' };
    }
    const hadVoidedInvoice = Array.isArray(voided.json?.data) && voided.json.data.length > 0;
    const params: Record<string, string> = { pause_collection: '' };
    if (hadVoidedInvoice) {
      params.billing_cycle_anchor = 'now';
      params.proration_behavior = 'none';
      params.payment_behavior = 'error_if_incomplete';
      chargedNewPeriod = true;
    }
    const r = await stripeRequest(`subscriptions/${subId}`, 'POST', params);
    if (!r.ok) {
      if (hadVoidedInvoice && (r.status === 402 || r.json?.error?.type === 'card_error')) {
        return {
          ok: false,
          status: 402,
          message: 'Resuming starts a new billing period, but your card was declined. Update your payment method in billing and try again.',
        };
      }
      return {
        ok: false,
        status: 502,
        message: 'Could not resume billing with our payment provider. Please try again or contact hello@rankall.io.',
      };
    }
  }
  const cleared = { account_paused: false, paused_at: null, pause_until: null };
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: cleared,
    user_metadata: cleared,
  });
  if (error) return { ok: false, status: 500, message: 'Could not resume your account. Please try again.' };
  return { ok: true, status: 200, chargedNewPeriod };
}
