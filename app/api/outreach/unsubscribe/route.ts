import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyUnsubscribeToken } from '@/lib/outreachGuard';

export const dynamic = 'force-dynamic';

// Requires the HMAC token from the email's unsubscribe link: without it
// anyone could unsubscribe any address (suppressing a competitor's or a
// customer's mail). Fails closed when the signing secret is unset.
export async function POST(req: NextRequest) {
  try {
    const { email, token } = await req.json();
    if (!email || typeof email !== 'string') return NextResponse.json({ error: 'email required' }, { status: 400 });
    if (typeof token !== 'string' || !verifyUnsubscribeToken(email.trim(), token.trim())) {
      return NextResponse.json({ error: 'Invalid or missing unsubscribe token' }, { status: 403 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    await supabase.from('outreach_unsubscribes').insert({
      email: email.trim().toLowerCase(),
      unsubscribed_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('unsubscribe error:', err);
    return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 });
  }
}
