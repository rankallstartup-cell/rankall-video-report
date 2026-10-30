import { NextRequest, NextResponse } from 'next/server';
import {
  getSessionUser,
  getBillingAdminClient,
  getOwnSubscription,
  pauseOwnSubscription,
  stripeRequest,
} from '@/lib/billingAuth';

export const dynamic = 'force-dynamic';

// POST /api/cancel-flow — retention flow for the SESSION user only.
//   step 'reason'       { reason }                    → logs feedback, returns a save offer
//   step 'accept_offer' { offer: 'pause'|'discount' } → applies it to the caller's OWN sub
//   step 'decline_offer'                              → returns the portal route
//
// Body user_id / subscription_id are ignored. The old route took both from
// the body with no session, and accept_offer ran
// pause_collection[behavior]=void on ANY subscription id — voiding a
// stranger's (or your own trial-end) invoice and granting free access.
//
// accept_offer now:
//   - 'pause'    → lib/billingAuth.pauseOwnSubscription: 30 days with a fixed
//                  resumes_at, refused while trialing / past_due (so it can
//                  never void a trial-end or overdue invoice), and access is
//                  paused too (scan route enforces app_metadata.account_paused).
//   - 'discount' → applies the retention coupon (STRIPE_RETENTION_COUPON_ID)
//                  to the caller's own subscription, once per account
//                  (app_metadata.discount_offer_used). Never touches invoices.
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const step = body.step;
  const reason = typeof body.reason === 'string' ? body.reason : '';
  const sb = getBillingAdminClient();

  if (step === 'reason') {
    try {
      const { error } = await sb.from('cancel_feedback').insert({
        user_id: user.id,
        reason: reason || 'not_specified',
        created_at: new Date().toISOString(),
      });
      if (error) console.error('cancel_feedback insert error:', error);
    } catch (err) {
      console.error('cancel_feedback insert error:', err);
    }

    let offer: { type: string; headline: string; body: string; cta: string };

    if (reason === 'too_expensive' || reason === 'not_enough_time') {
      offer = {
        type: 'pause',
        headline: reason === 'too_expensive' ? 'How about a 1-month pause instead?' : 'Life gets busy — we get it.',
        body: 'Pause your subscription for 30 days — no charges and no paid features while paused; your data and score history stay safe. Billing resumes automatically after 30 days, or resume any time. Available once every 6 months.',
        cta: 'Pause for 30 days',
      };
    } else if (reason === 'not_useful') {
      offer = {
        type: 'demo',
        headline: 'Let us show you what you might be missing.',
        body: "Book a 15-minute call and we'll walk you through the biggest AI visibility win we see for your business — free, no pressure.",
        cta: 'Book a free review call',
      };
    } else {
      offer = {
        type: 'discount',
        headline: 'Stay for 50% off next month?',
        body: "We'll apply a 50% discount to your next billing cycle. Just keep your account open.",
        cta: 'Accept 50% off',
      };
    }

    return NextResponse.json({ success: true, step: 'offer', offer });
  }

  if (step === 'accept_offer') {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: 'stripe_not_configured', message: 'Payments are not configured yet.' }, { status: 503 });
    }
    const offer = body.offer === 'discount' ? 'discount' : body.offer === 'pause' ? 'pause' : null;
    if (!offer) return NextResponse.json({ error: 'offer must be pause or discount' }, { status: 400 });

    if (offer === 'pause') {
      const r = await pauseOwnSubscription(sb, user);
      if (!r.ok) return NextResponse.json({ error: r.error, message: r.message }, { status: r.status });
      return NextResponse.json({ success: true, action: 'paused', pause_until: r.pauseUntil });
    }

    // Discount: once per account, caller's own subscription only.
    const am = (user.app_metadata ?? {}) as Record<string, unknown>;
    if (am.discount_offer_used === true) {
      return NextResponse.json(
        { error: 'discount_already_used', message: 'The retention discount has already been used on this account.' },
        { status: 409 },
      );
    }
    const coupon = process.env.STRIPE_RETENTION_COUPON_ID;
    if (!coupon) {
      return NextResponse.json(
        { error: 'discount_not_configured', message: 'This offer is not available right now. Contact hello@rankall.io and we will help.' },
        { status: 503 },
      );
    }
    const sub = await getOwnSubscription(sb, user);
    if (!sub.stripeSubscriptionId) {
      return NextResponse.json({ error: 'no_subscription', message: 'No active subscription found on your account.' }, { status: 404 });
    }
    const res = await stripeRequest(`subscriptions/${encodeURIComponent(sub.stripeSubscriptionId)}`, 'POST', {
      'discounts[0][coupon]': coupon,
    });
    if (!res.ok) {
      console.error('cancel-flow discount error:', res.json?.error ?? res.status);
      return NextResponse.json(
        { error: 'discount_failed', message: 'Could not apply the discount. Nothing was changed — please try again or contact hello@rankall.io.' },
        { status: 502 },
      );
    }
    const { error } = await sb.auth.admin.updateUserById(user.id, {
      app_metadata: { discount_offer_used: true, discount_offer_date: new Date().toISOString() },
    });
    if (error) console.error('cancel-flow discount flag error:', error);
    return NextResponse.json({ success: true, action: 'discount_applied' });
  }

  if (step === 'decline_offer') {
    const portalUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://rankall.io'}/api/billing/portal`;
    return NextResponse.json({ success: true, action: 'redirect_to_portal', portalUrl });
  }

  return NextResponse.json({ error: 'Unknown step' }, { status: 400 });
}
