import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { checkOAuthState, clearOAuthStateCookie, issueOAuthState, readOAuthStateCookie, setOAuthStateCookie } from '@/lib/oauthState';

// Service-role client — bypasses RLS so the callback can persist tokens. The
// anon/JWT client (createServerClient) is blocked by RLS on user_integrations.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// GA4 read-only scope. Same Google Cloud project / credentials as GSC + GBP —
// only the scope and integration_type differ.
const GA4_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://rankall.io';

// site_url stores "<property resource>|<display name>", e.g.
// "properties/123456789|Acme Marketing Site". Data/status routes parse it.
function packSite(property: string, name: string) {
  return `${property}|${name}`;
}

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
    const redirectUri = `${APP_URL}/api/integrations/google-analytics?action=callback`;
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', GA4_SCOPE);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    const { state, nonce } = issueOAuthState('ga4');
    authUrl.searchParams.set('state', state);
    return setOAuthStateCookie(NextResponse.redirect(authUrl.toString()), 'ga4', nonce);
  }

  // Step 2: Handle OAuth callback
  if (action === 'callback' && code) {
    // Always the session user — the old `searchParams.get('user_id') || user.id`
    // let a crafted callback write tokens onto any account.
    const userId = user.id;
    if (!checkOAuthState('ga4', searchParams.get('state'), readOAuthStateCookie(req, 'ga4'))) {
      return clearOAuthStateCookie(NextResponse.redirect(`${APP_URL}/dashboard?oauth_error=state_mismatch`), 'ga4');
    }
    // Static redirect URI (must match exactly what was sent in the connect step
    // and what's registered in Google Cloud Console) — no dynamic user_id. The
    // user is re-derived from the auth cookie above via supabase.auth.getUser().
    const redirectUri = `${APP_URL}/api/integrations/google-analytics?action=callback`;

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
      return NextResponse.redirect(`${APP_URL}/dashboard/social-content?ga4_error=auth_failed`);
    }

    // Resolve the user's first GA4 property via the Admin API account summaries
    // (gives property resource + display name in one call).
    let siteUrl = 'no_properties';
    try {
      const acctRes = await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (acctRes.ok) {
        const acctData = await acctRes.json();
        const summaries = acctData.accountSummaries || [];
        for (const s of summaries) {
          const prop = s.propertySummaries?.[0];
          if (prop?.property) {
            siteUrl = packSite(prop.property, prop.displayName || prop.property);
            break;
          }
        }
      }
      // acctRes not ok (API not enabled / no access) → keep 'no_properties'.
    } catch {
      // Network error — persist tokens anyway, no property resolved.
    }

    const { error: upsertError } = await supabaseAdmin
      .from('user_integrations')
      .upsert({
        user_id: userId,
        integration_type: 'google_analytics',
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString(),
        site_url: siteUrl,
      }, { onConflict: 'user_id,integration_type' });

    if (upsertError) {
      console.error('GA4 integration save failed:', upsertError.message);
    }

    const flag = siteUrl === 'no_properties' ? 'ga4_no_properties=1' : 'ga4_connected=1';
    return clearOAuthStateCookie(NextResponse.redirect(`${APP_URL}/dashboard/social-content?${flag}`), 'ga4');
  }

  // Status check (JSON)
  const { data: integration } = await supabaseAdmin
    .from('user_integrations')
    .select('site_url')
    .eq('user_id', user.id)
    .eq('integration_type', 'google_analytics')
    .single();

  const packed = integration?.site_url || '';
  const [property, name] = packed.includes('|') ? packed.split('|') : ['', ''];
  return NextResponse.json({ connected: !!integration, propertyName: name || null, propertyId: property || null });
}

// Disconnect
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
    .eq('integration_type', 'google_analytics');

  return NextResponse.json({ disconnected: true });
}
