import { createServerClient } from '@supabase/ssr';
import { DASHBOARD_PREFIX_PAGEKEY } from '@/lib/dashboardAccess';
import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { COUNTRY_CONFIGS, DEFAULT_COUNTRY, type CountryCode } from '@/lib/countryConfig';
import { getPlanConfig, isAdminUser, resolvePlanFromSources, type PlanType } from '@/lib/planConfig';
import { isAuthRequiredPath, isRecoveryGatedPath, loginRedirectPath } from '@/lib/safeRedirect';

function resolveValidCountry(raw: string): CountryCode | null {
  return COUNTRY_CONFIGS[raw as CountryCode] ? (raw as CountryCode) : null;
}

// azxd: locale stubs are gone — /ie, /nz, /sg, /ae, /za, /ng, /ke, /gh, /ph
// used to be client JS-redirect stubs (cookie + router.replace to
// /?country=XX, rendering 'Loading…'). A client redirect is a soft-404
// with a duplicate homepage title for crawlers. These 301s replace them
// server-side: same target the stubs used (/?country=XX, other query
// params like UTM preserved), plus the country_override cookie the stub
// used to set via document.cookie — nothing reads ?country=; the country
// is resolved from the country_override cookie by the logic below.
// No localized pages exist (all content is US-English), so there is no
// hreflang: these URLs are redirects, not content.
const LOCALE_REDIRECTS: Record<string, CountryCode> = {
  ie: 'IE', nz: 'NZ', sg: 'SG', ae: 'AE', za: 'ZA',
  ng: 'NG', ke: 'KE', gh: 'GH', ph: 'PH',
};

// b062: resolve the plan for middleware enforcement. Queries the
// subscriptions table with the service-role key (bypasses RLS) — the
// proxy cannot trust the JWT's user_metadata, and the anon-key client
// cannot be relied on for the authoritative row. Falls back to
// app_metadata when there is no subscriptions row or no service key.
async function resolvePlanForProxy(userId: string, appMetadata: unknown): Promise<PlanType> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceKey) {
    try {
      const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
      const { data: sub } = await admin
        .from('subscriptions')
        .select('plan, status, trial_end')
        .eq('user_id', userId)
        .in('status', ['active', 'trialing', 'past_due'])
        .limit(1)
        .maybeSingle();
      return resolvePlanFromSources(
        sub as { plan?: string | null; status?: string | null; trial_end?: string | null } | null,
        appMetadata,
      );
    } catch { /* fall through to app_metadata-only */ }
  }
  return resolvePlanFromSources(null, appMetadata);
}

export async function proxy(request: NextRequest) {
  // ── Locale stub 301 (azxd) ───────────────────────────────────────────
  // Before any session work: these routes are pure redirects.
  {
    const url = new URL(request.url);
    const slug = url.pathname.replace(/^\/|\/$/g, '');
    const country = LOCALE_REDIRECTS[slug];
    if (country) {
      url.pathname = '/';
      url.searchParams.set('country', country);
      const redirect = NextResponse.redirect(url, 301);
      redirect.cookies.set('country_override', country, { path: '/', maxAge: 86400, sameSite: 'lax' });
      return redirect;
    }
  }

  let supabaseResponse = NextResponse.next({ request });

  // ── Supabase session refresh ───────────────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let userEmail: string | undefined;
  if (supabaseUrl && supabaseKey) {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    });
    const { data: userData } = await supabase.auth.getUser();
    userEmail = userData?.user?.email;

    // ── Sign-in gate ──────────────────────────────────────────────────────
    // A logged-out visitor to an app page goes to /login and comes back
    // after signing in. Before this, every dashboard route rendered its
    // shell (and a stale "Sign out" button) to anonymous visitors.
    {
      const url = new URL(request.url);
      if (!userData?.user && isAuthRequiredPath(url.pathname)) {
        return NextResponse.redirect(new URL(loginRedirectPath(url.pathname, url.search), request.url));
      }
    }

    // ── Password-recovery gate ────────────────────────────────────────────
    // A session that came from a reset link (rk_pw_recovery, set by
    // /auth/callback or /reset-password/state) must choose a new password
    // before using the app. API routes and the reset page itself pass.
    {
      const pathname = new URL(request.url).pathname;
      const recovering = request.cookies.get('rk_pw_recovery')?.value === '1';
      if (recovering && userData?.user && isRecoveryGatedPath(pathname)) {
        return NextResponse.redirect(new URL('/reset-password', request.url));
      }
    }

    // ── Admin route protection (edge) ─────────────────────────────────────
    // Block ALL /admin/* routes for non-admins before any page renders. This
    // is the real security boundary; page-level guards are defense in depth.
    {
      const pathname = new URL(request.url).pathname;
      if (pathname.startsWith('/admin') && !isAdminUser(userEmail)) {
        // b88m/b88n/b88p/b88q/b88r/b88v/b88w: say why — the dashboard shows
        // "This page is restricted to Rankall admins only." for ?restricted=1
        // (same notice useAdminGuard already uses). Logged-out visitors never
        // reach here: the sign-in gate above sends them to /login first.
        return NextResponse.redirect(new URL('/dashboard?restricted=1', request.url));
      }
    }

    // ── Plan enforcement ─────────────────────────────────────────────────
    // Source of truth is getPlanConfig(plan).dashboardPages — the SAME data the
    // sidebar and PlanGuard use — so the middleware can never disagree with them.
    // getPlanConfig() normalizes the plan internally, so legacy names
    // (local_pro → business, personal_pro → starter, etc.) and the new
    // starter/business names all resolve correctly. Admins bypass entirely.
    //
    // b062: the plan comes from resolvePlanForProxy (subscriptions via
    // service-role → app_metadata → free). NEVER user_metadata — any
    // signed-in user can set their own user_metadata via updateUser()
    // and self-grant a paid plan. The subscriptions query runs only
    // for gated dashboard paths and non-admins, so other requests pay
    // no extra DB hit.
    {
      const pathname = new URL(request.url).pathname;
      // Map a dashboard path prefix → the dashboardPages key that unlocks it.
      // b01u: the map lives in lib/dashboardAccess so the sidebar links only
      // the pages this check lets through.
      const PREFIX_PAGEKEY = DASHBOARD_PREFIX_PAGEKEY;

      // ax86: the imported isAdminUser() normalizes (lowercase+trim) —
      // the old local Set used an exact match.
      if (!isAdminUser(userEmail)) {
        const gated = PREFIX_PAGEKEY.some((route) => pathname.startsWith(route.prefix));
        if (gated && userData?.user?.id) {
          const rawPlan = await resolvePlanForProxy(userData.user.id, userData.user.app_metadata);
          const cfg = getPlanConfig(rawPlan);
          if (!cfg.canSeeEverything) {
            for (const route of PREFIX_PAGEKEY) {
              if (pathname.startsWith(route.prefix) && !cfg.dashboardPages.includes(route.pageKey)) {
                return NextResponse.redirect(new URL('/pricing', request.url));
              }
            }
          }
        }
      }
    }
  }

  // ── Resolve country ────────────────────────────────────────────────────
  const { searchParams } = new URL(request.url);
  const qpOverride = searchParams.get('country_override');
  const cookieOverride = request.cookies.get('country_override')?.value ?? null;

  let country: CountryCode = DEFAULT_COUNTRY;
  let usingOverride = false;

  if (qpOverride) {
    const valid = resolveValidCountry(qpOverride.toUpperCase());
    if (valid) {
      country = valid;
      usingOverride = true;
    }
  } else if (cookieOverride) {
    const valid = resolveValidCountry(cookieOverride.toUpperCase());
    if (valid) { country = valid; usingOverride = true; }
  }

  if (!usingOverride) {
    const geoRaw = request.headers.get('x-vercel-ip-country') ?? '';
    country = resolveValidCountry(geoRaw) ?? DEFAULT_COUNTRY;
  }

  // Forward resolved country as a request header so server components can read it
  // via headers() — cookies() only sees incoming request cookies, not ones set by this proxy.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-rankall-country', country);

  const finalResponse = NextResponse.next({ request: { headers: requestHeaders } });

  // Copy Supabase session cookies onto the final response
  supabaseResponse.cookies.getAll().forEach(({ name, value, ...opts }) => {
    finalResponse.cookies.set(name, value, opts as Parameters<typeof finalResponse.cookies.set>[2]);
  });

  // Stamp country cookies for client components and API routes
  const isAdmin = isAdminUser(userEmail);
  // b87h: a Set-Cookie on every response made Vercel mark ISR pages
  // (/business/*, blog, programmatic pages) "private, no-store", so they
  // were never cached. Only write these cookies when their value changes.
  const overriddenFlag = usingOverride ? '1' : '0';
  if (request.cookies.get('rankall_country')?.value !== country) {
    finalResponse.cookies.set('rankall_country', country, { path: '/', maxAge: 86400, sameSite: 'lax' });
  }
  if (request.cookies.get('rankall_country_overridden')?.value !== overriddenFlag) {
    finalResponse.cookies.set('rankall_country_overridden', overriddenFlag, { path: '/', maxAge: 86400, sameSite: 'lax' });
  }
  if (usingOverride && qpOverride) {
    // Admin override lasts 24 h; non-admin expires after 1 h to prevent stale overrides
    finalResponse.cookies.set('country_override', country, { path: '/', maxAge: isAdmin ? 86400 : 3600, sameSite: 'lax' });
  }

  // ── Staging hygiene: never let a non-production host get indexed ─────────
  // (preview deployments, rankall-staging.vercel.app, localhost). Production
  // hosts rankall.io / www.rankall.io are untouched.
  const host = request.headers.get('host') ?? '';
  if (host !== 'rankall.io' && host !== 'www.rankall.io') {
    finalResponse.headers.set('x-robots-tag', 'noindex, nofollow');
  }

  return finalResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
