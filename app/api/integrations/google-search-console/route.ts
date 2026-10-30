import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { checkOAuthState, clearOAuthStateCookie, issueOAuthState, readOAuthStateCookie, setOAuthStateCookie } from '@/lib/oauthState';

const GSC_SCOPES = 'https://www.googleapis.com/auth/webmasters.readonly';

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
    // Static redirect URI (no per-user query params) so it can be registered
    // exactly in Google Cloud Console. `state` is a CSRF nonce (cookie-bound).
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.rankall.io'}/api/integrations/google-search-console?action=callback`;
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', GSC_SCOPES);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    const { state, nonce } = issueOAuthState('gsc');
    authUrl.searchParams.set('state', state);
    return setOAuthStateCookie(NextResponse.redirect(authUrl.toString()), 'gsc', nonce);
  }

  // Step 2: Handle OAuth callback
  if (action === 'callback' && code) {
    // Always the session user. The old code took the user id FROM `state`,
    // so a crafted callback could write tokens onto any account.
    const userId = user.id;
    if (!checkOAuthState('gsc', searchParams.get('state'), readOAuthStateCookie(req, 'gsc'))) {
      return clearOAuthStateCookie(NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL || 'https://rankall.io'}/dashboard/seo-health?gsc_error=state_mismatch`), 'gsc');
    }
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.rankall.io'}/api/integrations/google-search-console?action=callback`;

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
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL || 'https://rankall.io'}/dashboard/seo-health?gsc_error=auth_failed`);
    }

    // Get user's sites from GSC
    const sitesRes = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const sitesData = await sitesRes.json();
    const firstSite = sitesData.siteEntry?.[0]?.siteUrl || '';

    await supabase.from('user_integrations').upsert({
      user_id: userId,
      integration_type: 'google_search_console',
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expires_at: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString(),
      site_url: firstSite,
    }, { onConflict: 'user_id,integration_type' });

    return clearOAuthStateCookie(NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL || 'https://rankall.io'}/dashboard/seo-health?gsc_connected=1`), 'gsc');
  }

  // Status check
  const { data: integration } = await supabase
    .from('user_integrations')
    .select('site_url')
    .eq('user_id', user.id)
    .eq('integration_type', 'google_search_console')
    .single();

  return NextResponse.json({ connected: !!integration, site_url: integration?.site_url || null });
}
