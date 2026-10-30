import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

// GET /api/referral/click?ref=CODE — records a click and redirects home with the
// rankall_ref cookie set (30 days). Best-effort: a logging failure never blocks
// the redirect.
export async function GET(req: NextRequest) {
  const refCode = (req.nextUrl.searchParams.get('ref') || '').trim();
  const home = new URL('/', req.nextUrl.origin);

  if (refCode) {
    try {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
      const ipHash = ip ? createHash('sha256').update(ip).digest('hex').slice(0, 32) : null;
      const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } },
      );
      await admin.from('referral_clicks').insert({ ref_code: refCode.toUpperCase(), ip_hash: ipHash });
    } catch { /* best effort */ }
  }

  const res = NextResponse.redirect(home);
  if (refCode) {
    res.cookies.set('rankall_ref', refCode.toUpperCase(), { maxAge: 2592000, path: '/' });
  }
  return res;
}
