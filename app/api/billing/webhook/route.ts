import { NextResponse } from 'next/server';
import { trackFunnelEvent } from '@/lib/funnel';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { normalizePlan } from '@/lib/planConfig';
import { getPlanLabel } from '@/lib/planLabels';
import { recordReferralConversion } from '@/lib/referralTracking';
import { markOutreachConverted } from '@/lib/outreachReplies';
import {
  TRIAL_GRACE_DAYS,
  TRIAL_WARNING_DAYS,
  trialDaysLeft,
  trialEndDateLabel,
  wasWarnedRecently,
  extractChargeAmount,
  graceDeadline,
} from '@/lib/trialEnd';
import {
  verifyStripeSignature,
  decideEventClaim,
  isMissingTableError,
  buildSubscriptionUpsert,
  defaultPaymentMethodId,
  type StripeSubscriptionLike,
  type ExistingSubscriptionRow,
} from '@/lib/stripeWebhook';
import { claimTrialFingerprint, TRIAL_CARD_USED_MESSAGE } from '@/lib/trialAntiAbuse';
import { paymentMethodIdentityKey } from '@/lib/paymentIdentity';
import { pickDuplicateToCancel } from '@/lib/checkoutGuard';

export const dynamic = 'force-dynamic';

// Stripe billing webhook.
//
// Guarantees (QA ticket 3):
//  (a) Signature: every v1 checked, constant-time, 5-minute replay window
//      (lib/stripeWebhook.verifyStripeSignature). Fails closed in
//      production when STRIPE_WEBHOOK_SECRET is unset.
//  (b) Every Supabase write is checked (`must`) — supabase-js returns
//      {error} instead of throwing, so the old "no catch" comments did not
//      actually make failures 500. A failed write now throws → 500 →
//      Stripe retries. Bad signature / bad JSON stay 400.
//  (c) Idempotency: event ids are claimed in stripe_webhook_events; a
//      redelivered processed event is skipped. All state writes happen
//      BEFORE side effects (email / Slack / referral), and side effects are
//      best-effort, so a retry can only follow a failed state write — no
//      repeated emails. Table missing → logged, processing continues.
//  (d) Ordering: subscription rows are built from the CURRENT Stripe
//      subscription (re-fetched) and upserted by user_id, so whichever event
//      lands first creates the row and checkout.session.completed can never
//      overwrite 'trialing' with 'active'.
//  (e) invoice.payment_succeeded heals past_due → active and clears grace.
//  (f) A grace-expiry downgrade is emailed once (by the cron); a refund
//      cancellation is emailed once (by the refund route).
//  (g) Trial-start email states the card-upfront truth.
//
// The grace clock (payment_failed_at) and the warning flag
// (trial_warning_sent_at) live on app_metadata only — user_metadata is
// user-writable and resetting it used to mean infinite grace.

// Service role client - bypasses RLS, lazy init to avoid build-time crash
let _adminClient: SupabaseClient | null = null;
function getAdminClient(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }
  return _adminClient;
}
const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_t, p) {
    return (getAdminClient() as any)[p];
  },
});

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SLACK = process.env.SLACK_WEBHOOK_HOT_LEADS;

// Throw on a Supabase {error} so the request 500s and Stripe retries.
async function must<T = unknown>(p: PromiseLike<{ data: T; error: { message?: string } | null }>, label: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${label}: ${error.message ?? JSON.stringify(error)}`);
  return data;
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Rankall.io <hello@rankall.io>',
        to,
        subject,
        html,
      }),
    });
    return res.ok;
  } catch (err) {
    console.error('Resend error:', err);
    return false;
  }
}

async function notifySlack(text: string) {
  if (!SLACK) return;
  try {
    await fetch(SLACK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    console.error('Slack error:', err);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Stripe JSON
async function stripeCall(path: string, method: 'GET' | 'POST' | 'DELETE' = 'GET', params?: Record<string, string>): Promise<any> {
  const stripeKey = process.env.STRIPE_SECRET_KEY!;
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    ...(params ? { body: new URLSearchParams(params).toString() } : {}),
  });
  if (!res.ok) throw new Error(`Stripe ${method} ${path.split('?')[0]} failed: ${res.status}`);
  return res.json();
}

// Current Stripe subscription. Throws on failure → 500 → Stripe retries,
// instead of writing a row with a guessed status.
async function fetchStripeSubscription(subscriptionId: string): Promise<StripeSubscriptionLike & Record<string, unknown>> {
  return stripeCall(`subscriptions/${encodeURIComponent(subscriptionId)}`);
}

async function getAuthUser(userId: string): Promise<{ email: string; appMeta: Record<string, unknown> }> {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error) throw new Error(`getUserById: ${error.message}`);
  return {
    email: data?.user?.email ?? '',
    appMeta: (data?.user?.app_metadata ?? {}) as Record<string, unknown>,
  };
}

// Sync plan state onto app_metadata (TRUSTED — admin API only; resolvers
// read it). Display-only fields (account_type, subscription_status,
// trial_ends_at) are mirrored to user_metadata for legacy display readers
// (UserMenu, homepage, email crons). Grace / warning flags and Stripe ids
// are app_metadata ONLY. Throws on failure (state).
async function syncPlanMetadata(
  userId: string | null | undefined,
  fields: {
    account_type?: string;
    subscription_status?: string;
    payment_failed_at?: string | null;
    trial_warning_sent_at?: string | null;
    trial_ends_at?: string | null;
    stripe_customer_id?: string | null;
    stripe_subscription_id?: string | null;
  },
) {
  if (!userId) return;
  const plan_synced_at = new Date().toISOString();
  const display: Record<string, unknown> = { plan_synced_at };
  for (const k of ['account_type', 'subscription_status', 'trial_ends_at'] as const) {
    if (k in fields) display[k] = fields[k];
  }
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: { ...fields, plan_synced_at },
    user_metadata: display,
  });
  if (error) throw new Error(`syncPlanMetadata: ${error.message}`);
}

// First-write-wins grace clock on app_metadata. Returns the effective
// payment_failed_at and whether this call started it. A legacy
// user_metadata.payment_failed_at is ignored (never extends grace).
async function stampPaymentFailedAt(userId: string): Promise<{ failedAt: string; started: boolean }> {
  const { appMeta } = await getAuthUser(userId);
  const existing = appMeta.payment_failed_at;
  if (typeof existing === 'string' && existing) return { failedAt: existing, started: false };
  const failedAt = new Date().toISOString();
  await syncPlanMetadata(userId, { payment_failed_at: failedAt });
  return { failedAt, started: true };
}

async function findUserIdByCustomer(customerId: string | null | undefined): Promise<string | null> {
  if (!customerId) return null;
  const data = await must(
    supabaseAdmin.from('subscriptions').select('user_id').eq('stripe_customer_id', customerId).maybeSingle(),
    'findUserIdByCustomer',
  );
  return ((data as Record<string, unknown> | null)?.user_id as string) ?? null;
}

async function readSubscriptionRow(userId: string): Promise<(ExistingSubscriptionRow & { plan?: string | null }) | null> {
  return (await must(
    supabaseAdmin
      .from('subscriptions')
      .select('status, stripe_subscription_id, created_at, plan')
      .eq('user_id', userId)
      .maybeSingle(),
    'readSubscriptionRow',
  )) as (ExistingSubscriptionRow & { plan?: string | null }) | null;
}

// Upsert the user's subscriptions row from the current Stripe subscription,
// then mirror the state to profiles + metadata. Returns the previous row
// (for transition emails) and the stored status, or null when skipped.
async function applySubscriptionState(
  userId: string,
  sub: StripeSubscriptionLike,
  planHint?: string | null,
): Promise<{ previous: (ExistingSubscriptionRow & { plan?: string | null }) | null; status: string; plan: string } | null> {
  const previous = await readSubscriptionRow(userId);
  const plan = normalizePlan(sub.metadata?.plan || planHint || previous?.plan || 'business');
  const upsert = buildSubscriptionUpsert({ userId, sub, plan, existing: previous });
  if (upsert.skip) {
    console.warn(`webhook: skipping subscription ${sub.id} for ${userId} — ${upsert.reason}`);
    return null;
  }
  await must(supabaseAdmin.from('subscriptions').upsert(upsert.row, { onConflict: 'user_id' }), 'subscriptions upsert');
  const status = upsert.row.status as string;
  const live = ['trialing', 'active', 'past_due', 'unpaid'].includes(status);
  await must(
    supabaseAdmin.from('profiles').upsert({ id: userId, account_type: live ? plan : 'free' }, { onConflict: 'id' }),
    'profiles upsert',
  );
  await syncPlanMetadata(userId, {
    account_type: live ? plan : 'free',
    subscription_status: status,
    trial_ends_at: (upsert.row.trial_end as string | null) ?? null,
    stripe_customer_id: (upsert.row.stripe_customer_id as string | null) ?? null,
    stripe_subscription_id: sub.id,
    ...(status === 'active' || status === 'trialing' ? { payment_failed_at: null } : {}),
  });
  return { previous, status, plan };
}

// One trial per CARD: if this trialing subscription's payer already had a
// trial (any account), end the trial now. The payer key is the card
// fingerprint, or for Link / non-card methods the Link or billing email
// (lib/paymentIdentity) — those used to skip the check entirely. With NO
// payer key at all the trial is not granted (ended now). Returns why the
// trial was ended by this call, or null. Stripe failures throw (retry).
type TrialEndReason = 'repeat' | 'no_identity';
async function enforceOneTrialPerCard(userId: string, sub: StripeSubscriptionLike & Record<string, unknown>): Promise<TrialEndReason | null> {
  if (sub.status !== 'trialing') return null;
  let pmId = defaultPaymentMethodId(sub as { default_payment_method?: string | { id?: string } | null });
  if (!pmId && typeof sub.customer === 'string') {
    try {
      const cust = await stripeCall(`customers/${encodeURIComponent(sub.customer)}`);
      pmId = defaultPaymentMethodId(cust?.invoice_settings ?? null);
    } catch (err) {
      console.error('enforceOneTrialPerCard customer lookup error:', err);
    }
  }
  const pm = pmId ? await stripeCall(`payment_methods/${encodeURIComponent(pmId)}`) : null;
  const key = paymentMethodIdentityKey(pm);
  if (!key) {
    console.warn(`enforceOneTrialPerCard: no payer identity on ${sub.id} (pm ${pmId ?? 'none'}) — trial not granted`);
    await stripeCall(`subscriptions/${encodeURIComponent(sub.id)}`, 'POST', { trial_end: 'now' });
    return 'no_identity';
  }
  const claim = await claimTrialFingerprint(supabaseAdmin, key, userId, sub.id);
  if (claim !== 'repeat') return null;
  await stripeCall(`subscriptions/${encodeURIComponent(sub.id)}`, 'POST', { trial_end: 'now' });
  return 'repeat';
}

const TRIAL_NO_IDENTITY_MESSAGE =
  'We could not verify the payment method for a free trial (free trials need a card or a payment method with a billing email), so this subscription starts without a trial.';

async function sendTrialEndedForRepeatCard(userId: string, sub: Record<string, unknown>, reason: TrialEndReason = 'repeat') {
  try {
    const { email } = await getAuthUser(userId);
    if (!email) return;
    const amount = extractChargeAmount(sub);
    await sendEmail(
      email,
      'Your Rankall subscription started without a free trial',
      `<p>${reason === 'no_identity' ? TRIAL_NO_IDENTITY_MESSAGE : TRIAL_CARD_USED_MESSAGE} Your card on file is being charged${amount ? ` ${amount}` : ''} now for your first billing period.</p><p>Didn’t mean to subscribe? You can cancel from <a href="https://www.rankall.io/dashboard/billing">Manage billing →</a> or reply to this email and we will help.</p>`,
    );
  } catch (err) {
    console.error('repeat-card email error:', err);
  }
}

// Duplicate-subscription backstop (concurrent checkouts). If the user
// already has a different LIVE subscription, cancel the NEWER of the two
// immediately (no proration invoice) and refund whatever it charged; the
// survivor is returned so the caller applies its state. Cancel failures
// throw (Stripe retries the event); a refund failure is logged + Slacked for
// a manual refund rather than re-cancelling on retry.
async function resolveDuplicateSubscription(
  userId: string,
  incoming: StripeSubscriptionLike & Record<string, unknown>,
): Promise<{ cancelledId: string | null; survivor: StripeSubscriptionLike & Record<string, unknown>; refunded: boolean; skipIncoming: boolean }> {
  const row = await readSubscriptionRow(userId);
  const existingId = row?.stripe_subscription_id;
  if (!existingId || existingId === incoming.id) return { cancelledId: null, survivor: incoming, refunded: false, skipIncoming: false };
  let existing: (StripeSubscriptionLike & Record<string, unknown>) | null = null;
  try {
    existing = await fetchStripeSubscription(existingId);
  } catch (err) {
    console.error('duplicate check: could not load existing subscription', existingId, err);
    throw err; // retry — never guess about money
  }
  const toCancel = pickDuplicateToCancel(
    { id: existing.id, created: Number(existing.created ?? 0), status: existing.status },
    { id: incoming.id, created: Number(incoming.created ?? 0), status: incoming.status },
  );
  if (!toCancel) {
    // An already-cancelled duplicate (redelivery after we cancelled it)
    // must not be applied or announced while the original is live.
    const LIVE_NOW = ['trialing', 'active', 'past_due', 'unpaid', 'incomplete'];
    const skipIncoming = LIVE_NOW.includes(existing.status ?? '') && !LIVE_NOW.includes(incoming.status ?? '');
    return { cancelledId: null, survivor: incoming, refunded: false, skipIncoming };
  }
  const dupe = toCancel === incoming.id ? incoming : existing;
  const survivor = toCancel === incoming.id ? existing : incoming;

  await stripeCall(`subscriptions/${encodeURIComponent(toCancel)}`, 'DELETE', {
    invoice_now: 'false',
    prorate: 'false',
    'cancellation_details[comment]': 'duplicate_subscription',
  });

  let refunded = false;
  try {
    const invId = typeof dupe.latest_invoice === 'string' ? dupe.latest_invoice : (dupe.latest_invoice as { id?: string } | null)?.id;
    if (invId) {
      const inv = await stripeCall(`invoices/${encodeURIComponent(invId)}`);
      const paid = Number(inv?.amount_paid ?? 0);
      const pi = typeof inv?.payment_intent === 'string' ? inv.payment_intent : inv?.payment_intent?.id;
      const charge = typeof inv?.charge === 'string' ? inv.charge : inv?.charge?.id;
      if (paid > 0 && (pi || charge)) {
        await stripeCall('refunds', 'POST', {
          ...(pi ? { payment_intent: pi } : { charge }),
          reason: 'duplicate',
          'metadata[duplicate_subscription]': toCancel,
        });
        refunded = true;
      } else if (paid > 0) {
        throw new Error(`no payment reference on invoice ${invId}`);
      }
    }
  } catch (err) {
    console.error(`duplicate subscription ${toCancel} cancelled but refund failed — refund manually:`, err);
    await notifySlack(`⚠️ Duplicate subscription ${toCancel} (user ${userId}) cancelled, but the automatic refund FAILED — refund it manually in Stripe.`);
  }
  console.warn(`duplicate subscription for ${userId}: cancelled ${toCancel}, kept ${survivor.id}, refunded=${refunded}`);
  return { cancelledId: toCancel, survivor, refunded, skipIncoming: toCancel === incoming.id };
}

async function sendDuplicateCancelledEmail(userId: string, refunded: boolean) {
  try {
    const { email } = await getAuthUser(userId);
    if (!email) return;
    await sendEmail(
      email,
      'We cancelled a duplicate Rankall subscription',
      `<p>Two checkouts completed for your account at the same time, which created a second subscription. We cancelled the duplicate immediately${refunded ? ' and refunded its charge to your original payment method (5–10 business days to appear)' : '. If it charged you, we will refund it — reply to this email if you do not see the refund'}.</p><p>Your original subscription is unchanged. <a href="https://www.rankall.io/dashboard/billing">Manage billing →</a></p>`,
    );
  } catch (err) {
    console.error('duplicate-subscription email error:', err);
  }
}

async function ensureSubscriptionsTable() {
  try {
    await supabaseAdmin.rpc('exec_sql', {
      sql: `CREATE TABLE IF NOT EXISTS subscriptions (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id uuid UNIQUE,
        stripe_customer_id text,
        stripe_subscription_id text,
        plan text,
        plan_type text,
        status text DEFAULT 'active',
        current_period_end timestamptz,
        currency text DEFAULT 'USD',
        amount numeric,
        trial_end timestamptz,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      );
      ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan_type text;
      ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan text;`,
    });
  } catch (err) {
    console.error('ensureSubscriptionsTable (continuing):', err);
  }
}

// ── Idempotency ───────────────────────────────────────────────────────────
type ClaimResult = 'process' | 'duplicate' | 'in_flight' | 'untracked';

async function claimEvent(id: string, type: string): Promise<ClaimResult> {
  try {
    const { error } = await supabaseAdmin
      .from('stripe_webhook_events')
      .insert({ id, type, received_at: new Date().toISOString() });
    if (!error) return 'process';
    if (isMissingTableError(error)) {
      console.error('stripe_webhook_events table missing — idempotency disabled until migration 20261016000300_billing_hardening.sql is applied');
      return 'untracked';
    }
    if ((error as { code?: string }).code !== '23505') {
      console.error('stripe_webhook_events claim error (processing anyway):', error);
      return 'untracked';
    }
    const { data, error: readErr } = await supabaseAdmin
      .from('stripe_webhook_events')
      .select('processed_at, received_at')
      .eq('id', id)
      .maybeSingle();
    if (readErr) {
      console.error('stripe_webhook_events read error (processing anyway):', readErr);
      return 'untracked';
    }
    const decision = decideEventClaim(data as { processed_at?: string | null; received_at?: string | null } | null);
    if (decision === 'process') {
      // Stale claim from a crashed attempt — refresh it and reprocess.
      await supabaseAdmin.from('stripe_webhook_events').update({ received_at: new Date().toISOString() }).eq('id', id);
    }
    return decision;
  } catch (err) {
    console.error('stripe_webhook_events claim exception (processing anyway):', err);
    return 'untracked';
  }
}

async function markEventProcessed(id: string) {
  try {
    const { error } = await supabaseAdmin
      .from('stripe_webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('id', id);
    if (error) console.error('stripe_webhook_events mark error:', error);
  } catch (err) {
    console.error('stripe_webhook_events mark exception:', err);
  }
}

async function releaseEvent(id: string) {
  try {
    await supabaseAdmin.from('stripe_webhook_events').delete().eq('id', id).is('processed_at', null);
  } catch (err) {
    console.error('stripe_webhook_events release exception:', err);
  }
}

export async function POST(request: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ received: true });
  }

  const payload = await request.text();
  const sigHeader = request.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: any;
  if (webhookSecret) {
    if (!verifyStripeSignature(payload, sigHeader, webhookSecret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }
    try {
      event = JSON.parse(payload);
    } catch {
      return NextResponse.json({ error: 'Malformed JSON' }, { status: 400 });
    }
  } else if (process.env.NODE_ENV !== 'production') {
    // Dev only — skip verification when no webhook secret is configured.
    try {
      event = JSON.parse(payload);
    } catch {
      return NextResponse.json({ error: 'Malformed JSON' }, { status: 400 });
    }
  } else {
    // Production with no webhook secret: refuse to trust an unsigned payload
    // (otherwise a forged POST could upgrade any user to a paid plan).
    console.error('STRIPE_WEBHOOK_SECRET missing in production — rejecting unsigned webhook');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  const eventId = typeof event?.id === 'string' ? event.id : '';
  const type = event?.type as string;
  const obj = event?.data?.object ?? {};

  let claim: ClaimResult = 'untracked';
  if (eventId) {
    claim = await claimEvent(eventId, type);
    if (claim === 'duplicate') return NextResponse.json({ received: true, duplicate: true });
    if (claim === 'in_flight') {
      // Another delivery of this event is being processed right now — ask
      // Stripe to retry later rather than double-processing.
      return NextResponse.json({ error: 'Event in progress' }, { status: 409 });
    }
  }

  // Side effects (emails, Slack, referral) are queued and run only after
  // every state write succeeded, so a retry never repeats them.
  const sideEffects: Array<() => Promise<unknown>> = [];

  try {
    await ensureSubscriptionsTable();

    if (type === 'checkout.session.completed') {
      const userId = obj?.metadata?.user_id as string | undefined;
      const email = obj?.customer_email || obj?.customer_details?.email || '';
      const subscriptionId = obj?.subscription as string | undefined;
      if (!userId || !subscriptionId) {
        console.warn('checkout.session.completed without user_id/subscription — ignored', obj?.id);
      } else {
        let sub = await fetchStripeSubscription(subscriptionId);
        // Duplicate backstop first: a second concurrent checkout must not
        // become a second billed subscription.
        const dup = await resolveDuplicateSubscription(userId, sub);
        if (dup.cancelledId) {
          sideEffects.push(() => sendDuplicateCancelledEmail(userId, dup.refunded));
          sideEffects.push(() => notifySlack(`♻️ Duplicate subscription cancelled for ${email || userId}: ${dup.cancelledId}${dup.refunded ? ' (refunded)' : ''}`));
        }
        if (dup.cancelledId && !dup.skipIncoming) sub = dup.survivor;
        if (!dup.skipIncoming) {
          const trialEndedForCard = await enforceOneTrialPerCard(userId, sub);
          if (trialEndedForCard) sub = await fetchStripeSubscription(subscriptionId);
          const applied = await applySubscriptionState(userId, sub, obj?.metadata?.plan);
          const status = applied?.status ?? (sub.status as string);
          const plan = applied?.plan ?? normalizePlan(obj?.metadata?.plan || 'business');
          const planLabel = getPlanLabel(plan);
          const amount = extractChargeAmount(sub as Record<string, unknown>);

          if (trialEndedForCard) {
            sideEffects.push(() => sendTrialEndedForRepeatCard(userId, sub as Record<string, unknown>, trialEndedForCard));
          } else if (email && status === 'trialing') {
            const trialEndIso = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;
            sideEffects.push(() =>
              sendEmail(
                email,
                `Your ${planLabel} 7-day free trial has started`,
                `<p>Your <strong>${planLabel}</strong> 7-day free trial has started. Your card is on file and you won’t be charged until the trial ends${trialEndIso ? ` on ${trialEndDateLabel(trialEndIso)}` : ''} — then your card is charged${amount ? ` ${amount}` : ''} automatically and the subscription renews each billing period.</p><p>Cancel anytime before the trial ends and you pay nothing. During the trial some features are capped (for example 1 location and a limited number of scans); they unlock when the paid plan starts.</p><p><a href="https://www.rankall.io/dashboard">Go to your dashboard →</a> · <a href="https://www.rankall.io/dashboard/billing">Manage billing</a></p>`,
              ),
            );
          } else if (email && status === 'active') {
            // CONV-00: funnel instrumentation — immediate payment (non-trial checkout).
            sideEffects.push(async () => {
              trackFunnelEvent({
                event: 'paid',
                userId,
                email: email || null,
                metadata: { plan, amount: amount ?? null, via: 'checkout' },
              });
            });
            sideEffects.push(() =>
              sendEmail(
                email,
                `Your ${planLabel} plan is active`,
                `<p>Your <strong>${planLabel}</strong> plan is active and your card was charged${amount ? ` ${amount}` : ''}. It renews automatically each billing period until you cancel.</p><p><a href="https://www.rankall.io/dashboard">Go to your dashboard →</a> · <a href="https://www.rankall.io/dashboard/billing">Manage billing</a></p>`,
              ),
            );
          }
          sideEffects.push(() =>
            notifySlack(
              status === 'trialing' ? `🆓 New trial signup: ${plan} | ${email}` : `💳 New paid signup: ${plan} | ${email}`,
            ),
          );

          // Referral conversion — the ref code rides through checkout metadata.
          const refCode = obj?.metadata?.ref_code;
          if (refCode) {
            const monthlyAmount = typeof obj?.amount_total === 'number' ? obj.amount_total / 100 : null;
            sideEffects.push(() =>
              recordReferralConversion({ refCode, referredUserId: userId, referredEmail: email, plan, monthlyAmount, status: 'active' }),
            );
          }

          // Outreach conversion (fix #3) — a checkout (trialing or active)
          // from an email we cold-emailed marks that prospect converted and
          // stops any further sequence touches. Exact email match only;
          // fail-open inside markOutreachConverted, so billing never breaks.
          // Runs only for a real new subscription (inside !skipIncoming),
          // never for a duplicate-cancelled checkout.
          if (email) {
            sideEffects.push(() => markOutreachConverted(email, 'stripe_checkout'));
          }
        }
      }
    } else if (type === 'customer.subscription.created' || type === 'customer.subscription.updated') {
      // Always act on the CURRENT subscription (ordering, see header).
      const sub = await fetchStripeSubscription(obj?.id);
      const userId = sub?.metadata?.user_id || obj?.metadata?.user_id || (await findUserIdByCustomer(obj?.customer));
      if (!userId) {
        console.warn(`${type}: no user for subscription ${obj?.id} — ignored`);
      } else {
        let current = sub;
        let trialEndedForCard: TrialEndReason | null = null;
        let skipApply = false;
        if (type === 'customer.subscription.created') {
          const dup = await resolveDuplicateSubscription(userId, sub);
          if (dup.cancelledId) {
            sideEffects.push(() => sendDuplicateCancelledEmail(userId, dup.refunded));
          }
          skipApply = dup.skipIncoming;
          if (dup.cancelledId && !dup.skipIncoming) current = dup.survivor;
          if (!skipApply) {
            trialEndedForCard = await enforceOneTrialPerCard(userId, current);
            if (trialEndedForCard) current = await fetchStripeSubscription(current.id);
          }
        }
        const applied = skipApply ? null : await applySubscriptionState(userId, current);
        if (applied) {
          const { previous, status, plan } = applied;
          if (status === 'past_due' || status === 'unpaid') {
            await stampPaymentFailedAt(userId);
            console.warn(`Payment issue: ${userId} status ${status} — access retained (grace)`);
          }
          if (trialEndedForCard) {
            const reason = trialEndedForCard;
            sideEffects.push(() => sendTrialEndedForRepeatCard(userId, current as Record<string, unknown>, reason));
          } else if (status === 'active' && previous?.status === 'trialing' && previous.stripe_subscription_id === current.id) {
            // Trial-end conversion: the card on file was charged.
            sideEffects.push(async () => {
              const { email } = await getAuthUser(userId);
              if (!email) return;
              const planLabel = getPlanLabel(plan);
              const amount = extractChargeAmount(current as Record<string, unknown>);
              await sendEmail(
                email,
                `Your ${planLabel} trial ended — you're now on the paid plan`,
                `<p>Your 7-day free trial has ended and your card on file was charged${amount ? ` ${amount}` : ''}. You're now on the <strong>${planLabel}</strong> plan with full access. It renews automatically each billing period until you cancel.</p><p>Changed your mind? You have a 14-day money-back guarantee — <a href="https://www.rankall.io/dashboard/billing">manage billing →</a></p>`,
              );
            });
          }
        }
      }
    } else if (type === 'customer.subscription.trial_will_end') {
      // ~3 days before a trial ends. Deduped via app_metadata
      // .trial_warning_sent_at (the expire-trials cron sends the same warning
      // as belt-and-braces).
      const userId = obj?.metadata?.user_id || (await findUserIdByCustomer(obj?.customer));
      if (userId) {
        const { email, appMeta } = await getAuthUser(userId);
        if (email && !wasWarnedRecently(appMeta)) {
          const trialEndIso = typeof obj?.trial_end === 'number' ? new Date(obj.trial_end * 1000).toISOString() : null;
          const daysLeft = trialEndIso ? trialDaysLeft(trialEndIso) : TRIAL_WARNING_DAYS;
          const row = await readSubscriptionRow(userId);
          const planLabel = getPlanLabel(normalizePlan(row?.plan || obj?.metadata?.plan || 'business'));
          const amount = extractChargeAmount(obj as Record<string, unknown>);
          const endDate = trialEndDateLabel(trialEndIso);
          sideEffects.push(async () => {
            const sent = await sendEmail(
              email,
              daysLeft <= 0
                ? `Your ${planLabel} trial ends today`
                : `Your ${planLabel} trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
              `<p>Your <strong>${planLabel}</strong> free trial ends on ${endDate}. Your card on file will be charged${amount ? ` ${amount}` : ''} when the trial ends — no action needed.</p><p>Want to stop? Cancel anytime before then and you pay nothing: <a href="https://www.rankall.io/dashboard/billing">Manage billing →</a></p>`,
            );
            // Only mark warned when the email actually sent.
            if (sent) await syncPlanMetadata(userId, { trial_warning_sent_at: new Date().toISOString() });
          });
        }
      }
    } else if (type === 'customer.subscription.deleted') {
      const customerId = obj?.customer as string | undefined;
      const userId = obj?.metadata?.user_id || (await findUserIdByCustomer(customerId));
      if (userId) {
        const row = await readSubscriptionRow(userId);
        // A deleted OLD subscription must not downgrade a user who already
        // has a newer live one.
        const superseded =
          !!row?.stripe_subscription_id &&
          row.stripe_subscription_id !== obj?.id &&
          ['trialing', 'active', 'past_due', 'unpaid'].includes(row.status ?? '');
        if (superseded) {
          console.warn(`subscription.deleted for superseded ${obj?.id} — user ${userId} keeps ${row?.stripe_subscription_id}`);
        } else {
          const alreadyExpired = row?.status === 'expired';
          await must(
            supabaseAdmin
              .from('subscriptions')
              .update({ status: alreadyExpired ? 'expired' : 'cancelled', updated_at: new Date().toISOString() })
              .eq('user_id', userId),
            'subscriptions cancel',
          );
          await must(
            supabaseAdmin.from('profiles').upsert({ id: userId, account_type: 'free' }, { onConflict: 'id' }),
            'profiles downgrade',
          );
          await syncPlanMetadata(userId, {
            account_type: 'free',
            subscription_status: alreadyExpired ? 'expired' : 'cancelled',
            payment_failed_at: null,
          });
          // One email per downgrade: the refund route and the grace-expiry
          // cron send their own (single) email and tag the cancellation.
          const comment = obj?.cancellation_details?.comment as string | undefined;
          const emailedElsewhere = comment === 'money_back_refund' || comment === 'grace_expired' || alreadyExpired;
          if (!emailedElsewhere) {
            sideEffects.push(async () => {
              const { email } = await getAuthUser(userId);
              if (!email) return;
              await sendEmail(
                email,
                'Your Rankall subscription has ended',
                `<p>Your Rankall subscription has ended and your account moved to the Free plan. Your scans and data stay.</p><p>We'd love to have you back any time — <a href="https://www.rankall.io/pricing">see plans →</a></p>`,
              );
            });
          }
        }
      }
    } else if (type === 'invoice.payment_failed') {
      // Grace period — keep access, stamp the grace clock (first write
      // wins), notify ONCE when the clock starts. The deadline shown is
      // the real one (payment_failed_at + 3 days), not "now + 3 days" on
      // every retry attempt. The expire-trials cron enforces it.
      const failUserId = await findUserIdByCustomer(obj?.customer);
      if (failUserId) {
        await syncPlanMetadata(failUserId, { subscription_status: 'payment_failed' });
        const { failedAt, started } = await stampPaymentFailedAt(failUserId);
        const email = obj?.customer_email || '';
        if (started && email) {
          const deadlineIso = graceDeadline(failedAt);
          const deadline = deadlineIso
            ? new Date(deadlineIso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
            : `${TRIAL_GRACE_DAYS} days from now`;
          sideEffects.push(() =>
            sendEmail(
              email,
              'Payment failed — please update your card',
              `<p>We couldn't process your latest Rankall payment. Your access is still active for now.</p><p>Please <a href="https://www.rankall.io/dashboard/billing">update your payment method →</a> by ${deadline} (${TRIAL_GRACE_DAYS} days). If payment still hasn't gone through by then, your plan will move to Free — your scans and data stay, you just lose paid access until you reactivate.</p>`,
            ),
          );
        }
      }
      console.log('invoice.payment_failed — grace period, access retained');
    } else if (type === 'invoice.payment_succeeded' || type === 'invoice.paid') {
      // Heal: a paid invoice after a failure → past_due/unpaid back to
      // active (from Stripe's current subscription status), grace cleared.
      const userId = await findUserIdByCustomer(obj?.customer);
      const subscriptionId =
        (typeof obj?.subscription === 'string' && obj.subscription) ||
        (typeof obj?.parent?.subscription_details?.subscription === 'string' && obj.parent.subscription_details.subscription) ||
        null;
      if (userId && subscriptionId) {
        // CONV-00: funnel instrumentation — first successful payment
        // (trial converting to paid, or direct paid renewal).
        sideEffects.push(async () => {
          try {
            const { createClient } = await import('@supabase/supabase-js');
            const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
            const { count } = await db.from('funnel_events').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('event_name', 'paid');
            if (!count) {
              trackFunnelEvent({ event: 'paid', userId, metadata: { via: 'invoice', subscription_id: subscriptionId } });
            }
          } catch { /* never break the webhook */ }
        });
        const row = await readSubscriptionRow(userId);
        const { appMeta } = await getAuthUser(userId);
        const needsHeal =
          ['past_due', 'unpaid'].includes(row?.status ?? '') ||
          (typeof appMeta.payment_failed_at === 'string' && !!appMeta.payment_failed_at);
        if (needsHeal) {
          const sub = await fetchStripeSubscription(subscriptionId);
          if (sub.status === 'active' || sub.status === 'trialing') {
            await applySubscriptionState(userId, sub);
            await syncPlanMetadata(userId, { payment_failed_at: null, subscription_status: sub.status as string });
          }
        }
      }
    }

    // All state writes succeeded — mark processed BEFORE side effects, so a
    // crash during an email can never cause a redelivery to resend.
    if (claim === 'process') await markEventProcessed(eventId);
  } catch (err) {
    console.error('webhook error:', err);
    if (claim === 'process') await releaseEvent(eventId);
    // 500 so Stripe RETRIES. No side effect has run yet.
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }

  for (const run of sideEffects) {
    try {
      await run();
    } catch (err) {
      console.error('webhook side effect error (not retried):', err);
    }
  }

  return NextResponse.json({ received: true });
}
