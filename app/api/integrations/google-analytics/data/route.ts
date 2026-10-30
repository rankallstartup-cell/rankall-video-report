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

// Refresh the Google access token if within 60s of expiry. Same helper shape as
// gsc-ai-impressions / gbp post routes (same OAuth token endpoint / project).
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

export async function GET(_req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (cookies) => cookies.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: integration } = await supabaseAdmin
    .from('user_integrations')
    .select('*')
    .eq('user_id', user.id)
    .eq('integration_type', 'google_analytics')
    .single();

  if (!integration) {
    return NextResponse.json({ connected: false, error: 'GA4 not connected' }, { status: 404 });
  }

  const packed: string = integration.site_url || '';
  const [property, propName] = packed.includes('|') ? packed.split('|') : ['', ''];
  if (!property || property === 'no_properties') {
    return NextResponse.json({ connected: true, propertyName: propName || null, error: 'No GA4 property linked' }, { status: 200 });
  }
  const propertyId = property.replace('properties/', '');

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const accessToken = await refreshTokenIfNeeded(integration, clientId, clientSecret);

  try {
    const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        metrics: [
          { name: 'sessions' },
          { name: 'newUsers' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
        ],
        dimensions: [{ name: 'date' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({ connected: true, propertyName: propName || null, error: err?.error?.message || 'GA4 report failed' }, { status: 502 });
    }

    const report = await res.json();
    const rows: Array<{ metricValues: Array<{ value: string }> }> = report.rows || [];

    // Aggregate the per-day rows into 30-day totals/averages.
    let sessions = 0, newUsers = 0, bounceSum = 0, durSum = 0;
    const dailySessions: number[] = [];
    for (const row of rows) {
      const s = Number(row.metricValues?.[0]?.value || 0);
      const nu = Number(row.metricValues?.[1]?.value || 0);
      const br = Number(row.metricValues?.[2]?.value || 0);
      const dur = Number(row.metricValues?.[3]?.value || 0);
      sessions += s;
      newUsers += nu;
      bounceSum += br;
      durSum += dur;
      dailySessions.push(s);
    }
    const days = rows.length || 1;
    const bounceRate = Math.round((bounceSum / days) * 1000) / 10; // % , 1 dp
    const avgSessionDuration = Math.round(durSum / days); // seconds

    // Trend: compare first half vs second half of the window by session volume.
    const mid = Math.floor(dailySessions.length / 2);
    const firstHalf = dailySessions.slice(0, mid).reduce((a, b) => a + b, 0);
    const secondHalf = dailySessions.slice(mid).reduce((a, b) => a + b, 0);
    let percentChange = 0;
    if (firstHalf > 0) percentChange = Math.round(((secondHalf - firstHalf) / firstHalf) * 1000) / 10;
    else if (secondHalf > 0) percentChange = 100;
    const trend: 'up' | 'down' | 'flat' = percentChange > 2 ? 'up' : percentChange < -2 ? 'down' : 'flat';

    return NextResponse.json({
      connected: true,
      propertyName: propName || null,
      last30Days: { sessions, newUsers, bounceRate, avgSessionDuration },
      trend,
      percentChange,
    });
  } catch (err) {
    console.error('[ga4/data] failed:', err);
    return NextResponse.json({ connected: true, propertyName: propName || null, error: 'GA4 report failed' }, { status: 500 });
  }
}
