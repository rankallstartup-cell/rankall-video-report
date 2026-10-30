import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cronAuthFailure } from '@/lib/cronAuth';

export const dynamic = 'force-dynamic';

// Vercel Cron (vercel.json) calls this with GET + Bearer CRON_SECRET; the
// route used to export POST only, so the scheduled run 405'd. POST is kept
// for manual/n8n triggers. Fails CLOSED when CRON_SECRET is unset.
export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(req: NextRequest) {
  const authFail = cronAuthFailure(req);
  if (authFail) return authFail;

  // P0a: aggregate market stats, no user session — service_role (bypasses RLS).
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: scans } = await supabase
    .from('rankall_scans')
    .select('score, industry, city, country_code, created_at, business_name')
    .gte('created_at', thirtyDaysAgo)
    .not('score', 'is', null);

  if (!scans || scans.length === 0) {
    return NextResponse.json({ ok: true, message: 'No data' });
  }

  const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

  const nationalAvg = avg(scans.map(s => s.score));

  const byIndustry: Record<string, number[]> = {};
  const byCity: Record<string, number[]> = {};
  const byCountry: Record<string, number[]> = {};

  scans.forEach(s => {
    if (s.industry) {
      byIndustry[s.industry] = byIndustry[s.industry] ?? [];
      byIndustry[s.industry].push(s.score);
    }
    if (s.city) {
      byCity[s.city] = byCity[s.city] ?? [];
      byCity[s.city].push(s.score);
    }
    if (s.country_code) {
      byCountry[s.country_code] = byCountry[s.country_code] ?? [];
      byCountry[s.country_code].push(s.score);
    }
  });

  const topIndustries = Object.entries(byIndustry)
    .map(([name, scores]) => ({ name, avg: avg(scores), count: scores.length }))
    .filter(i => i.count >= 3)
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 6);

  const topCities = Object.entries(byCity)
    .map(([name, scores]) => ({ name, avg: avg(scores), count: scores.length }))
    .filter(c => c.count >= 3)
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 6);

  const countryBreakdown = Object.entries(byCountry)
    .map(([code, scores]) => ({ code, avg: avg(scores), count: scores.length }))
    .sort((a, b) => b.avg - a.avg);

  const month = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const indexData = {
    month,
    national_avg: nationalAvg,
    total_scans: scans.length,
    top_industries: topIndustries,
    top_cities: topCities,
    country_breakdown: countryBreakdown,
    generated_at: new Date().toISOString(),
  };

  // Store in a simple way — upsert to a market_index table if it exists, else just return
  await supabase.from('market_index_snapshots').upsert({
    month,
    data: indexData,
    generated_at: new Date().toISOString(),
  }, { onConflict: 'month', ignoreDuplicates: false }).select(); // silently fail if table doesn't exist

  return NextResponse.json(indexData);
}
