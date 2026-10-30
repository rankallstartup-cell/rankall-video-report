import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdmin } from '@/lib/supabase';
import { aggregateScores, percentileOf, industryAverages, BENCHMARK_MIN_SAMPLE } from '@/lib/benchmarks';

export const dynamic = 'force-dynamic';

// GET /api/dashboard/benchmarks?industry=dentist&country=US&intent=personal
// Real peer averages from stored scans (service role — cross-user aggregate,
// returns averages and counts only, never rows). Every figure is null below
// BENCHMARK_MIN_SAMPLE scans, so the UI says "not enough data" instead of
// showing a hardcoded benchmark.
export async function GET(req: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const industry = (url.searchParams.get('industry') || '').slice(0, 80) || null;
  const country = (url.searchParams.get('country') || 'US').slice(0, 2).toUpperCase();
  const personal = url.searchParams.get('intent') === 'personal';
  const score = Number(url.searchParams.get('score'));

  try {
    const admin = getSupabaseAdmin();
    // b89y: the same sample the public /market-index publishes — dated
    // scans from the last 12 months. This query had NO date window, so
    // the dashboard and the public page described the same averages
    // over different samples (they only agreed while staging was young).
    const since = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();
    let q = admin.from('rankall_scans')
      .select('industry, overall_score')
      .eq('country_code', country)
      .not('overall_score', 'is', null)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5000);
    q = personal ? q.eq('intent_type', 'personal_pro') : q.or('intent_type.neq.personal_pro,intent_type.is.null');
    const { data, error } = await q;
    if (error) {
      console.error('[benchmarks] query failed:', error.message);
      return NextResponse.json({ national: null, industry: null, percentile: null, topIndustries: [], minSample: BENCHMARK_MIN_SAMPLE });
    }
    const rows = (data ?? []) as Array<{ industry: string | null; overall_score: number | null }>;
    const industryScores = industry ? rows.filter(r => r.industry === industry).map(r => r.overall_score) : [];
    const percentile = industry && Number.isFinite(score) ? percentileOf(score, industryScores) : null;
    // b89y: the percentile travels with its denominator — how many of
    // the industry's scans scored strictly lower, out of how many — so
    // the page can state the method instead of an untraceable "top N%".
    const validIndustryScores = industryScores.filter((s): s is number => typeof s === 'number' && Number.isFinite(s));
    return NextResponse.json({
      country,
      national: aggregateScores(rows.map(r => r.overall_score)),
      industry: industry ? aggregateScores(industryScores) : null,
      percentile,
      percentileBelow: percentile !== null && Number.isFinite(score) ? validIndustryScores.filter(v => v < score).length : null,
      percentileSample: percentile !== null ? validIndustryScores.length : null,
      topIndustries: industryAverages(rows).slice(0, 7),
      minSample: BENCHMARK_MIN_SAMPLE,
    });
  } catch (e) {
    console.error('[benchmarks] failed:', e);
    return NextResponse.json({ national: null, industry: null, percentile: null, topIndustries: [], minSample: BENCHMARK_MIN_SAMPLE });
  }
}
