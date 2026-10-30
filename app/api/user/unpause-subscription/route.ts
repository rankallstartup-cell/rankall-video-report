import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, getBillingAdminClient, unpauseOwnSubscription } from '@/lib/billingAuth';

export const dynamic = 'force-dynamic';

// Resume (unpause) the authenticated user's own account: clears Stripe
// pause_collection (so invoices are no longer voided) AND the pause flags.
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const r = await unpauseOwnSubscription(getBillingAdminClient(), user);
    if (!r.ok) return NextResponse.json({ error: 'unpause_failed', message: r.message }, { status: r.status });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('unpause-subscription error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
