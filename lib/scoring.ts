// lib/scoring.ts
// SINGLE source of truth for the headline AI-visibility score.
//
// The score is RECOMMENDATION-based:
//   (weighted mentions) / (total weight of RESPONDING platforms) * 100
//
// Failed/timed-out platforms are excluded from both numerator and denominator
// so a single timeout can't swing the score by an entire platform's weight.

export type PlatformStatus = 'success' | 'error' | 'timeout';

export interface ScoreInput {
  weight: number;
  mentionRate: number;
  status: PlatformStatus;
}

export interface ScoreResult {
  score: number;
  respondedCount: number;
  totalCount: number;
  mentionedCount: number;
  mentionedOpportunities: number;
  totalOpportunities: number;
}

export function calculateOverallScore(platforms: ScoreInput[], queriesPerPlatform: number): ScoreResult {
  const responded = platforms.filter(p => p.status === 'success');
  const failed = platforms.filter(p => p.status !== 'success');
  const respondedWeight = responded.reduce((sum, p) => sum + p.weight, 0);
  const weightedMentionSum = responded
    .reduce((sum, p) => sum + p.weight * p.mentionRate, 0);

  if (failed.length > 0) {
    console.log('[scan] excluded platforms:', failed.map(p => ({ weight: p.weight, status: p.status })));
  }

  const score = respondedWeight > 0
    ? Math.round((weightedMentionSum / respondedWeight) * 100)
    : 0;

  const mentionedOpportunities = responded
    .reduce((sum, p) => sum + Math.round(p.mentionRate * queriesPerPlatform), 0);

  return {
    score,
    respondedCount: responded.length,
    // totalCount honestly means TOTAL platforms passed in (12), not responders;
    // respondedCount carries the responder number separately.
    totalCount: platforms.length,
    mentionedCount: responded.filter(p => p.mentionRate > 0).length,
    mentionedOpportunities,
    totalOpportunities: responded.length * queriesPerPlatform,
  };
}

// ── Revenue gap (single source of truth) ────────────────────────────────────
// ONE definition, used everywhere a scanned business's monthly revenue gap is
// shown (report page, landing page, PDF, agency proposal, dashboard, emails):
//
//   lostShare = share of the AI platforms that RESPONDED which did NOT
//               recommend you = 1 − mentioned / responded
//   gap       = lostShare × monthly AI inquiries × conversion × customer value
//
// (Before: lostShare = competitorShare − mentionedShare with every caller
// passing competitorShare = 1 − mentionedShare, i.e. 1 − 2 × mentionedShare —
// 2/11 mentioned used 64% instead of the 82% the report copy names, and any
// business on ≥ 6/11 got a $0 gap.)
export interface RevenueInput {
  mentionedShare: number;      // 0-1 — share of responding AI platforms that recommend you
  avgCustomerValue: number;    // per-customer value in the local currency
  monthlyAIInquiries: number;  // monthly AI-driven inquiries for this category/market
}

// b0fg: the 0.1 was an UNSTATED assumption — the share of AI inquiries
// assumed to become paying customers. Displays showed the other inputs
// (120 inquiries, $800 per customer) without it, so a reader multiplying
// them got $96,000 against a displayed $9,600. Name it so every display
// can show the full chain: lostShare x inquiries x conversion x value.
export const REVENUE_CONVERSION_RATE = 0.1;

/** Share of responding platforms that did NOT recommend you (0-1). */
export function lostShareFromMentionedShare(mentionedShare: number): number {
  if (!Number.isFinite(mentionedShare)) return 0;
  return Math.min(1, Math.max(0, 1 - mentionedShare));
}

export function calculateRevenueGap(input: RevenueInput): number {
  const lostShare = lostShareFromMentionedShare(input.mentionedShare);
  const rawResult = Math.round(lostShare * input.monthlyAIInquiries * input.avgCustomerValue * REVENUE_CONVERSION_RATE);
  // Currency-safe backstop: never exceed 30% of the total market opportunity
  // (scales with the local avgCustomerValue). With the 0.1 conversion and
  // lostShare ≤ 1, rawResult tops out at 10% of the opportunity, so this cap
  // only engages if the conversion rate is ever raised past 0.3.
  const maxGap = Math.round(input.monthlyAIInquiries * input.avgCustomerValue * 0.3);
  return Math.min(rawResult, maxGap);
}

// b0fg: the pieces of the gap, for displays that show the derivation
// (lostShare x inquiries x conversion x value) instead of a bare number.
// Derived from the same inputs as calculateRevenueGap — never recomputed.
export function revenueGapBreakdown(input: RevenueInput): {
  lostShare: number;
  monthlyAIInquiries: number;
  conversionRate: number;
  avgCustomerValue: number;
  gap: number;
} {
  return {
    lostShare: lostShareFromMentionedShare(input.mentionedShare),
    monthlyAIInquiries: input.monthlyAIInquiries,
    conversionRate: REVENUE_CONVERSION_RATE,
    avgCustomerValue: input.avgCustomerValue,
    gap: calculateRevenueGap(input),
  };
}

/**
 * Revenue gap for a scan. `respondedPlatforms` is the number of AI platforms
 * that actually answered (failed/timed-out platforms are excluded, the same
 * denominator as the headline score). Mentions are clamped to it. When no
 * platform responded nothing was measured and the gap is 0.
 */
export function revenueGapForScan(input: {
  mentionedCount: number;
  respondedPlatforms: number;
  avgCustomerValue: number;
  monthlyAIInquiries: number;
}): number {
  return revenueGapForScanBreakdown(input).gap;
}

export function revenueGapForScanBreakdown(input: {
  mentionedCount: number;
  respondedPlatforms: number;
  avgCustomerValue: number;
  monthlyAIInquiries: number;
}): ReturnType<typeof revenueGapBreakdown> {
  const responded = Number.isFinite(input.respondedPlatforms) ? Math.max(0, input.respondedPlatforms) : 0;
  if (responded === 0) {
    return {
      lostShare: 0,
      monthlyAIInquiries: input.monthlyAIInquiries,
      conversionRate: REVENUE_CONVERSION_RATE,
      avgCustomerValue: input.avgCustomerValue,
      gap: 0,
    };
  }
  const mentioned = Math.min(Math.max(0, input.mentionedCount || 0), responded);
  return revenueGapBreakdown({
    mentionedShare: mentioned / responded,
    avgCustomerValue: input.avgCustomerValue,
    monthlyAIInquiries: input.monthlyAIInquiries,
  });
}

// Canonical Share of Recommendation (b02f): mentioned platforms / all
// platforms, as a percentage. This is the ONE share formula — it matches
// the report page (ax7x), and both stored columns (rankall_scans +
// score_history) are written with it via the three saveScan callers
// (scan, outreach run-scan, rescan-weekly). The previous weight-based
// implementation (weighted share over responding platforms) is
// deleted: it disagreed with the page for the
// same scan. Historical rankall_scans rows keep weight-based values;
// new scans use this formula for both columns (see ticket b02f).
export function calculateRecommendationShare(mentionedCount: number, totalPlatforms: number): number {
  if (totalPlatforms <= 0) return 0;
  return Math.round((mentionedCount / totalPlatforms) * 100);
}
