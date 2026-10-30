import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

async function refreshTokenIfNeeded(integration: { access_token: string; refresh_token: string; token_expires_at: string }, clientId: string, clientSecret: string) {
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

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (cookies) => cookies.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: integration } = await supabase
    .from('user_integrations')
    .select('*')
    .eq('user_id', user.id)
    .eq('integration_type', 'google_search_console')
    .single();

  if (!integration) {
    return NextResponse.json({ connected: false, error: 'GSC not connected' }, { status: 404 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const accessToken = await refreshTokenIfNeeded(integration, clientId, clientSecret);

  const siteUrl = encodeURIComponent(integration.site_url);
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = '2026-05-18'; // When GSC started showing AI data

  const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${siteUrl}/searchAnalytics/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startDate,
      endDate,
      dimensions: ['date'],
      searchType: 'web',
      dataState: 'all',
    }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to fetch GSC data', details: await res.text() }, { status: 502 });
  }

  const data = await res.json();
  const rows: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[] = data.rows || [];

  const totalImpressions = rows.reduce((s, r) => s + r.impressions, 0);
  const totalClicks = rows.reduce((s, r) => s + r.clicks, 0);
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

  // Simple trend: compare last 7 days vs previous 7 days
  const recent = rows.slice(-7).reduce((s, r) => s + r.impressions, 0);
  const prior = rows.slice(-14, -7).reduce((s, r) => s + r.impressions, 0);
  const trend = recent > prior * 1.05 ? 'up' : recent < prior * 0.95 ? 'down' : 'stable';

  return NextResponse.json({
    connected: true,
    site_url: integration.site_url,
    ai_overview_impressions: totalImpressions,
    ai_overview_clicks: totalClicks,
    ai_overview_ctr: Math.round(avgCtr * 10) / 10,
    trend,
    period: { start: startDate, end: endDate },
    daily_data: rows.map(r => ({ date: r.keys[0], impressions: r.impressions, clicks: r.clicks })),
  });
}
