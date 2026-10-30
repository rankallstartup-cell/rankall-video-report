import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { refundEligibility, listAllCharges, stripeChargesPager, refundAlreadyClaimed, refundClaimsOrFilter } from '@/lib/moneyBack';
import { chargeIdentityKey } from '@/lib/paymentIdentity';

// GET /api/billing/refund-eligibility — 14-day money-back guarantee (b28k).
//
// Answers "can this user get a refund right now?" from Stripe charges, the
// source of truth for what was actually paid. No DB migration: the window
// is computed from the customer's first succeeded charge; prior refunds by
// the same person (user id or card fingerprint) come from money_back_refunds.
//
// Identity: the caller is ALWAYS the session user — the route never trusts
// a client-supplied userId (b01t). A user can only check their own refund.

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

export async function GET(req: NextRequest) {
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

  // Stripe customer id from the subscriptions row (session user only).
  let customerId: string | null = null;
  try {
    const { data } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();
    customerId = (data as { stripe_customer_id?: string | null } | null)?.stripe_customer_id ?? null;
  } catch (err) {
    console.error('refund-eligibility subscription lookup error:', err);
  }
  if (!customerId) {
    return NextResponse.json({
      eligible: false,
      reason: 'no_payment',
      firstPaidAt: null,
      deadline: null,
      chargeId: null,
      amountCents: null,
      currency: null,
    });
  }

  // Charges are the source of truth for what was paid and when (all pages).
  const charges = await listAllCharges(stripeChargesPager(customerId, process.env.STRIPE_SECRET_KEY));
  if (!charges) {
    return NextResponse.json(
      {
        error: 'stripe_error',
        message: 'Could not check your refund eligibility right now. Please try again, or contact hello@rankall.io and we will help.',
      },
      { status: 502 },
    );
  }
  const eligibility = refundEligibility(charges);
  // Once per person: a prior refund by this user or this card means the
  // guarantee is used, even on a new Stripe customer.
  if (eligibility.eligible) {
    // Same payer key as /api/billing/refund (card fingerprint → billing
    // email hash): the old card-fingerprint-only lookup showed a Link payer
    // who had already claimed as "eligible", and the refund then failed.
    const fp = chargeIdentityKey(charges.find((c) => c.id === eligibility.chargeId) as Parameters<typeof chargeIdentityKey>[0]);
    try {
      const { data: claims, error } = await supabaseAdmin
        .from('money_back_refunds')
        .select('user_id, card_fingerprint')
        .or(refundClaimsOrFilter(user.id, fp));
      if (!error && refundAlreadyClaimed(claims as { user_id?: string; card_fingerprint?: string }[], user.id, fp)) {
        return NextResponse.json({ ...eligibility, eligible: false, reason: 'already_refunded' });
      }
    } catch (err) {
      console.error('refund-eligibility claims lookup error:', err);
    }
  }
  return NextResponse.json(eligibility);
}
