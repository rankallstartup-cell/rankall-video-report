import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { checkRateLimitDb, clientIpFromHeaders } from '@/lib/rateLimit';
import { RESEND_RATE_LIMIT, RESEND_RATE_LIMIT_MESSAGE } from '@/lib/trialAntiAbuse';

// POST /api/auth/resend-verification — resend the Supabase signup
// confirmation email to the currently signed-in user (b28j trial
// anti-abuse: the pricing page offers this path when checkout is blocked
// for an unverified email).
//
// Auth-gated and scoped to the caller's own email only — it never accepts
// an email in the body, so it cannot be used to spam someone else's inbox.
// Rate-limited per user + per IP. Returns 200 with alreadyVerified when
// the email is already confirmed.
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (user.email_confirmed_at) {
    return NextResponse.json({
      alreadyVerified: true,
      message: 'Your email is already verified — you can start your trial.',
    });
  }

  if (!user.email) {
    return NextResponse.json(
      { error: 'no_email', message: 'No email on this account — contact support.' },
      { status: 400 },
    );
  }

  // Shared DB-backed limiter + trusted client IP (lib/rateLimit).
  const ip = clientIpFromHeaders(req.headers);
  const [userRl, ipRl] = await Promise.all([
    checkRateLimitDb('resend:user', user.id, RESEND_RATE_LIMIT.perUser),
    checkRateLimitDb('resend:ip', ip, RESEND_RATE_LIMIT.perIp),
  ]);
  if (!userRl.allowed || !ipRl.allowed) {
    return NextResponse.json(
      { error: 'resend_rate_limited', message: RESEND_RATE_LIMIT_MESSAGE },
      { status: 429 },
    );
  }

  const { error } = await supabase.auth.resend({ type: 'signup', email: user.email });
  if (error) {
    console.error('resend-verification error:', error.message);
    return NextResponse.json(
      { error: 'resend_failed', message: 'Could not send the verification email — please try again in a bit.' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    sent: true,
    message: 'Verification email sent — check your inbox.',
  });
}
