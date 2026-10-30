import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, getBillingAdminClient, getOwnSubscription, stripeRequest } from '@/lib/billingAuth';

export const dynamic = 'force-dynamic';

// POST /api/billing/end-trial — "Start paid plan now" for the SESSION user.
// Ends the caller's own Stripe trial immediately (trial_end=now): Stripe
// charges the card on file now and the plan's trial caps lift once the
// customer.subscription.updated webhook records status 'active'. This is
// the "upgrade / end the trial early" path the trial-cap messages point to.
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'stripe_not_configured', message: 'Payments are not configured yet.' }, { status: 503 });
  }
  const sub = await getOwnSubscription(getBillingAdminClient(), user);
  if (!sub.stripeSubscriptionId || sub.status !== 'trialing') {
    return NextResponse.json({ error: 'not_trialing', message: 'There is no free trial in progress on your account.' }, { status: 409 });
  }
  const r = await stripeRequest(`subscriptions/${encodeURIComponent(sub.stripeSubscriptionId)}`, 'POST', { trial_end: 'now' });
  if (!r.ok) {
    console.error('end-trial Stripe error:', r.json?.error ?? r.status);
    return NextResponse.json(
      { error: 'end_trial_failed', message: 'Could not start your paid plan right now. Nothing was charged — please try again or contact hello@rankall.io.' },
      { status: 502 },
    );
  }
  return NextResponse.json({
    success: true,
    status: r.json?.status ?? null,
    message: 'Your paid plan has started and your card on file is being charged. Trial limits lift within a minute.',
  });
}
