import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  refundEligibility,
  moneyBackDateLabel,
  formatRefundAmount,
  listAllCharges,
  stripeChargesPager,
  refundAlreadyClaimed,
  refundClaimsOrFilter,
  REFUND_ALREADY_USED_MESSAGE,
  type ChargeWithCard,
} from '@/lib/moneyBack';
import { checkRateLimitDb } from '@/lib/rateLimit';
import { chargeIdentityKey } from '@/lib/paymentIdentity';

// POST /api/billing/refund — self-serve 14-day money-back refund (b28k).
//
// Before this route, the guarantee was email-only: terms said "email
// hello@rankall.io" and the billing page had no refund action, so the
// "manage billing" link in the trial-conversion email was a dead end for
// refunds. Now a user inside the window refunds from their billing page.
//
// What it does, in order:
//   1. Verifies the session user (never a client-supplied userId — b01t).
//   2. Re-checks eligibility from Stripe charges (the window is enforced
//      here, not just in the UI — a crafted request outside the window
//      still gets refused).
//   3. Creates the Stripe refund for the first payment.
//   4. Cancels the Stripe subscription, so the user is NOT charged again
//      next period after being refunded. If the cancel fails after a
//      successful refund, the refund still stands and the response says
//      plainly that the subscription still needs cancelling.
//   5. Sends a confirmation email (best-effort: a failed email never
//      fails or fakes the refund).
//
// The subscription.deleted webhook downgrades the account to Free.
// Once per PERSON: refunds are recorded in money_back_refunds (user id +
// card fingerprint, migration 20261016000300_billing_hardening.sql) and a second
// claim by either key is refused with 409. Fails CLOSED if that table is
// missing (money action) — the user is pointed to hello@rankall.io.
// No real refund is ever issued in tests — this route is only exercised
// live, in a Stripe-configured environment.

export const dynamic = 'force-dynamic';

let _adminClient: SupabaseClient | null = null;
function getAdminClient(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }
  return _adminClient;
}
const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_t, p) {
    return (getAdminClient() as any)[p];
  },
});

export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: 'stripe_not_configured', message: 'Payments are not configured yet.' },
      { status: 503 },
    );
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } },
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Money action: shared (DB-backed) rate limit per user.
  const { allowed } = await checkRateLimitDb('refund:user', user.id, { limit: 5, windowMs: 24 * 60 * 60 * 1000 });
  if (!allowed) {
    return NextResponse.json(
      {
        error: 'refund_rate_limited',
        message: 'Too many refund attempts. Please wait a while and try again, or contact hello@rankall.io and we will help.',
      },
      { status: 429 },
    );
  }

  // Stripe ids from the session user's own subscriptions row.
  let customerId: string | null = null;
  let subscriptionId: string | null = null;
  try {
    const { data } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id, stripe_subscription_id')
      .eq('user_id', user.id)
      .maybeSingle();
    customerId = ((data as { stripe_customer_id?: string | null } | null)?.stripe_customer_id ?? null);
    subscriptionId = ((data as { stripe_subscription_id?: string | null } | null)?.stripe_subscription_id ?? null);
  } catch (err) {
    console.error('refund subscription lookup error:', err);
  }
  if (!customerId) {
    return NextResponse.json(
      {
        error: 'refund_no_payment',
        message: 'No payment found for your account, so there is nothing to refund. If you were charged and see this, contact hello@rankall.io and we will help.',
      },
      { status: 404 },
    );
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY!;
  const charges = await listAllCharges(stripeChargesPager(customerId, stripeKey));
  if (!charges) {
    return NextResponse.json(
      {
        error: 'refund_failed',
        message: 'Could not verify your payment with Stripe right now. Nothing was refunded. Please try again, or contact hello@rankall.io and we will help.',
      },
      { status: 502 },
    );
  }
  const eligibility = refundEligibility(charges);
  if (!eligibility.eligible) {
    if (eligibility.reason === 'already_refunded') {
      return NextResponse.json(
        {
          error: 'refund_already_refunded',
          message: 'A refund was already issued for your first payment. If you do not see it on your statement within 10 business days, contact hello@rankall.io and we will help.',
        },
        { status: 409 },
      );
    }
    if (eligibility.reason === 'outside_window') {
      return NextResponse.json(
        {
          error: 'refund_outside_window',
          deadline: eligibility.deadline,
          message: `Your 14-day money-back guarantee ended on ${moneyBackDateLabel(eligibility.deadline)}. Subscriptions are non-refundable after that, but you can cancel anytime to stop future charges. If you believe this is a billing error, contact hello@rankall.io and we will review it.`,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      {
        error: 'refund_no_payment',
        message: 'No payment found for your account, so there is nothing to refund. If you were charged and see this, contact hello@rankall.io and we will help.',
      },
      { status: 404 },
    );
  }

  // Once per person: refuse if this user OR this card already used the
  // guarantee (across all Stripe customers / accounts).
  // Payer key: card fingerprint, else billing email hash (Link / wallets
  // without a card fingerprint used to skip the per-card check entirely).
  // No key at all → no self-serve refund: support reviews it by hand.
  const refundCharge = charges.find((c) => c.id === eligibility.chargeId) as ChargeWithCard | undefined;
  const fingerprint = chargeIdentityKey(refundCharge as Parameters<typeof chargeIdentityKey>[0]);
  if (!fingerprint) {
    return NextResponse.json(
      {
        error: 'refund_needs_support',
        message: 'We could not verify this payment method for a self-serve refund. Nothing was refunded. Email hello@rankall.io from your account email and we will process an eligible refund for you.',
      },
      { status: 409 },
    );
  }
  {
    let q = supabaseAdmin.from('money_back_refunds').select('user_id, card_fingerprint');
    // PostgREST or() values: quote so an `email:<hex>` key parses as one value.
    q = q.or(refundClaimsOrFilter(user.id, fingerprint));
    const { data: claims, error: claimsErr } = await q;
    if (claimsErr) {
      console.error('refund claims lookup error (failing closed):', claimsErr);
      return NextResponse.json(
        {
          error: 'refund_unavailable',
          message: 'Self-serve refunds are temporarily unavailable. Nothing was refunded. Email hello@rankall.io with your account email and we will process an eligible refund for you.',
        },
        { status: 503 },
      );
    }
    if (refundAlreadyClaimed(claims as { user_id?: string; card_fingerprint?: string }[], user.id, fingerprint)) {
      return NextResponse.json({ error: 'refund_already_used', message: REFUND_ALREADY_USED_MESSAGE }, { status: 409 });
    }
    // Reserve the claim BEFORE refunding (charge_id is unique), so two
    // concurrent requests cannot both refund. Released if the refund fails.
    const { error: insErr } = await supabaseAdmin.from('money_back_refunds').insert({
      user_id: user.id,
      card_fingerprint: fingerprint,
      stripe_customer_id: customerId,
      charge_id: eligibility.chargeId,
      amount_cents: eligibility.amountCents,
      currency: eligibility.currency,
    });
    if (insErr) {
      const duplicate = (insErr as { code?: string }).code === '23505';
      if (duplicate) {
        return NextResponse.json({ error: 'refund_already_used', message: REFUND_ALREADY_USED_MESSAGE }, { status: 409 });
      }
      console.error('refund claim insert error (failing closed):', insErr);
      return NextResponse.json(
        {
          error: 'refund_unavailable',
          message: 'Self-serve refunds are temporarily unavailable. Nothing was refunded. Email hello@rankall.io with your account email and we will process an eligible refund for you.',
        },
        { status: 503 },
      );
    }
  }
  const releaseClaim = async () => {
    const { error } = await supabaseAdmin.from('money_back_refunds').delete().eq('charge_id', eligibility.chargeId);
    if (error) console.error('refund claim release error:', error);
  };

  // Create the Stripe refund. Only a confirmed refund object counts as
  // success — anything else is an honest failure, never a fake success.
  const refundParams = new URLSearchParams();
  refundParams.append('charge', eligibility.chargeId);
  refundParams.append('reason', 'requested_by_customer');
  const refundRes = await fetch('https://api.stripe.com/v1/refunds', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: refundParams.toString(),
  });
  const refundJson: any = await refundRes.json().catch(() => null);
  if (!refundRes.ok || !refundJson?.id) {
    await releaseClaim();
    const stripeCode = refundJson?.error?.code as string | undefined;
    if (stripeCode === 'charge_already_refunded') {
      return NextResponse.json(
        {
          error: 'refund_already_refunded',
          message: 'A refund was already issued for your first payment. If you do not see it on your statement within 10 business days, contact hello@rankall.io and we will help.',
        },
        { status: 409 },
      );
    }
    console.error('refund Stripe refund error:', refundJson?.error ?? refundRes.status);
    return NextResponse.json(
      {
        error: 'refund_failed',
        message: 'Stripe could not process your refund. Nothing was refunded and your subscription was not changed. Please try again, or contact hello@rankall.io and we will help.',
      },
      { status: 502 },
    );
  }

  // Cancel the subscription so the refunded user is NOT charged again
  // next period. The subscription.deleted webhook downgrades them to Free.
  // A failed cancel after a successful refund still returns success for
  // the refund — with a plain warning that the subscription still needs
  // cancelling — because claiming otherwise would be a lie.
  let subscriptionCancelled = false;
  let cancelWarning: string | null = null;
  if (subscriptionId) {
    try {
      // cancellation_details.comment tells the subscription.deleted webhook
      // this was a refund, so it does not send a second "cancelled —
      // reactivate" email on top of the refund confirmation below.
      const cancelRes = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ 'cancellation_details[comment]': 'money_back_refund' }).toString(),
      });
      subscriptionCancelled = cancelRes.ok;
      if (!cancelRes.ok) {
        console.error('refund subscription cancel failed:', await cancelRes.text().catch(() => ''));
      }
    } catch (err) {
      console.error('refund subscription cancel error:', err);
    }
  } else {
    console.warn('refund: no Stripe subscription id for user', user.id);
  }
  if (!subscriptionCancelled) {
    cancelWarning =
      'Your refund was issued, but we could not cancel your subscription automatically. Please cancel it from Manage Billing or contact hello@rankall.io so you are not charged again.';
  }

  // Confirmation email — best-effort. A failed send never fails the refund.
  try {
    const email = user.email || '';
    const resendKey = process.env.RESEND_API_KEY;
    if (email && resendKey) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Rankall.io <hello@rankall.io>',
          to: [email],
          subject: 'Your Rankall refund is on its way',
          html: `<p>Your refund of <strong>${formatRefundAmount(eligibility.amountCents, eligibility.currency)}</strong> has been issued to your original payment method. It can take 5–10 business days to appear on your statement.</p><p>Your subscription has been cancelled and your account moved to the Free plan — your scans and data stay. We'd love to have you back any time.</p>`,
        }),
      });
    }
  } catch (err) {
    console.error('refund confirmation email error:', err);
  }

  return NextResponse.json({
    success: true,
    refundId: refundJson.id,
    refundStatus: refundJson.status ?? 'succeeded',
    amount: formatRefundAmount(eligibility.amountCents, eligibility.currency),
    subscriptionCancelled,
    cancelWarning,
    message:
      'Your refund has been issued. It can take 5–10 business days to appear on your statement. Your subscription has been cancelled and your account moved to the Free plan.',
  });
}
