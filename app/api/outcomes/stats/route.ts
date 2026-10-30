import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 300; // cache 5 minutes

let _client: any = null;
function getClient() {
  if (!_client) _client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  return _client;
}

export async function GET() {
  try {
    const sb = getClient();

    // Total scan count
    const { count: totalScans } = await sb
      .from('rankall_scans')
      .select('*', { count: 'exact', head: true });

    // Verified outcomes stats
    const { data: outcomes } = await sb
      .from('verified_outcomes')
      .select('score_improvement, industry, country_code')
      .eq('verified', true);

    const totalVerifications = outcomes?.length ?? 0;
    const avgImprovement = totalVerifications > 0
      ? Math.round((outcomes!.reduce((s: number, o: any) => s + (o.score_improvement ?? 0), 0)) / totalVerifications)
      : 0;

    // By industry
    const byIndustry: Record<string, { avg: number; count: number }> = {};
    if (outcomes) {
      for (const o of outcomes) {
        if (!o.industry) continue;
        const ind = o.industry.toLowerCase();
        if (!byIndustry[ind]) byIndustry[ind] = { avg: 0, count: 0 };
        byIndustry[ind].count++;
        byIndustry[ind].avg = Math.round(
          (byIndustry[ind].avg * (byIndustry[ind].count - 1) + (o.score_improvement ?? 0)) / byIndustry[ind].count
        );
      }
    }

    // Countries count
    const { data: countriesData } = await sb
      .from('rankall_scans')
      .select('country_code')
      .not('country_code', 'is', null);
    const uniqueCountries = new Set(countriesData?.map((r: any) => r.country_code) ?? []).size;

    return NextResponse.json({
      total_scans: totalScans ?? 0,
      total_verifications: totalVerifications,
      avg_improvement: avgImprovement,
      // ax75: no Math.max(..., 14) floor — the count is the count.
      countries: uniqueCountries,
      by_industry: byIndustry,
    });
  } catch (e) {
    // ax75: an error returns honest zeros, never fabricated fallback
    // numbers (the old path returned 47,000 scans / 3,200 verifications).
    console.error('[outcomes/stats] failed:', e);
    return NextResponse.json({
      total_scans: 0,
      total_verifications: 0,
      avg_improvement: 0,
      countries: 0,
      by_industry: {},
    });
  }
}
