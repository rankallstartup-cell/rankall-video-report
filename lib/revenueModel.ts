// lib/revenueModel.ts
// ax80: ONE revenue model for every surface I own (agency proposal, dashboard
// simulator, agency dashboard, AI inbox, demo video). It is a thin wrapper
// around the canonical lib/scoring revenueGapForScanBreakdown
// (lostShare = 1 - mentioned/responded platforms) that also resolves the
// estimate inputs the same way the report page does — industry-adjusted
// avg customer value + the country's monthly AI inquiries — and the local
// revenue currency symbol. Pure: no I/O.

import { revenueGapForScanBreakdown } from './scoring';
import { getCountryConfig, getAvgCustomerValue, getRevenueSymbol } from './countryConfig';

export interface ScanRevenueEstimate {
  gap: number;                // monthly revenue gap (local currency)
  symbol: string;             // local revenue currency symbol
  lostShare: number;          // 0-1, responding platforms not recommending you
  avgCustomerValue: number;   // estimate input
  monthlyAIInquiries: number; // estimate input
  conversionRate: number;     // estimate input
}

// Default inquiries when a country config has none — matches the report page.
const DEFAULT_MONTHLY_AI_INQUIRIES = 50;

/**
 * Revenue gap for a scan from its REAL mention count. Returns null when the
 * scan has no measured mention count (or no platforms) — callers then show
 * "not measured" instead of an invented number.
 */
export function scanRevenueEstimate(input: {
  mentionedCount: number | null | undefined;
  // Platforms that RESPONDED in the scan (the score's denominator). Callers
  // without per-platform statuses pass the platform total.
  totalPlatforms: number | null | undefined;
  industry?: string | null;
  countryCode?: string | null;
  // Optional overrides (dashboard simulator sliders). Same model.
  avgCustomerValue?: number;
  monthlyAIInquiries?: number;
}): ScanRevenueEstimate | null {
  const mentioned = input.mentionedCount;
  const total = input.totalPlatforms;
  if (typeof mentioned !== 'number' || !Number.isFinite(mentioned) || mentioned < 0) return null;
  if (typeof total !== 'number' || !Number.isFinite(total) || total <= 0) return null;

  const cc = input.countryCode || 'US';
  const country = getCountryConfig(cc);
  const avgCustomerValue = input.avgCustomerValue ?? getAvgCustomerValue(input.industry ?? '', cc);
  const monthlyAIInquiries = input.monthlyAIInquiries ?? (country.monthlyAIInquiries ?? DEFAULT_MONTHLY_AI_INQUIRIES);
  const bd = revenueGapForScanBreakdown({
    mentionedCount: Math.min(mentioned, total),
    respondedPlatforms: total,
    avgCustomerValue,
    monthlyAIInquiries,
  });
  return {
    gap: bd.gap,
    symbol: getRevenueSymbol(country),
    lostShare: bd.lostShare,
    avgCustomerValue,
    monthlyAIInquiries,
    conversionRate: bd.conversionRate,
  };
}

// One-line label for the estimate inputs, for surfaces that show the number.
export function revenueEstimateBasis(e: ScanRevenueEstimate): string {
  return `Estimate: ${Math.round(e.lostShare * 100)}% of ~${e.monthlyAIInquiries} AI inquiries/mo × ${Math.round(e.conversionRate * 100)}% conversion × ~${e.symbol}${e.avgCustomerValue.toLocaleString()} per customer`;
}

/**
 * Revenue RECOVERED between two measurements, from the same canonical model:
 * gap(before) − gap(after), where each gap uses lostShare = 1 − mentioned /
 * responded platforms. Replaces the score-gain model (scoreGain/100 × …)
 * that the monthly ROI email and the dashboard value stack used. Returns
 * null when either mention count is unmeasured; never negative.
 */
export function revenueRecoveredEstimate(input: {
  mentionedBefore: number | null | undefined;
  mentionedAfter: number | null | undefined;
  totalPlatforms?: number;
  industry?: string | null;
  countryCode?: string | null;
}): { revenue: number; customers: number; symbol: string } | null {
  const total = input.totalPlatforms ?? 11;
  const before = scanRevenueEstimate({ mentionedCount: input.mentionedBefore, totalPlatforms: total, industry: input.industry, countryCode: input.countryCode });
  const after = scanRevenueEstimate({ mentionedCount: input.mentionedAfter, totalPlatforms: total, industry: input.industry, countryCode: input.countryCode });
  if (!before || !after) return null;
  const shareGain = Math.max(0, before.lostShare - after.lostShare);
  return {
    revenue: Math.max(0, before.gap - after.gap),
    customers: Math.round(shareGain * before.monthlyAIInquiries * before.conversionRate),
    symbol: before.symbol,
  };
}
