import { NextResponse } from 'next/server';
import { isStripeReady, getPriceConfigStatus } from '@/lib/stripeProducts';

// Exposes Stripe readiness to client components. isStripeReady() reads the
// server-only STRIPE_SECRET_KEY, so the client must ask the server.
// `prices` reports which plan/interval prices are configured (booleans
// only — no ids), e.g. annual prices still being placeholders.
export const dynamic = 'force-dynamic';

export async function GET() {
  const { prices } = getPriceConfigStatus();
  return NextResponse.json({ ready: isStripeReady(), prices });
}
