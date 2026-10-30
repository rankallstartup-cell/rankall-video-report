import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

// Password-recovery gate state. While the httpOnly `rk_pw_recovery` cookie
// is set, proxy.ts sends the (recovery) session back to /reset-password from
// any app page, so a recovery link can't be used to walk into the dashboard
// without choosing a new password.
//   POST { action: 'start' } — set by the reset page when Supabase fires
//     PASSWORD_RECOVERY (implicit/hash flow; the code flow sets it in
//     /auth/callback).
//   POST { action: 'done' }  — cleared after updateUser({ password }) works.
// Both need a session; setting the flag only ever restricts the caller.
const COOKIE = 'rk_pw_recovery';

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { action } = await req.json().catch(() => ({ action: null }));
  const res = NextResponse.json({ ok: true });
  if (action === 'start') {
    res.cookies.set(COOKIE, '1', {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60,
    });
  } else if (action === 'done') {
    res.cookies.set(COOKIE, '', { path: '/', maxAge: 0 });
  } else {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
  return res;
}
