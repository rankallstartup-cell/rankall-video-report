import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// Service-role client — bypasses RLS for user_integrations reads (still scoped
// to the authenticated user's id). Auth itself uses the anon/cookie client.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Refresh the Google access token if it's within 60s of expiry. Mirrors the
// helper in gsc-ai-impressions/route.ts (same OAuth token endpoint / project).
async function refreshTokenIfNeeded(
  integration: { access_token: string; refresh_token: string; token_expires_at: string },
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const expiresAt = new Date(integration.token_expires_at).getTime();
  if (Date.now() < expiresAt - 60000) return integration.access_token;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: integration.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  return data.access_token || integration.access_token;
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (cookies) => cookies.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const content: string = (body.content || '').trim();
  const ctaUrl: string | undefined = body.ctaUrl || undefined;
  if (!content) return NextResponse.json({ error: 'content required' }, { status: 400 });

  // Load the user's GBP tokens.
  const { data: integration } = await supabaseAdmin
    .from('user_integrations')
    .select('*')
    .eq('user_id', user.id)
    .eq('integration_type', 'google_business_profile')
    .single();

  if (!integration) {
    return NextResponse.json({ success: false, error: 'GBP not connected' }, { status: 404 });
  }

  // If we never resolved a location (API not yet approved at connect time), we
  // can't target a localPosts endpoint. Treat as pending.
  const parent: string = integration.site_url || '';
  if (!parent || parent === 'pending_approval' || !parent.includes('/locations/')) {
    return NextResponse.json({
      success: false,
      pending: true,
      message: 'GBP API access pending Google approval. Content saved and will post when approved.',
    });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const accessToken = await refreshTokenIfNeeded(integration, clientId, clientSecret);

  // v4 local posts endpoint. parent is "accounts/{id}/locations/{id}".
  const postBody: Record<string, unknown> = {
    languageCode: 'en-US',
    summary: content,
    topicType: 'STANDARD',
  };
  if (ctaUrl) {
    postBody.callToAction = { actionType: 'LEARN_MORE', url: ctaUrl };
  }

  try {
    const res = await fetch(`https://mybusiness.googleapis.com/v4/${parent}/localPosts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(postBody),
    });

    if (res.status === 403) {
      return NextResponse.json({
        success: false,
        pending: true,
        message: 'GBP API access pending Google approval. Content saved and will post when approved.',
      });
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({
        success: false,
        error: data?.error?.message || 'Failed to publish to Google Business Profile.',
      }, { status: 502 });
    }

    return NextResponse.json({ success: true, post: { name: data?.name, state: data?.state } });
  } catch (err) {
    console.error('[gbp/post] failed:', err);
    return NextResponse.json({ success: false, error: 'Failed to publish to Google Business Profile.' }, { status: 500 });
  }
}
