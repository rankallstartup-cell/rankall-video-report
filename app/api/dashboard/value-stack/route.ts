import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { getCountryConfig, getRevenueSymbol } from '@/lib/countryConfig';
import { revenueRecoveredEstimate } from '@/lib/revenueModel';
import { withCanonicalImpacts } from '@/lib/fixIntelligence';

export const dynamic = 'force-dynamic';

// Powers the dashboard "value stack": Fix Impact Tracker, What To Do Today,
// Monthly ROI, and AI Appearances. Everything is read via the service-role
// client (RLS on verified_outcomes/generated_fixes must never gate the
// dashboard) but scoped to the cookie-authenticated user's own rows only.
// Never throws — always returns a shape the client can render safely.

interface OutcomeRow {
  fix_type: string | null;
  score_before: number | null;
  score_after: number | null;
  score_improvement: number | null;
  before_platforms_found: number | null;
  after_platforms_found: number | null;
  days_to_improvement: number | null;
  confidence_level: string | null;
  is_verified: boolean | null;
  verified_at: string | null;
  created_at: string | null;
  estimated_impact: string | null;
  business_industry: string | null;
  country_code: string | null;
}

// Item 9: the canonical revenue model (lib/revenueModel → lib/scoring) over
// the outcome's MEASURED platform counts: gap(before) − gap(after). The old
// score-gain formula was a second model. 0 when the counts were not recorded.
function estimateRevenueFromOutcome(before: number | null, after: number | null, industry: string, countryCode: string): number {
  return revenueRecoveredEstimate({ mentionedBefore: before, mentionedAfter: after, industry, countryCode })?.revenue ?? 0;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfPrevMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}

export async function GET(req: NextRequest) {
  try {
    const authed = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } },
    );
    const { data: { user } } = await authed.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = user.id;

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );

    const now = new Date();
    const monthStart = startOfMonth(now);
    const prevMonthStart = startOfPrevMonth(now);

    const [outcomesRes, pendingRes, pendingTypesRes, latestScanRes, scansRes, appliedThisMonthRes] = await Promise.all([
      admin
        .from('verified_outcomes')
        .select('fix_type, score_before, score_after, score_improvement, before_platforms_found, after_platforms_found, days_to_improvement, confidence_level, is_verified, verified_at, created_at, estimated_impact, business_industry, country_code')
        .eq('user_id', userId)
        .order('verified_at', { ascending: false, nullsFirst: false })
        .limit(5),
      admin
        .from('generated_fixes')
        .select('id, fix_title, fix_type')
        .eq('user_id', userId)
        .eq('status', 'pending_review')
        .order('created_at', { ascending: false })
        .limit(50),
      // b8a0: the pending COUNT must be deduped by fix_type — the same
      // rule lib/fixes.ts getFixCounts applies for the banner, the queue
      // and the sidebar badge. The old raw exact count counted every
      // per-scan regeneration (test account: 39 raw rows vs 6 real fix
      // types) and grew each time fixes regenerated, so this banner
      // contradicted the queue ("24/29/34/39 ready" vs "6 ready").
      admin
        .from('generated_fixes')
        .select('fix_type')
        .eq('user_id', userId)
        .eq('status', 'pending_review')
        .limit(500),
      admin
        .from('rankall_scans')
        .select('id, overall_score, created_at, basket_hash')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from('rankall_scans')
        .select('overall_score, mentioned_count, created_at, basket_hash')
        .eq('user_id', userId)
        .gte('created_at', prevMonthStart.toISOString())
        .order('created_at', { ascending: true }),
      admin
        .from('generated_fixes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'applied')
        .gte('applied_at', monthStart.toISOString()),
    ]);

    // ── PART 1: Fix Impact Tracker ──────────────────────────────────────
    const outcomes = ((outcomesRes.data || []) as OutcomeRow[]).map((o) => {
      const improvement = o.score_improvement ?? Math.max(0, (o.score_after ?? 0) - (o.score_before ?? 0));
      const industry = o.business_industry || 'local business';
      const countryCode = o.country_code || 'US';
      return {
        fixType: o.fix_type,
        scoreBefore: o.score_before,
        scoreAfter: o.score_after,
        scoreImprovement: improvement,
        platformsBefore: o.before_platforms_found,
        platformsAfter: o.after_platforms_found,
        daysToImprovement: o.days_to_improvement,
        confidenceLevel: o.confidence_level || 'low',
        isVerified: !!o.is_verified,
        verifiedAt: o.verified_at,
        estimatedRevenue: estimateRevenueFromOutcome(o.before_platforms_found, o.after_platforms_found, industry, countryCode),
        revenueSymbol: getRevenueSymbol(getCountryConfig(countryCode)),
      };
    });

    // ── PART 2: What To Do Today ────────────────────────────────────────
    // b8a0: dedupe by fix_type (newest first, matching lib/fixes.ts) so
    // this count, the banner count and the queue can never disagree.
    const pendingTypeRows = ((pendingTypesRes.data || pendingRes.data || []) as Array<{ fix_type?: string | null }>);
    const pendingCount = new Set(pendingTypeRows.map((r) => r.fix_type).filter(Boolean)).size;
    const seenTypes = new Set<string>();
    const dedupedPending = ((pendingRes.data || []) as Array<{ fix_title?: string; fix_type?: string | null }>).filter((r) => {
      const t = r.fix_type || '';
      if (!t || seenTypes.has(t)) return false;
      seenTypes.add(t);
      return true;
    });
    // ax81: rank pending fixes by the canonical per-fix number (the queue's
    // number), normalised at read time; no '10+' fallback — omit if unknown.
    const topPendingFix = withCanonicalImpacts(dedupedPending)[0];
    const unverifiedOutcome = outcomes.find((o) => !o.isVerified);
    const latestScan = latestScanRes.data as { id: string; overall_score: number; created_at: string; basket_hash?: string | null } | null;
    const daysSinceLastScan = latestScan
      ? Math.floor((now.getTime() - new Date(latestScan.created_at).getTime()) / 86400000)
      : null;

    let priority: { level: number; message: string; ctaLabel: string; ctaHref: string };
    if (pendingCount > 0 && topPendingFix) {
      priority = {
        level: 1,
        message: `You have ${pendingCount} fix${pendingCount === 1 ? '' : 'es'} ready to apply. ${topPendingFix.fix_title || 'Your top fix'} ${topPendingFix.predicted_impact != null ? `could improve your score by an estimated ${topPendingFix.predicted_impact} points.` : 'is the top item in your queue.'}`,
        ctaLabel: 'Apply Fix Now →',
        ctaHref: '/dashboard/fix',
      };
    } else if (unverifiedOutcome) {
      priority = {
        level: 2,
        message: `Your ${(unverifiedOutcome.fixType || 'recent fix').replace(/_/g, ' ')} fix is ready for verification. Rescan to confirm your improvement.`,
        ctaLabel: 'Rescan Now →',
        ctaHref: '/dashboard',
      };
    } else if (daysSinceLastScan === null || daysSinceLastScan > 7) {
      priority = {
        level: 3,
        message: daysSinceLastScan === null
          ? "You haven't run a scan yet. Scan now to see your AI visibility score."
          : `You haven't scanned in ${daysSinceLastScan} days. Your competitor may have moved.`,
        ctaLabel: 'Scan Now →',
        ctaHref: '/',
      };
    } else {
      const recentGain = outcomes.find((o) => o.scoreImprovement > 0);
      priority = {
        level: 4,
        message: recentGain
          ? `Great work! Your score improved ${recentGain.scoreImprovement} points recently. Keep it up.`
          : 'Great work! Everything looks up to date. Keep monitoring your score.',
        ctaLabel: 'View Dashboard →',
        ctaHref: '/dashboard',
      };
    }

    // ── PART 3 & 4: Monthly ROI + AI Appearances ────────────────────────
    const scanRows = (scansRes.data || []) as Array<{ overall_score: number; mentioned_count: number; created_at: string; basket_hash?: string | null }>;
    const thisMonthScans = scanRows.filter((s) => new Date(s.created_at) >= monthStart);
    const lastMonthScans = scanRows.filter((s) => new Date(s.created_at) < monthStart);

    const appearancesThisMonth = thisMonthScans.reduce((sum, s) => sum + (s.mentioned_count || 0), 0);
    const appearancesLastMonth = lastMonthScans.reduce((sum, s) => sum + (s.mentioned_count || 0), 0);

    // b8a0: the score change compares the latest scan with the PREVIOUS
    // scan of the SAME query set (basket) — the only like-for-like delta.
    // The old math subtracted the first scan since last month across
    // every business and basket the account ever scanned (test account:
    // latest 2 minus an unrelated 0 = a "+2" that matched no real pair).
    // The baseline's date travels with the number so the page can name it.
    const latestBasket = latestScan?.basket_hash ?? null;
    const basketRows = latestBasket
      ? scanRows.filter((s) => s.basket_hash === latestBasket)
      : scanRows;
    const basketLatest = basketRows[basketRows.length - 1] ?? null;
    const basketPrev = basketRows[basketRows.length - 2] ?? null;
    const scoreChangeThisMonth = basketLatest && basketPrev ? basketLatest.overall_score - basketPrev.overall_score : null;
    const scoreBaselineDate = basketPrev?.created_at ?? null;

    const revenueImpactThisMonth = outcomes
      .filter((o) => o.verifiedAt && new Date(o.verifiedAt) >= monthStart)
      .reduce((sum, o) => sum + o.estimatedRevenue, 0);

    return NextResponse.json({
      outcomes,
      priority,
      monthlyROI: {
        scoreChange: scoreChangeThisMonth,
        // b8a0: the dated baseline for the score-change tile.
        scoreBaselineDate,
        fixesApplied: appliedThisMonthRes.count ?? 0,
        appearancesThisMonth,
        revenueImpact: revenueImpactThisMonth,
        revenueSymbol: outcomes[0]?.revenueSymbol ?? '$',
      },
      appearances: {
        thisMonth: appearancesThisMonth,
        lastMonth: appearancesLastMonth,
        // b8a0: how many scans the appearances total sums over, so the
        // page can state the definition next to the number.
        scansThisMonth: thisMonthScans.length,
        trend: appearancesThisMonth > appearancesLastMonth ? 'up' : appearancesThisMonth < appearancesLastMonth ? 'down' : 'flat',
      },
    });
  } catch (err) {
    console.error('[dashboard/value-stack] error:', err);
    return NextResponse.json({
      outcomes: [],
      priority: { level: 4, message: 'Run a scan to get started.', ctaLabel: 'Scan Now →', ctaHref: '/' },
      monthlyROI: { scoreChange: null, fixesApplied: 0, appearancesThisMonth: 0, revenueImpact: 0 },
      appearances: { thisMonth: 0, lastMonth: 0, trend: 'flat' },
    });
  }
}
