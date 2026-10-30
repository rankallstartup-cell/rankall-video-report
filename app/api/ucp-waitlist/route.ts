import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { email, business_name } = await req.json();
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  const { error } = await supabase.from('ucp_waitlist').upsert(
    { email: email.toLowerCase().trim(), business_name: business_name || null },
    { onConflict: 'email' }
  );

  if (error) {
    console.error('UCP waitlist error:', error);
    return NextResponse.json({ error: 'Failed to join waitlist' }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "You're on the UCP waitlist!" });
}
