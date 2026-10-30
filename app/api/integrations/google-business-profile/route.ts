import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { checkOAuthState, clearOAuthStateCookie, issueOAuthState, readOAuthStateCookie, setOAuthStateCookie } from '@/lib/oauthState';

// Service-role client — bypasses RLS for user_integrations reads/writes (still
// scoped to the authenticated user's id). Auth itself uses the anon/cookie client.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Business Profile management scope. Same Google Cloud project / credentials as
// the existing GSC integration — only the scope and integration_type differ.
const GBP_SCOPE = 'https://www.googleapis.com/auth/business.manage';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://rankall.io';

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (cookies) => cookies.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Google OAuth not configured', setup_required: true }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const code = searchParams.get('code');

  // Step 1: Initiate OAuth
  if (action === 'connect') {
    const redirectUri = `${APP_URL}/api/integrations/google-business-profile?action=callback`;
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', GBP_SCOPE);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    // 'gbp' state distinguishes this callback from the GSC flow.
    const { state, nonce } = issueOAuthState('gbp');
    authUrl.searchParams.set('state', state);
    return setOAuthStateCookie(NextResponse.redirect(authUrl.toString()), 'gbp', nonce);
  }

  // Step 2: Handle OAuth callback
  if (action === 'callback' && code) {
    // Always the session user — the old `searchParams.get('user_id') || user.id`
    // let a crafted callback write tokens onto any account.
    const userId = user.id;
    if (!checkOAuthState('gbp', searchParams.get('state'), readOAuthStateCookie(req, 'gbp'))) {
      return clearOAuthStateCookie(NextResponse.redirect(`${APP_URL}/dashboard?oauth_error=state_mismatch`), 'gbp');
    }
    // Static redirect URI (must match exactly what was sent in connect + what's
    // registered in Google Cloud Console) — no dynamic user_id. The user is
    // re-derived from the auth cookie above via supabase.auth.getUser().
    const redirectUri = `${APP_URL}/api/integrations/google-business-profile?action=callback`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || tokenData.error) {
      return NextResponse.redirect(`${APP_URL}/dashboard/social-content?gbp_error=auth_failed`);
    }

    // Try to resolve the user's first GBP location. The Business Profile APIs are
    // gated by Google — until the project's access request is approved these calls
    // return 403. In that case we still persist the tokens and flag the location as
    // 'pending_approval' so the connection completes and starts working the moment
    // Google grants access (no re-auth needed).
    let siteUrl = 'pending_approval';
    try {
      const acctRes = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (acctRes.ok) {
        const acctData = await acctRes.json();
        const firstAccount: string | undefined = acctData.accounts?.[0]?.name; // e.g. "accounts/123"
        if (firstAccount) {
          // List locations under that account (Business Information API).
          const locRes = await fetch(
            `https://mybusinessbusinessinformation.googleapis.com/v1/${firstAccount}/locations?readMask=name,title&pageSize=1`,
            { headers: { Authorization: `Bearer ${tokenData.access_token}` } },
          );
          if (locRes.ok) {
            const locData = await locRes.json();
            const firstLoc = locData.locations?.[0]; // { name: "locations/456", title: "..." }
            if (firstLoc?.name) {
              // Store the full resource path the v4 localPosts API expects as the
              // parent: accounts/{id}/locations/{id}.
              const locId = String(firstLoc.name).split('/').pop();
              siteUrl = `${firstAccount}/locations/${locId}`;
            } else {
              siteUrl = firstAccount; // account connected, no locations yet
            }
          } else {
            siteUrl = firstAccount;
          }
        }
      }
      // acctRes not ok (e.g. 403 not approved) → keep 'pending_approval'.
    } catch {
      // Network / API error — persist tokens anyway, stay pending.
    }

    await supabaseAdmin.from('user_integrations').upsert({
      user_id: userId,
      integration_type: 'google_business_profile',
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expires_at: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString(),
      site_url: siteUrl,
    }, { onConflict: 'user_id,integration_type' });

    const flag = siteUrl === 'pending_approval' ? 'gbp_pending=1' : 'gbp_connected=1';
    return clearOAuthStateCookie(NextResponse.redirect(`${APP_URL}/dashboard/social-content?${flag}`), 'gbp');
  }

  // Status check
  const { data: integration } = await supabaseAdmin
    .from('user_integrations')
    .select('*')
    .eq('user_id', user.id)
    .eq('integration_type', 'google_business_profile')
    .single();

  return NextResponse.json({
    connected: !!integration,
    pending: integration?.site_url === 'pending_approval',
    site_url: integration?.site_url || null,
  });
}

// Disconnect — remove the stored GBP integration for the logged-in user.
export async function DELETE(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (cookies) => cookies.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await supabaseAdmin
    .from('user_integrations')
    .delete()
    .eq('user_id', user.id)
    .eq('integration_type', 'google_business_profile');

  return NextResponse.json({ disconnected: true });
}
