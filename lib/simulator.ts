// lib/simulator.ts
// Recommendation Simulator engine — calculates realistic AI-visibility
// improvement projections based on fix types and industry benchmarks.

import { PROJECTION_CAP, projectScore, gradeLabel } from './projection';
import { canonicalFixImpact } from './fixIntelligence';

// b02b: the cap, projection rule and grade bands live in lib/projection.ts
// (one table for every surface). Re-exported for existing importers.
export { PROJECTION_CAP, projectScore, gradeLabel, GRADE_BANDS, effectiveCap } from './projection';

export interface SimulatorFix {
  id: string;
  title: string;
  fix_type: string;
  predicted_impact?: number;
}

export interface SimulatorInput {
  currentScore: number;
  industry: string;
  city: string;
  countryCode: string;
  competitorScore: number | null; // measured competitor score when the scan recorded one; never a fallback
  platformsCovered: number;
  fixes: SimulatorFix[];
  revenueGap: number;        // current monthly revenue loss
  revenueSymbol: string;
}

export interface FixProjection {
  fixNumber: number;
  fixTitle: string;
  fixType: string;
  pointsGained: number;
  pointsGainedRange: string;
  weeksToResult: number;
  weekStart: number;
  weekEnd: number;
  confidence: number;
  platformsAdded: number;
}

export interface SimulatorOutput {
  currentScore: number;
  projectedScoreMin: number;
  projectedScoreMax: number;
  projectedScoreMid: number;
  confidence: number;
  totalWeeks: number;
  fixProjections: FixProjection[];
  platformsCurrently: number;
  platformsProjected: number;
  revenueCurrentLoss: number;
  revenueAfterFixes: number;
  revenueRecovered: number;
  revenueRecoveredAnnual: number;
  revenueSymbol: string;
  gradeBeforeLabel: string;
  gradeAfterLabel: string;
  // true when no fix with a known impact was supplied: the projection equals
  // the current score and surfaces say "no fixes generated yet" instead of
  // showing an invented lift.
  noFixesYet: boolean;
}
// b02b: the old output carried three extra fields (a similar-business
// count, an average improvement, a success rate) sourced from hardcoded
// constants that were rendered as real database evidence. Deleted.
// Consumers show the real data basis from /api/simulator/basis
// (basisFromCounts) instead — see the dashboard simulator page and
// RecommendationSimulator.

// ── Data-basis system (Phase 15) ───────────────────────────────────────────
// Every projection must show what it is based on. A projection is only as
// trustworthy as its data source — we never imply more certainty than we have.
export type BasisType = 'verified' | 'similar' | 'industry_avg' | 'estimate';

export interface ProjectionBasis {
  basisType: BasisType;
  count: number;
  confidence: number;
  label: string;
  badge: string;
}

// The standard, non-negotiable disclaimer attached to every projection.
export const SIMULATOR_DISCLAIMER =
  'These are projections, not guarantees. Actual results vary based on your specific situation, competition, and implementation quality. No results are guaranteed.';

// Confidence bar colour by level (shared by dashboard + public pages).
export function confidenceColor(confidence: number): string {
  if (confidence < 50) return '#ef4444';   // red
  if (confidence < 70) return '#f59e0b';   // yellow
  if (confidence < 85) return '#1B17FF';   // blue
  return '#22c55e';                         // green
}

// Pure mapping from a data count to a basis — mirrored server-side in
// /api/simulator/basis (which supplies the real counts from the DB).
export function basisFromCounts(
  verifiedCount: number,
  similarCount: number,
  industryCount: number,
  industry: string,
  countryCode: string,
): ProjectionBasis {
  const ind = industry || 'your industry';
  if (verifiedCount >= 3) {
    return {
      basisType: 'verified',
      count: verifiedCount,
      confidence: Math.min(95, 75 + verifiedCount * 2),
      label: `Based on ${verifiedCount} verified outcomes in ${ind} in ${countryCode}`,
      badge: '🟢 Verified Data',
    };
  }
  if (similarCount >= 10) {
    return {
      basisType: 'similar',
      count: similarCount,
      confidence: Math.min(80, 50 + Math.floor(similarCount / 10) * 5),
      label: `Based on ${similarCount} similar ${ind} businesses in ${countryCode}`,
      badge: '🔵 Similar Businesses',
    };
  }
  if (industryCount >= 5) {
    return {
      basisType: 'industry_avg',
      count: industryCount,
      confidence: 55,
      label: `Based on industry averages across ${industryCount} businesses`,
      badge: '🟡 Industry Average',
    };
  }
  return {
    basisType: 'estimate',
    count: 0,
    confidence: 40,
    label: 'General estimate — limited data for your specific market',
    badge: '🔴 Estimate Only',
  };
}

// Base improvement values per fix type (GEO optimization industry data)
interface FixImprovement {
  minPts: number;
  maxPts: number;
  weeks: number;
  platformsAdded: number;
  confidence: number;
}

export const FIX_IMPROVEMENTS: Record<string, FixImprovement> = {
  faq_schema:           { minPts: 6,  maxPts: 10, weeks: 2,  platformsAdded: 1, confidence: 85 },
  jsonld:               { minPts: 6,  maxPts: 10, weeks: 2,  platformsAdded: 1, confidence: 84 },
  local_business_schema:{ minPts: 6,  maxPts: 10, weeks: 2,  platformsAdded: 1, confidence: 84 },
  directory_citations:  { minPts: 5,  maxPts: 8,  weeks: 4,  platformsAdded: 2, confidence: 80 },
  directory:            { minPts: 5,  maxPts: 8,  weeks: 4,  platformsAdded: 2, confidence: 80 },
  review_velocity:      { minPts: 4,  maxPts: 7,  weeks: 6,  platformsAdded: 1, confidence: 75 },
  reviews:              { minPts: 4,  maxPts: 7,  weeks: 6,  platformsAdded: 1, confidence: 75 },
  content_optimization: { minPts: 4,  maxPts: 6,  weeks: 8,  platformsAdded: 1, confidence: 70 },
  website_content:      { minPts: 4,  maxPts: 6,  weeks: 8,  platformsAdded: 1, confidence: 70 },
  reddit:               { minPts: 4,  maxPts: 6,  weeks: 8,  platformsAdded: 1, confidence: 68 },
  trust_signals:        { minPts: 3,  maxPts: 5,  weeks: 10, platformsAdded: 1, confidence: 72 },
  knowledge_panel:      { minPts: 20, maxPts: 25, weeks: 8,  platformsAdded: 3, confidence: 78 },
  google_business:      { minPts: 8,  maxPts: 12, weeks: 2,  platformsAdded: 2, confidence: 88 },
};

const DEFAULT_IMPROVEMENT: FixImprovement = { minPts: 4, maxPts: 7, weeks: 6, platformsAdded: 1, confidence: 72 };

// b02b: alias of PROJECTION_CAP (lib/projection.ts) for existing importers.
// Projections use projectScore(), which never projects below the current
// score (a business already above the cap keeps its current score).
export const MAX_SCORE_CAP = PROJECTION_CAP;
// No-fix confidence sits in the basis system's 'estimate' tier (40) —
// the old 78% was a hardcoded constant presented as a measured rate.
const NO_FIX_CONFIDENCE = 40;

function getImprovement(fixType: string): FixImprovement {
  const key = (fixType || '').toLowerCase();
  return FIX_IMPROVEMENTS[key] ?? DEFAULT_IMPROVEMENT;
}

export function calculateSimulation(input: SimulatorInput): SimulatorOutput {
  const { currentScore, industry, competitorScore, platformsCovered, fixes, revenueGap, revenueSymbol } = input;

  let weekCursor = 0;
  let totalMinPts = 0;
  let totalMaxPts = 0;
  let totalPlatformsAdded = 0;
  let confidenceSum = 0;
  const fixProjections: FixProjection[] = [];

  // Sort fixes by their week-to-result so the timeline is chronological.
  // Fixes without a known canonical impact are left out — no invented
  // fallback number (item 7: unknown fix type → no impact).
  const orderedFixes = fixes.filter(f => canonicalFixImpact(f.fix_type) != null).sort((a, b) => getImprovement(a.fix_type).weeks - getImprovement(b.fix_type).weeks);

  orderedFixes.forEach((fix, idx) => {
    const imp = getImprovement(fix.fix_type);
    // ax81: drive the projection from the fix's ONE canonical impact number
    // (metadata midpoint via canonicalFixImpact — the number the queue
    // shows), normalised here so legacy stored predicted_impact values never
    // leak in. The maximum is that gain; the minimum a conservative 75%.
    const impactPts = canonicalFixImpact(fix.fix_type) as number;
    const maxPts = impactPts;
    const minPts = Math.max(1, Math.round(impactPts * 0.75));
    // b86q: the timeline's per-fix gain IS the canonical impact —
    // the same number the fix queue shows. The old midPts (the
    // average of the 75% bound and the canonical value) made the
    // timeline disagree with the queue on every fix (+7 vs +8).
    // The min–max range survives only as the uncertainty band.
    const midPts = impactPts;

    const weekStart = weekCursor + 1;
    const weekEnd = weekCursor + imp.weeks;
    weekCursor = weekEnd;

    totalMinPts += minPts;
    totalMaxPts += maxPts;
    totalPlatformsAdded += imp.platformsAdded;
    confidenceSum += imp.confidence;

    fixProjections.push({
      fixNumber: idx + 1,
      fixTitle: fix.title,
      fixType: fix.fix_type,
      pointsGained: midPts,
      pointsGainedRange: `+${minPts}–${maxPts}pts`,
      weeksToResult: imp.weeks,
      weekStart,
      weekEnd,
      confidence: imp.confidence,
      platformsAdded: imp.platformsAdded,
    });
  });

  // No fixes yet → no projected lift (was an invented +15). Callers show
  // "no fixes generated yet" via noFixesYet.
  const noFixesYet = orderedFixes.length === 0;

  // b02b: never project DOWN (score 90 used to become 85).
  const projectedScoreMin = projectScore(currentScore, totalMinPts);
  const projectedScoreMax = projectScore(currentScore, totalMaxPts);
  // b86q: ONE end score everywhere. The headline projection is
  // the canonical-sum projection — the same total the fix queue
  // prints ("Total predicted improvement") — not the average of
  // the conservative and canonical bounds, which produced a
  // third number that matched neither. projectedScoreMin stays
  // available as the conservative bound for range displays.
  const projectedScoreMid = projectedScoreMax;

  const confidence = fixProjections.length > 0
    ? Math.round(confidenceSum / fixProjections.length)
    : NO_FIX_CONFIDENCE;

  const platformsProjected = Math.min(11, platformsCovered + totalPlatformsAdded);

  // Revenue: as score rises toward "visible" the loss shrinks proportionally.
  // Use the improvement ratio to estimate recovery, capped at 60% of current gap.
  // Recovered revenue is clamped to [0, 60%] of a non-negative gap — it can
  // never go negative (a projection below the current score used to make it).
  const safeGap = Number.isFinite(revenueGap) ? Math.max(0, revenueGap) : 0;
  const pointsGainedMid = Math.max(0, projectedScoreMid - currentScore);
  const recoveryRatio = Math.max(0, Math.min(0.6, pointsGainedMid / 40)); // ~24pts → 60%
  const revenueRecovered = Math.round(safeGap * recoveryRatio);
  const revenueAfterFixes = Math.max(0, safeGap - revenueRecovered);

  return {
    currentScore,
    projectedScoreMin,
    projectedScoreMax,
    projectedScoreMid,
    confidence,
    totalWeeks: weekCursor,
    fixProjections,
    platformsCurrently: platformsCovered,
    platformsProjected,
    revenueCurrentLoss: safeGap,
    revenueAfterFixes,
    revenueRecovered,
    revenueRecoveredAnnual: revenueRecovered * 12,
    revenueSymbol,
    gradeBeforeLabel: gradeLabel(currentScore),
    gradeAfterLabel: gradeLabel(projectedScoreMid),
    noFixesYet,
  };
}
