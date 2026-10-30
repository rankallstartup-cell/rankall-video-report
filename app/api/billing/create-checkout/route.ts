import { trackFunnelEvent, readSourceCookie } from '@/lib/funnel';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { getStripePrice } from '@/lib/stripeProducts';
import { checkRateLimitDb, clientIpFromHeaders } from '@/lib/rateLimit';
import {
  EMAIL_NOT_VERIFIED_MESSAGE,
  TRIAL_CHECKOUT_RATE_LIMIT,
  TRIAL_RATE_LIMIT_MESSAGE,
  isTrialEligible,
} from '@/lib/trialAntiAbuse';
import { CHECKOUT_SESSION_TTL_SECONDS, openCheckoutAction, parseOpenCheckout } from '@/lib/checkoutGuard';

// Stripe via REST (fetch) only — never the `stripe` SDK.
export const dynamic = 'force-dynamic';

// personal_pro is the canonical personal track; 'starter' kept for back-compat.
const VALID_PLANS = ['personal_pro', 'starter', 'business', 'agency'];

// Trial policy (founder decision, ticket b28f): paid plans get a 7-DAY
// free trial with the credit card collected UPFRONT, before the trial
// starts. The card is NOT charged until the trial ends (cancel anytime
// before then and you pay nothing). The trial length is set HERE, in
// code — subscription_data[trial_period_days] overrides any trial
// configured on the Stripe Price in the dashboard, so the code is the
// single source of truth. payment_method_collection 'always' means
// Stripe collects the card at checkout even though the first payment
// is $0 (i.e. during the trial).
const TRIAL_PERIOD_DAYS = 7;

export async function POST(req: NextRequest) {
  // ax6p: parse the body FIRST — both waitlist fallbacks below must
  // carry the buyer's plan + interval, or the waitlist entry loses
  // them (the old code returned a bare '/waitlist', so an annual
  // buyer was recorded as plan 'general', monthly).
  const { plan: bodyPlan, interval: bodyInterval = 'monthly', countryCode = 'US' } = await req.json().catch(() => ({} as Record<string, unknown>));
  const normInterval = bodyInterval === 'annual' ? 'annual' : 'monthly';
  const waitlistUrl = `/waitlist?plan=${encodeURIComponent(typeof bodyPlan === 'string' ? bodyPlan : '')}&interval=${normInterval}`;
  // Stripe not configured yet → graceful 503 pointing at the waitlist.
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: 'stripe_not_configured', message: 'Payments launching soon. Join the waitlist.', waitlistUrl },
      { status: 503 },
    );
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // b28j trial anti-abuse: rate-limit checkout-session creation (the trial
  // entry point) per user + per IP in the SHARED rate_limits table (an
  // in-memory bucket is per serverless instance, i.e. useless). The IP is
  // the platform-set client IP, never the client-supplied first XFF entry.
  const ip = clientIpFromHeaders(req.headers);
  const [userRl, ipRl] = await Promise.all([
    checkRateLimitDb('checkout:user', user.id, TRIAL_CHECKOUT_RATE_LIMIT.perUser),
    checkRateLimitDb('checkout:ip', ip, TRIAL_CHECKOUT_RATE_LIMIT.perIp),
  ]);
  if (!userRl.allowed || !ipRl.allowed) {
    return NextResponse.json(
      { error: 'trial_rate_limited', message: TRIAL_RATE_LIMIT_MESSAGE },
      { status: 429 },
    );
  }

  // b28j: a trial cannot start until the email is verified. Supabase marks
  // this via email_confirmed_at (null until the user clicks the confirmation
  // link). The client shows the message + a resend-verification path.
  if (!user.email_confirmed_at) {
    return NextResponse.json(
      {
        error: 'email_not_verified',
        message: EMAIL_NOT_VERIFIED_MESSAGE,
        resendUrl: '/api/auth/resend-verification',
      },
      { status: 403 },
    );
  }

  const plan = bodyPlan;

  if (!VALID_PLANS.includes(plan)) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  }

  const priceId = getStripePrice(plan, normInterval, countryCode);
  if (!priceId) {
    return NextResponse.json(
      { error: 'price_not_configured', message: 'This plan is not yet available. Join the waitlist.', waitlistUrl },
      { status: 503 },
    );
  }

  // Prices are USD everywhere — checkout always charges USD.
  const currency = 'usd';
  const stripeKey = process.env.STRIPE_SECRET_KEY!;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://rankall.io';

  async function stripe(path: string, params: Record<string, string>) {
    const r = await fetch(`https://api.stripe.com/v1/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    });
    const json = await r.json();
    return { ok: r.ok, json };
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    // Existing subscription state from the subscriptions table (service
    // role). Stripe ids are NEVER read from user_metadata — any user can
    // rewrite it, and clearing it used to yield a new customer (= a new
    // trial and a new refund window).
    type SubRow = { status?: string | null; stripe_customer_id?: string | null; stripe_subscription_id?: string | null };
    let subRow = null as SubRow | null;
    let subLookupOk = true;
    {
      const { data, error } = await admin
        .from('subscriptions')
        .select('status, stripe_customer_id, stripe_subscription_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) {
        subLookupOk = false;
        console.error('create-checkout subscriptions lookup error:', error);
      } else {
        subRow = (data as SubRow | null) ?? null;
      }
    }

    // Already subscribed → manage it instead of opening a second subscription.
    if (subRow?.stripe_subscription_id && ['active', 'trialing', 'past_due', 'unpaid'].includes(subRow.status ?? '')) {
      return NextResponse.json(
        { error: 'already_subscribed', message: 'You already have a subscription. Manage or change it from your billing page.', billingUrl: '/dashboard/billing' },
        { status: 409 },
      );
    }

    // Reuse the Stripe customer: subscriptions row → app_metadata.
    const am = (user.app_metadata ?? {}) as Record<string, unknown>;
    let customerId: string | undefined =
      (subRow?.stripe_customer_id as string | undefined) ||
      (typeof am.stripe_customer_id === 'string' && am.stripe_customer_id ? am.stripe_customer_id : undefined);
    const hadStripeCustomer = !!customerId;

    // One trial per account EVER: no trial if the user has any prior
    // subscriptions row, or their Stripe customer ever had a trial.
    let stripeSubs: Array<{ trial_start?: number | null; trial_end?: number | null }> | null = null;
    if (customerId) {
      try {
        const r = await fetch(
          `https://api.stripe.com/v1/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=100`,
          { headers: { Authorization: `Bearer ${stripeKey}` } },
        );
        if (r.ok) {
          const j = await r.json();
          stripeSubs = Array.isArray(j?.data) ? j.data : null;
        }
      } catch (err) {
        console.error('create-checkout prior-subscription lookup error:', err);
      }
    }
    const trialEligible = isTrialEligible({
      hasSubscriptionRow: subLookupOk ? !!subRow : null,
      stripeSubscriptions: stripeSubs,
      hadStripeCustomer,
    });

    if (!customerId) {
      const cust = await stripe('customers', {
        email: user.email ?? '',
        'metadata[supabase_user_id]': user.id,
        'metadata[plan]': plan,
        'metadata[country]': countryCode,
      });
      if (!cust.ok) return NextResponse.json({ error: 'checkout_failed', message: cust.json?.error?.message ?? 'Stripe error' }, { status: 500 });
      customerId = cust.json.id as string;
      // Persist on app_metadata (admin API — not user-writable). The
      // subscriptions row is written by the webhook once Stripe creates the
      // subscription (writing a bare row here would count as a "prior
      // subscription" and cost the user their trial on a retried checkout).
      const { error: amErr } = await admin.auth.admin.updateUserById(user.id, {
        app_metadata: { stripe_customer_id: customerId },
      });
      if (amErr) console.error('create-checkout app_metadata customer persist error:', amErr);
    }

    // Idempotency (concurrent checkouts): at most ONE payable session per
    // user. Reuse a still-open session for the same plan + interval; expire
    // an open one for a different plan before creating a new one. Two
    // sessions completed at once used to create two billed subscriptions
    // (the billing webhook also cancels + refunds a duplicate as a backstop).
    const stored = parseOpenCheckout(am.open_checkout);
    const action = openCheckoutAction(stored, plan, normInterval);
    if (stored && action !== 'create') {
      const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(stored.id)}`, {
        headers: { Authorization: `Bearer ${stripeKey}` },
      });
      const cs = r.ok ? await r.json().catch(() => null) : null;
      if (cs?.status === 'complete') {
        return NextResponse.json(
          { error: 'checkout_already_completed', message: 'Your checkout already went through — your subscription is being set up. Refresh your billing page in a moment.', billingUrl: '/dashboard/billing' },
          { status: 409 },
        );
      }
      if (cs?.status === 'open' && action === 'reuse' && typeof cs.url === 'string') {
        return NextResponse.json({ url: cs.url, sessionId: cs.id, trial: stored.trial === true, reused: true });
      }
      if (cs?.status === 'open' && action === 'expire') {
        const ex = await stripe(`checkout/sessions/${encodeURIComponent(stored.id)}/expire`, {});
        if (!ex.ok && ex.json?.error?.code !== 'checkout_session_expired') {
          return NextResponse.json(
            { error: 'checkout_in_progress', message: 'You have another checkout open. Finish or close it, then try again in a minute.' },
            { status: 409 },
          );
        }
      }
    }

    // Forward a captured referral code into Stripe metadata so the webhook can
    // attribute the conversion server-side (it has no access to the cookie).
    const refCode = req.cookies.get('rankall_ref')?.value || '';

    // Card-upfront 7-day Stripe trial for eligible accounts only; everyone
    // else is charged at checkout (Stripe shows the amount due today). The
    // retired in-app-trial path (trial_end = in-app trial end, card
    // 'if_required') is gone — a trial_end can never be sent from here.
    const expiresAt = Math.floor(Date.now() / 1000) + CHECKOUT_SESSION_TTL_SECONDS;
    const session = await stripe('checkout/sessions', {
      mode: 'subscription',
      expires_at: String(expiresAt),
      customer: customerId,
      currency,
      payment_method_collection: 'always',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      success_url: `${appUrl}/dashboard?upgraded=true`,
      cancel_url: `${appUrl}/pricing?cancelled=true`,
      'metadata[user_id]': user.id,
      'metadata[plan]': plan,
      'metadata[country]': countryCode,
      ...(refCode ? { 'metadata[ref_code]': refCode } : {}),
      ...(trialEligible ? { 'subscription_data[trial_period_days]': String(TRIAL_PERIOD_DAYS) } : {}),
      'subscription_data[metadata][user_id]': user.id,
      'subscription_data[metadata][plan]': plan,
    });
    if (!session.ok) return NextResponse.json({ error: 'checkout_failed', message: session.json?.error?.message ?? 'Stripe error' }, { status: 500 });

    // Remember the open session (app_metadata — service role only).
    {
      const { error: ocErr } = await admin.auth.admin.updateUserById(user.id, {
        app_metadata: { open_checkout: { id: session.json.id, plan, interval: normInterval, expires_at: expiresAt, trial: trialEligible } },
      });
      if (ocErr) console.error('create-checkout open_checkout persist error:', ocErr);
    }

    // CONV-00: funnel instrumentation (fire-and-forget, never throws).
    if (trialEligible) {
      const __src = readSourceCookie(req);
      trackFunnelEvent({
        event: 'trial_started',
        userId: user.id,
        email: user.email ?? null,
        ...(__src.hasRefCode ? { source: 'influencer' as const } : __src),
        metadata: { plan, ref_code: refCode ?? null },
      });
    }

    return NextResponse.json({ url: session.json.url, sessionId: session.json.id, trial: trialEligible });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return NextResponse.json({ error: 'checkout_failed', message: String(err) }, { status: 500 });
  }
}
