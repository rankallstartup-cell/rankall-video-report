import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isAdminUser } from '@/lib/planConfig';

export const dynamic = 'force-dynamic';

// Phase 16: sends a test email via Resend to confirm email delivery works.
async function requireAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return isAdminUser(user?.email);
}

export async function POST() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const key = process.env.RESEND_API_KEY;
  if (!key) return NextResponse.json({ sent: false, error: 'RESEND_API_KEY not set' }, { status: 400 });

  const timestamp = new Date().toISOString();
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Rankall.io <hello@rankall.io>',
        to: 'rankallstartup@gmail.com',
        subject: 'Rankall Health Check Email ✅',
        text: `This is a test email from Rankall.io health check.\nSent at: ${timestamp}\nResend API: Working correctly`,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json({ sent: false, error: `Resend HTTP ${res.status}: ${detail}` }, { status: 502 });
    }
    return NextResponse.json({ sent: true, to: 'rankallstartup@gmail.com', timestamp });
  } catch (e) {
    return NextResponse.json({ sent: false, error: String(e) }, { status: 500 });
  }
}
