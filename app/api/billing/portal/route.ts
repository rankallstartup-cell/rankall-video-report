import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

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

export async function POST() {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: 'Stripe not configured', message: 'Launching June 27' },
        { status: 503 }
      );
    }

    // b01t: the user is ALWAYS the session user. Any body userId is
    // ignored (the old code trusted it, so anyone could open a billing
    // portal for a victim's subscription).
    const sessionSupabase = await createServerSupabaseClient();
    const { data: { user } } = await sessionSupabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const userId = user.id;

    let customerId: string | null = null;
    try {
      const { data } = await supabaseAdmin
        .from('subscriptions')
        .select('stripe_customer_id')
        .eq('user_id', userId)
        .maybeSingle();
      customerId = (data as any)?.stripe_customer_id ?? null;
    } catch (err) {
      console.error('portal subscription lookup error:', err);
    }

    if (!customerId) {
      return NextResponse.json({ error: 'No active subscription found' }, { status: 404 });
    }

    const params = new URLSearchParams();
    params.append('customer', customerId);
    params.append('return_url', 'https://www.rankall.io/dashboard/billing');

    const res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const session: any = await res.json();
    if (!res.ok || !session?.url) {
      console.error('Stripe portal error:', session);
      return NextResponse.json({ error: 'Failed to create portal session' }, { status: 500 });
    }

    return NextResponse.json({ portalUrl: session.url });
  } catch (err) {
    console.error('portal error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
