import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { isAdminUser } from '@/lib/planConfig';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

let _adminClient: SupabaseClient | null = null;
function createAdminClient(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }
  return _adminClient;
}

type SimRow = {
  viewed_at: string | null;
  converted: boolean | null;
  current_score: number | null;
  industry: string | null;
  revenue_recovered: number | null;
};

function scoreBucket(score: number): string {
  if (score <= 30) return '0-30';
  if (score <= 50) return '31-50';
  if (score <= 70) return '51-70';
  return '71+';
}

const EMPTY = {
  viewsThisWeek: 0,
  conversionRate: 0,
  bestScoreRange: '—',
  bestIndustry: '—',
  avgRecovery: 0,
  totalViews: 0,
};

export async function GET(req: NextRequest) {
  try {
    // ax77: verify the caller's REAL session — the old code trusted a
    // client-supplied ?callerEmail= query param (spoofable).
    const sessionSupabase = await createServerSupabaseClient();
    const { data: { user } } = await sessionSupabase.auth.getUser();
    if (!isAdminUser(user?.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('simulation_views')
      .select('viewed_at, converted, current_score, industry, revenue_recovered');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data as SimRow[] | null) ?? [];
    if (rows.length === 0) {
      return NextResponse.json(EMPTY);
    }

    const totalViews = rows.length;
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const viewsThisWeek = rows.filter(
      (r) => r.viewed_at && new Date(r.viewed_at).getTime() >= weekAgo
    ).length;

    const convertedRows = rows.filter((r) => r.converted === true);
    const conversionRate = totalViews > 0
      ? Math.round((convertedRows.length / totalViews) * 1000) / 10
      : 0;

    // Best converting score range
    const bucketStats: Record<string, { total: number; conv: number }> = {};
    rows.forEach((r) => {
      const b = scoreBucket(r.current_score ?? 0);
      if (!bucketStats[b]) bucketStats[b] = { total: 0, conv: 0 };
      bucketStats[b].total++;
      if (r.converted) bucketStats[b].conv++;
    });
    // b88q: with zero conversions every bucket ties at 0% and the
    // loop would still crown a "best" range/industry — an artifact,
    // not a measurement. No conversions -> no best (the page
    // renders '—').
    let bestScoreRange = '—';
    let bestScoreRate = -1;
    if (convertedRows.length > 0) {
      for (const [b, s] of Object.entries(bucketStats)) {
        const rate = s.total > 0 ? s.conv / s.total : 0;
        if (rate > bestScoreRate) { bestScoreRate = rate; bestScoreRange = b; }
      }
    }

    // Best converting industry
    const indStats: Record<string, { total: number; conv: number }> = {};
    rows.forEach((r) => {
      const ind = r.industry || 'Unknown';
      if (!indStats[ind]) indStats[ind] = { total: 0, conv: 0 };
      indStats[ind].total++;
      if (r.converted) indStats[ind].conv++;
    });
    let bestIndustry = '—';
    let bestIndRate = -1;
    if (convertedRows.length > 0) {
      for (const [ind, s] of Object.entries(indStats)) {
        const rate = s.total > 0 ? s.conv / s.total : 0;
        if (rate > bestIndRate) { bestIndRate = rate; bestIndustry = ind; }
      }
    }

    // Avg revenue recovered among converted
    const recoveries = convertedRows.map((r) => r.revenue_recovered ?? 0);
    const avgRecovery = recoveries.length > 0
      ? Math.round(recoveries.reduce((a, b) => a + b, 0) / recoveries.length)
      : 0;

    return NextResponse.json({
      viewsThisWeek,
      conversionRate,
      bestScoreRange,
      bestIndustry,
      avgRecovery,
      totalViews,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
