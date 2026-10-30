// Phase 14: Verified Outcomes Engine.
//
// The product moat: a "verified" outcome is ONLY ever a real before→after rescan
// that clears a threshold. Predictions and estimates are NEVER labelled verified.
//
// Confidence ladder:
//   'low'      — only the before scan exists (fix recorded, not yet re-measured)
//   'medium'   — after scan exists, improvement >= 1 but below the verify bar
//   'high'     — after scan exists, improvement >= 5 points
//   'verified' — improvement >= 3 points AND at least one new platform gained
//
// `is_verified` is true ONLY for 'high' or 'verified'. We keep the legacy `verified`
// column in sync so older readers (app/api/outcomes/stats) agree.

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export type ConfidenceLevel = 'low' | 'medium' | 'high' | 'verified';

// rankall_scans is a legacy/messy table — read a tolerant column set and normalise.
const SCAN_COLUMNS = 'id, score, overall_score, business_name, industry, location, city, country_code, appeared_on_platforms, mentioned_count, created_at';

function scanScore(s: Record<string, unknown>): number {
  return Number((s.score as number) ?? (s.overall_score as number) ?? 0);
}
function scanPlatforms(s: Record<string, unknown>): number {
  return Number((s.appeared_on_platforms as number) ?? (s.mentioned_count as number) ?? 0);
}

// Records that a fix was applied. Creates a 'low' confidence, NOT-verified row.
// Verification only happens later, in verifyOutcome(), against a real rescan.
export async function recordFixApplied(
  userId: string,
  scanId: string,
  fixType: string,
  estimatedImpact: string,
  generatedFixId?: string | null,
): Promise<string | null> {
  const { data: scan } = await supabaseAdmin
    .from('rankall_scans')
    .select(SCAN_COLUMNS)
    .eq('id', scanId)
    .single();

  if (!scan) throw new Error('Scan not found');
  const s = scan as Record<string, unknown>;

  const { data: outcome } = await supabaseAdmin
    .from('verified_outcomes')
    .insert({
      user_id: userId,
      scan_id_before: scanId,
      fix_type: fixType,
      generated_fix_id: generatedFixId ?? null,
      business_name: (s.business_name as string) ?? null,
      industry: (s.industry as string) ?? null,
      business_industry: (s.industry as string) ?? null,
      country_code: (s.country_code as string) ?? 'US',
      score_before: scanScore(s),
      before_platforms_found: scanPlatforms(s),
      estimated_impact: estimatedImpact,
      confidence_level: 'low',
      is_verified: false,
      verified: false,
    })
    .select('id')
    .single();

  return (outcome as { id: string } | null)?.id ?? null;
}

// Verifies an outcome against a real after-scan. This is the ONLY path that can
// set is_verified = true, and only when the improvement clears the threshold.
export async function verifyOutcome(
  outcomeId: string,
  afterScanId: string,
): Promise<{ verified: boolean; improvement: number; confidenceLevel: ConfidenceLevel; message: string }> {
  const { data: outcome } = await supabaseAdmin
    .from('verified_outcomes')
    .select('*')
    .eq('id', outcomeId)
    .single();

  if (!outcome) {
    return { verified: false, improvement: 0, confidenceLevel: 'low', message: 'Outcome record not found' };
  }

  const { data: afterScan } = await supabaseAdmin
    .from('rankall_scans')
    .select(SCAN_COLUMNS)
    .eq('id', afterScanId)
    .single();

  if (!afterScan) {
    return { verified: false, improvement: 0, confidenceLevel: 'low', message: 'After scan not found' };
  }

  const o = outcome as Record<string, unknown>;
  const a = afterScan as Record<string, unknown>;

  const afterScore = scanScore(a);
  const beforeScore = Number((o.score_before as number) ?? 0);
  const afterPlatforms = scanPlatforms(a);
  const beforePlatforms = Number((o.before_platforms_found as number) ?? 0);

  const improvement = afterScore - beforeScore;
  const platformsImproved = afterPlatforms - beforePlatforms;

  const createdAt = new Date((o.created_at as string) ?? Date.now());
  const afterAt = new Date((a.created_at as string) ?? Date.now());
  const daysBetween = Math.max(0, Math.floor((afterAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)));

  // Threshold ladder — verified requires a real, meaningful gain.
  let confidenceLevel: ConfidenceLevel = 'low';
  let isVerified = false;
  if (improvement >= 3 && platformsImproved >= 1) {
    confidenceLevel = 'verified';
    isVerified = true;
  } else if (improvement >= 5) {
    confidenceLevel = 'high';
    isVerified = true;
  } else if (improvement >= 1) {
    confidenceLevel = 'medium';
    isVerified = false;
  }

  await supabaseAdmin
    .from('verified_outcomes')
    .update({
      scan_id_after: afterScanId,
      score_after: afterScore,
      after_platforms_found: afterPlatforms,
      platforms_after: afterPlatforms,
      days_to_improvement: daysBetween,
      confidence_level: confidenceLevel,
      is_verified: isVerified,
      verified: isVerified,
      verified_at: isVerified ? new Date().toISOString() : null,
      actual_impact: `+${improvement} points, ${platformsImproved >= 0 ? '+' : ''}${platformsImproved} platforms`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', outcomeId);

  // Phase 4: write the verification result back onto the linked generated_fixes
  // row so the customer sees Predicted → Verified (or Needs reinforcement) + the
  // real before→after score. Matched by the id stored at apply time (no ambiguity).
  const generatedFixId = o.generated_fix_id as string | null | undefined;
  if (generatedFixId) {
    try {
      await supabaseAdmin
        .from('generated_fixes')
        .update({
          verification_status: isVerified ? 'verified' : 'needs_reinforcement',
          score_after: afterScore,
          verified_at: isVerified ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', generatedFixId);
    } catch { /* non-fatal — the verified_outcomes row is the source of truth */ }
  }

  return {
    verified: isVerified,
    improvement,
    confidenceLevel,
    message: isVerified
      ? `✅ Verified: +${improvement} points improvement confirmed`
      : `Score changed by ${improvement} points — not enough to verify`,
  };
}

export interface VerifiedStats {
  totalVerified: number;
  avgImprovement: number;
  avgDaysToImprovement: number;
  topFixTypes: string[];
  confidenceBreakdown: Record<string, number>;
}

// Aggregate stats — only ever counts real, verified, public outcomes.
export async function getVerifiedStats(industry?: string, countryCode?: string): Promise<VerifiedStats> {
  let query = supabaseAdmin
    .from('verified_outcomes')
    .select('score_improvement, days_to_improvement, fix_type, confidence_level, business_industry, country_code')
    .eq('is_verified', true)
    .eq('is_public', true);

  if (industry) query = query.eq('business_industry', industry);
  if (countryCode) query = query.eq('country_code', countryCode);

  const { data } = await query;
  const outcomes = (data as Array<Record<string, unknown>> | null) ?? [];

  if (!outcomes.length) {
    return { totalVerified: 0, avgImprovement: 0, avgDaysToImprovement: 0, topFixTypes: [], confidenceBreakdown: {} };
  }

  const avgImprovement = Math.round(
    outcomes.reduce((sum, o) => sum + (Number(o.score_improvement) || 0), 0) / outcomes.length,
  );
  const avgDays = Math.round(
    outcomes.reduce((sum, o) => sum + (Number(o.days_to_improvement) || 0), 0) / outcomes.length,
  );

  const fixTypeCounts: Record<string, number> = {};
  for (const o of outcomes) {
    const k = String(o.fix_type ?? 'unknown');
    fixTypeCounts[k] = (fixTypeCounts[k] || 0) + 1;
  }

  const topFixTypes = Object.entries(fixTypeCounts)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 3)
    .map(([type]) => type);

  const confidenceBreakdown: Record<string, number> = {};
  for (const o of outcomes) {
    const k = String(o.confidence_level ?? 'low');
    confidenceBreakdown[k] = (confidenceBreakdown[k] || 0) + 1;
  }

  return {
    totalVerified: outcomes.length,
    avgImprovement,
    avgDaysToImprovement: avgDays,
    topFixTypes,
    confidenceBreakdown,
  };
}
