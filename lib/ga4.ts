// lib/ga4.ts
// Shared GA4 (Google Analytics 4) report helper. Usable from both the cookie-authed
// data route AND server-side contexts (the weekly report cron) — it takes a userId
// and a service-role Supabase client, reads the stored tokens, refreshes if needed,
// and returns aggregated last-30-days traffic. Returns null (never throws) whenever
// GA4 isn't connected / no property / the API call fails, so callers degrade cleanly.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface GA4ReportData {
  connected: boolean;
  propertyName: string;
  propertyId: string;
  last30Days: {
    sessions: number;
    newUsers: number;
    bounceRate: number;
    avgSessionDuration: number;
  };
  trend: 'up' | 'down' | 'flat';
  percentChange: number;
}

export async function fetchGA4Data(
  userId: string,
  supabaseAdmin: SupabaseClient,
): Promise<GA4ReportData | null> {
  // 1. Get tokens from user_integrations (service role — bypasses RLS).
  const { data: integration } = await supabaseAdmin
    .from('user_integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('integration_type', 'google_analytics')
    .single();

  if (!integration) return null;

  // 2. Refresh the access token if it has expired.
  let accessToken: string = integration.access_token;
  const expiresAt = new Date(integration.token_expires_at);
  if (expiresAt <= new Date()) {
    const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: integration.refresh_token,
        grant_type: 'refresh_token',
      }),
    });
    if (refreshRes.ok) {
      const refreshData = await refreshRes.json();
      accessToken = refreshData.access_token;
      await supabaseAdmin
        .from('user_integrations')
        .update({
          access_token: accessToken,
          token_expires_at: new Date(Date.now() + (refreshData.expires_in || 3600) * 1000).toISOString(),
        })
        .eq('user_id', userId)
        .eq('integration_type', 'google_analytics');
    }
  }

  // 3. Resolve property id + name from the packed site_url ("properties/123|Name").
  const siteUrl: string = integration.site_url || '';
  const propertyId = siteUrl.includes('|') ? siteUrl.split('|')[0] : siteUrl;
  const propertyName = siteUrl.includes('|') ? siteUrl.split('|')[1] : siteUrl;
  if (!propertyId || propertyId === 'no_properties') return null;

  // 4. Call the GA4 Data API. Include the date dimension + TOTAL aggregation so we
  //    get both a reliable 30-day total AND per-day rows for the trend calc.
  try {
    const reportRes = await fetch(`https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`, {
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
        metricAggregations: ['TOTAL'],
      }),
    });

    if (!reportRes.ok) return null;

    const reportData = await reportRes.json();
    const rows: Array<{ metricValues?: Array<{ value: string }> }> = reportData.rows || [];

    // Prefer the API-provided TOTAL aggregation; fall back to summing rows.
    const totalsRow = reportData.totals?.[0]?.metricValues as Array<{ value: string }> | undefined;
    let sessions = 0, newUsers = 0, bounceRate = 0, avgDuration = 0;
    if (totalsRow && totalsRow.length >= 4) {
      sessions = parseInt(totalsRow[0]?.value || '0', 10);
      newUsers = parseInt(totalsRow[1]?.value || '0', 10);
      bounceRate = parseFloat(totalsRow[2]?.value || '0');
      avgDuration = parseFloat(totalsRow[3]?.value || '0');
    } else {
      // Fallback: aggregate the per-day rows. Rates are averaged across days.
      let brSum = 0, durSum = 0;
      for (const r of rows) {
        sessions += parseInt(r.metricValues?.[0]?.value || '0', 10);
        newUsers += parseInt(r.metricValues?.[1]?.value || '0', 10);
        brSum += parseFloat(r.metricValues?.[2]?.value || '0');
        durSum += parseFloat(r.metricValues?.[3]?.value || '0');
      }
      const days = rows.length || 1;
      bounceRate = brSum / days;
      avgDuration = durSum / days;
    }

    // Trend: first half vs second half of the window by session volume.
    const half = Math.floor(rows.length / 2);
    const firstHalf = rows.slice(0, half).reduce((sum, r) => sum + parseInt(r.metricValues?.[0]?.value || '0', 10), 0);
    const secondHalf = rows.slice(half).reduce((sum, r) => sum + parseInt(r.metricValues?.[0]?.value || '0', 10), 0);
    const percentChange = firstHalf > 0 ? Math.round(((secondHalf - firstHalf) / firstHalf) * 100) : 0;
    const trend: 'up' | 'down' | 'flat' = percentChange > 5 ? 'up' : percentChange < -5 ? 'down' : 'flat';

    return {
      connected: true,
      propertyName,
      propertyId,
      last30Days: {
        sessions,
        newUsers,
        bounceRate: Math.round(bounceRate * 10) / 10,
        avgSessionDuration: Math.round(avgDuration),
      },
      trend,
      percentChange,
    };
  } catch {
    return null;
  }
}
