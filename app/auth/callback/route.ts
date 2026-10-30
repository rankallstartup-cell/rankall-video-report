import { createServerClient } from '@supabase/ssr';
import { safeNextPath } from '@/lib/safeRedirect';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  // ax84: `next` comes from the query string — open-redirect surface.
  // The old startsWith('/') && !includes('\\') check let `/%09/evil.com`
  // and `/%0a/evil.com` through (browsers strip TAB/LF → `//evil.com`) and
  // `/.//evil.com` (resolves to a `//evil.com` path). safeNextPath rejects
  // control chars and backslashes (raw + decoded), RESOLVES against our
  // origin and requires the same origin and a single leading slash.
  const next = safeNextPath(requestUrl.searchParams.get('next'), requestUrl.origin, '/dashboard');

  // ax84: Supabase redirects expired/invalid links here with ?error= &
  // ?error_description=. The old code ignored them and silently sent the
  // user to /dashboard unauthenticated. Surface them on the login page.
  const authError = requestUrl.searchParams.get('error');
  if (authError) {
    const desc = requestUrl.searchParams.get('error_description') ?? authError;
    const login = new URL('/login', requestUrl.origin);
    login.searchParams.set('error', desc);
    return NextResponse.redirect(login);
  }

  if (!code) {
    // ax84: no ?code= means the default (implicit) email-link flow — the
    // session arrives as a #access_token hash fragment, which the browser
    // preserves across this redirect. The old code hardcoded /dashboard
    // here, dropping the reset intent (forgot-password sends
    // next=/reset-password). Honor `next` so the hash reaches the reset
    // page, where the client picks up the recovery session.
    return NextResponse.redirect(new URL(next, requestUrl.origin));
  }

  // Single response object — Supabase writes the session cookies onto it via
  // setAll. For a new user we change ONLY this response's Location header, so the
  // auth cookies (with their httpOnly/secure/sameSite options) are preserved.
  // Copying cookies to a second response would drop those options and can break
  // the session.
  const response = NextResponse.redirect(new URL(next, requestUrl.origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { session }, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  // A failed exchange (expired/used code, PKCE verifier missing) used to be
  // ignored and the user landed on `next` with no session. Surface it.
  if (exchangeError || !session) {
    const login = new URL('/login', requestUrl.origin);
    login.searchParams.set('error', exchangeError?.message || 'This sign-in link is invalid or has expired. Please try again.');
    return NextResponse.redirect(login);
  }

  // Password recovery: the reset page must be reached (and must force a new
  // password before anything else). Recovery links carry next=/reset-password;
  // also honour Supabase's type=recovery marker. The flag cookie lets the
  // proxy keep a recovery session on /reset-password until it is used.
  const isRecovery = next === '/reset-password' || requestUrl.searchParams.get('type') === 'recovery';
  if (isRecovery) {
    response.headers.set('location', new URL('/reset-password', requestUrl.origin).toString());
    response.cookies.set('rk_pw_recovery', '1', {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60,
    });
    return response;
  }

  const user = session.user;
  if (user) {
    const meta = user.user_metadata || {};
    const appMeta = user.app_metadata || {};
    // A new user has no plan recorded anywhere and has not completed
    // onboarding — so returning/paid users are never re-onboarded. This only
    // decides ROUTING + the welcome email (nothing granted), and the account
    // must be fresh so a user who clears their own user_metadata can't replay
    // the new-user path.
    const createdMs = user.created_at ? new Date(user.created_at).getTime() : 0;
    const freshAccount = Date.now() - createdMs < 7 * 24 * 60 * 60 * 1000;
    const isNewUser = freshAccount &&
      !meta.account_type && !meta.plan_type && !appMeta.account_type && !meta.onboarded;

    if (isNewUser) {
      // Trial = Stripe checkout with the card collected upfront (7-day
      // trial_period_days). The old in-app "no card" trial created here via
      // startTrialForUser is a dead path and is no longer started; the picked
      // plan is kept as an intent so onboarding can send the user to checkout.
      const intendedPlan =
        requestUrl.searchParams.get('intended_plan') ||
        (typeof meta.plan === 'string' ? meta.plan : null) ||
        'local_pro';
      try {
        await supabase.auth.updateUser({
          data: {
            account_type: 'free',
            intended_plan: intendedPlan,
            full_name: meta.full_name || meta.name || '',
            signup_source: 'google_oauth',
            signup_date: new Date().toISOString(),
          },
        });
      } catch (err) {
        console.error('[auth/callback] updateUser failed:', err);
      }

      // Welcome email — best-effort. Route contract: { userId, email, businessName }.
      try {
        await fetch(`${requestUrl.origin}/api/welcome-email`, {
          method: 'POST',
          // Internal call: the route only trusts body.userId/email with the
          // CRON_SECRET bearer (fails closed when unset).
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` },
          body: JSON.stringify({ userId: user.id, email: user.email, businessName: null }),
        });
      } catch (err) {
        console.error('[auth/callback] welcome email failed:', err);
      }

      // Route new users to onboarding to capture business context (keeps the
      // session cookies already set on `response`).
      response.headers.set('location', new URL('/onboarding', requestUrl.origin).toString());
    }
  }

  return response;
}
