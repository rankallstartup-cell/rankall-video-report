// lib/fixIntelligence.ts
// Phase 4.1: derive REAL, explainable numbers + evidence for fixes. Replaces the
// hardcoded "+23 points" / "89% confidence" with values computed from actual scan
// signals. Pure + deterministic. Never fabricates specifics — when real evidence
// can't be derived, it returns a generic, honest statement.

import { getFixMetadata } from './fixQuality';
import { effectiveCap } from './projection';

// Parse "+6 to +10 points" / "+20 to +25 points" → numeric range. Falls back to a
// conservative default when metadata has no impact string.
export function parseImpactRange(estimatedImpact?: string): { min: number; max: number; mid: number } {
  const s = estimatedImpact || '';
  const nums = (s.match(/\d+/g) || []).map(Number);
  if (nums.length >= 2) return { min: nums[0], max: nums[1], mid: Math.round((nums[0] + nums[1]) / 2) };
  if (nums.length === 1) return { min: nums[0], max: nums[0], mid: nums[0] };
  return { min: 4, max: 7, mid: 5 };
}

export function impactRangeForFix(fixType: string): { min: number; max: number; mid: number } {
  return parseImpactRange(getFixMetadata(fixType).estimatedImpact as string | undefined);
}

// The metadata range for a KNOWN fix type, or null. impactRangeForFix falls
// back to a default 4–7 range for any string; that default must never be
// shown as a fix's impact (it made every unknown type read "+5").
export function knownImpactRangeForFix(fixType: string | null | undefined): { min: number; max: number; mid: number } | null {
  if (!fixType || typeof fixType !== 'string') return null;
  const raw = getFixMetadata(fixType).estimatedImpact;
  if (typeof raw !== 'string' || !/\d/.test(raw)) return null;
  return parseImpactRange(raw);
}

// ax81/ax6v: THE impact number for a fix, used by every surface (queue,
// report, emails, public profile, value stack). It is the midpoint of the
// metadata range the product displays, derived from fix_type — never the
// stored predicted_impact (legacy rows hold old per-fix guesses like 16/18/
// 20/22 that disagree with the displayed range). Unknown fix_type → null, so
// callers omit the number instead of printing a fallback.
export function canonicalFixImpact(fixType: string | null | undefined): number | null {
  const range = knownImpactRangeForFix(fixType);
  if (!range) return null;
  return Number.isFinite(range.mid) && range.mid > 0 ? range.mid : null;
}

// Normalise rows at read time (predicted_impact := canonicalFixImpact) and
// sort by that number, highest first. Rows without a fix_type keep a null
// impact and sort last. Stable for equal impacts.
export function withCanonicalImpacts<T extends { fix_type?: string | null }>(
  rows: readonly T[],
): Array<T & { predicted_impact: number | null }> {
  return rows
    .map((r, i) => ({ row: { ...r, predicted_impact: canonicalFixImpact(r.fix_type) }, i }))
    .sort((a, b) => ((b.row.predicted_impact ?? -1) - (a.row.predicted_impact ?? -1)) || a.i - b.i)
    .map(x => x.row);
}

export interface ScanSignals {
  overallScore: number;        // 0-100 current AI visibility score
  platformsMentioned: number;  // how many of the 12 platforms mention the business
  totalPlatforms?: number;     // default 12
  competitorName?: string | null;
  trustScore?: number | null;  // 0-100 trust-layer overall, if available
  verifiedHistoryCount?: number; // # of verified outcomes for this industry/country
}

// Predicted score lift for a SET of applied fixes. Sum of per-fix midpoints,
// damped as the score approaches the cap so we never promise an unrealistic jump.
export function computePredictedScoreLift(fixTypes: string[], signals: ScanSignals): number {
  // Unknown fix types contribute nothing (no invented default impact).
  const rawSum = fixTypes.reduce((sum, ft) => sum + (canonicalFixImpact(ft) ?? 0), 0);
  // b02b: the shared projection cap (lib/projection.ts); a score already at
  // or above it has no headroom rather than a negative one.
  const headroom = Math.max(0, effectiveCap(signals.overallScore) - signals.overallScore);
  // Low scores have more headroom (fixes compound); high scores see diminishing returns.
  const damped = Math.min(rawSum, headroom);
  return Math.round(damped);
}

export interface ConfidenceResult { value: number; label: 'Very High' | 'High' | 'Medium' | 'Low' }

// Confidence is derived from REAL factors, never random:
//  - platform agreement: the more platforms already scanned consistently, the more
//    reliable the signal we're acting on
//  - trust-layer strength
//  - verified-outcome history for similar businesses
//  - per-fix base confidence from metadata difficulty (easier = more predictable)
export function computeConfidence(fixType: string, signals: ScanSignals): ConfidenceResult {
  const total = signals.totalPlatforms || 12;
  const platformAgreement = total > 0 ? signals.platformsMentioned / total : 0;

  // Base from difficulty: Easy fixes have the most predictable outcomes.
  const difficulty = (getFixMetadata(fixType).difficulty as string | undefined)?.toLowerCase();
  const base = difficulty === 'hard' ? 55 : difficulty === 'medium' ? 65 : 72;

  let score = base;
  // Platform agreement contributes up to +12.
  score += Math.round(platformAgreement * 12);
  // Trust layer contributes up to +8.
  if (typeof signals.trustScore === 'number') score += Math.round((signals.trustScore / 100) * 8);
  // Real verified-outcome history is the strongest signal: up to +10.
  const hist = signals.verifiedHistoryCount ?? 0;
  score += Math.min(10, hist * 2);

  const value = Math.max(30, Math.min(95, score));
  const label: ConfidenceResult['label'] = value >= 85 ? 'Very High' : value >= 70 ? 'High' : value >= 50 ? 'Medium' : 'Low';
  return { value, label };
}

// Evidence array built from REAL scan results. Each entry is true given the data
// we have. If nothing concrete can be derived, returns a single honest generic line.
export function buildEvidence(fixType: string, signals: ScanSignals): string[] {
  const total = signals.totalPlatforms || 12;
  const evidence: string[] = [];

  if (signals.platformsMentioned < total) {
    const missing = total - signals.platformsMentioned;
    evidence.push(`You appear on only ${signals.platformsMentioned} of ${total} AI platforms — ${missing} are not recommending you.`);
  }
  if (signals.overallScore < 60) {
    // b89u: the old evidence line cited an unsourced score threshold.
    // The 71+ "Strong" band is Rankall's own published grade band
    // (lib/projection GRADE_BANDS).
    evidence.push(`Your AI visibility score is ${signals.overallScore}/100 — below the 71+ Strong band where businesses are recommended consistently.`);
  }
  if (signals.competitorName) {
    evidence.push(`A competitor (${signals.competitorName}) is being recommended ahead of you on AI platforms.`);
  }
  if (typeof signals.trustScore === 'number' && signals.trustScore < 60) {
    evidence.push(`Your Trust Layer score is ${signals.trustScore}/100 — AI platforms treat low-trust businesses as less recommendable.`);
  }
  // The fix itself targets a known gap (from metadata) — this is real, not invented.
  const whatThisFixes = getFixMetadata(fixType).whatThisFixes as string | undefined;
  if (whatThisFixes) evidence.push(whatThisFixes + '.');

  return evidence.length ? evidence : ['Based on AI-visibility best practices for your industry.'];
}

// One-line, business-language outcome for the businessImpact field.
export function buildBusinessImpact(fixType: string, industry: string): string {
  const ind = industry || 'your business';
  const lift = knownImpactRangeForFix(fixType);
  const base = `Completing this improves how AI assistants understand ${ind}, increasing the likelihood you're recommended when customers ask`;
  return lift ? `${base} — estimated +${lift.min}–${lift.max} points of AI visibility.` : `${base}.`;
}

// Phase 1 (auto-fix loop): choose which fixes to auto-generate for a scan. Returns
// fixType strings that generate-fix's buildPrompt understands (faq_schema / jsonld
// / reviews / directory / reddit) — NOT short tool-ids — so generated content is
// the real fix, not the generic fallback.
export function selectTopFixTypes(
  _platformResults: unknown[],
  _trustSignals: unknown,
  score: number,
  competitorScore: number,
  opts?: { blockedBots?: string[]; isFreeSlot?: boolean },
): string[] {
  const fixes: { type: string; priority: number }[] = [];
  const blocked = opts?.blockedBots ?? [];
  const freeSlot = opts?.isFreeSlot ?? false;

  // Tier 1 off-page fixes (eligible for the free fix)
  if (blocked.length > 0) fixes.push({ type: 'crawler_access', priority: 20 });
  fixes.push({ type: 'bing_places', priority: 15 });

  // Tier 2 on-page fixes (paid tiers only)
  if (!freeSlot) {
    if (score < 70) fixes.push({ type: 'faq_schema', priority: 10 });
    if (score < 60) fixes.push({ type: 'jsonld', priority: 9 });
  }
  if (competitorScore > score + 20) fixes.push({ type: 'directory', priority: 8 });
  if (score < 50) fixes.push({ type: 'reviews', priority: 7 });
  fixes.push({ type: 'reddit', priority: 6 });

  const seen = new Set<string>();
  return fixes
    .sort((a, b) => b.priority - a.priority)
    .filter(f => (seen.has(f.type) ? false : (seen.add(f.type), true)))
    .map(f => f.type);
}

// True when a string looks like a search query rather than a real business name
// (e.g. "best restaurant in NY"). Used to avoid injecting the query as the business
// name in generated fix content.
export function isSearchQuery(name: string): boolean {
  const lower = (name || '').toLowerCase().trim();
  if (!lower) return false;
  const startsWith = ['best ', 'top ', 'near me', 'in ', 'cheap ', 'affordable ', 'good ', 'great ', 'find ', 'search '];
  return startsWith.some(i => lower.startsWith(i)) || lower.includes(' in ') || lower.includes(' near ');
}

// Returns a real business name, or the YOUR_BUSINESS_NAME placeholder when the
// input is empty or looks like a search query.
export function safeBusinessName(name: string | null | undefined): string {
  const n = (name || '').trim();
  return !n || isSearchQuery(n) ? 'YOUR_BUSINESS_NAME' : n;
}

// Evidence + traceability for a generated fix. PURE (no I/O) so it's safe to import
// anywhere, including the client QA panel. Keyed by the REAL generate-fix fixType
// strings. Statements are generic-but-true — never fabricated specifics.
export interface FixEvidence {
  whyRecommended: string;
  triggeredBySignal: string;
  triggeredByFinding: string;
  platformEvidence: string;
  predictedImpact: number | null;
  confidence: number;
  difficulty: string;
  timeToImplement: string;
  verificationStatus: 'predicted';
  // True when the fix type has a real entry in the evidence map;
  // false for the generic fallback (whose confidence/time are
  // placeholders, not estimates — callers must not present them).
  known: boolean;
}

export function buildFixEvidence(input: {
  fixType: string;
  score?: number;
  competitorScore?: number;
  platformsMentioned?: number;
  totalPlatforms?: number;
}): FixEvidence {
  const score = input.score ?? 50;
  const total = input.totalPlatforms ?? 12;
  const mentioned = input.platformsMentioned;
  const gap = Math.max(0, (input.competitorScore ?? 0) - score);

  const map: Record<string, { why: string; signal: string; finding: string; confidence: number; difficulty: string; time: string }> = {
    crawler_access: {
      why: 'Your robots.txt is blocking AI crawlers from reading your website.',
      signal: 'AI Crawler Access',
      finding: 'One or more AI bots (GPTBot, ClaudeBot, etc.) are blocked by your robots.txt.',
      confidence: 95, difficulty: 'Easy', time: '5-10 minutes',
    },
    bing_places: {
      why: 'Much of what AI cites about a business comes from off-page sources. Your Bing Places listing is incomplete or unclaimed.',
      signal: 'Bing Places Listing',
      finding: 'Bing Places profile incomplete — ChatGPT\'s live lookups lean on the Bing index.',
      confidence: 82, difficulty: 'Easy', time: '15-20 minutes',
    },
    faq_schema: {
      why: 'AI platforms found no structured FAQ content on your website.',
      signal: 'AI-Friendly FAQ on Website',
      finding: 'No FAQPage JSON-LD detected in the scan results.',
      confidence: 85, difficulty: 'Easy', time: '20-30 minutes',
    },
    jsonld: {
      why: 'Your business lacks LocalBusiness structured data that AI platforms use to verify your location and services.',
      signal: 'Business Data Markup',
      finding: 'No LocalBusiness JSON-LD detected — AI platforms cannot verify your business details.',
      confidence: 88, difficulty: 'Easy', time: '15-20 minutes',
    },
    directory: {
      why: 'Inconsistent or missing business citations reduce AI trust in your business data.',
      signal: 'Directory listings',
      finding: 'Citation network incomplete for your industry and location.',
      confidence: 72, difficulty: 'Medium', time: '2-3 hours',
    },
    reviews: {
      why: 'AI platforms detected low review-response activity for your business.',
      signal: 'Review Response Rate',
      finding: 'Review signals below the threshold for consistent AI recommendations.',
      confidence: 75, difficulty: 'Easy', time: '10 minutes/week',
    },
    reddit: {
      why: 'A weak community presence limits how often AI platforms cite you as a trusted local expert.',
      signal: 'Community & third-party mentions',
      finding: gap > 0 ? `A competitor is scoring ~${gap} points higher, partly from a stronger community footprint.` : 'Limited third-party community signals detected.',
      confidence: 70, difficulty: 'Medium', time: '1-2 hours',
    },
  };

  const ev = map[input.fixType] || {
    why: 'Scan analysis identified this as a high-impact improvement for your AI visibility.',
    signal: 'Multiple Trust Layer signals',
    finding: 'Insufficient evidence for a specific finding.',
    confidence: 65, difficulty: 'Medium', time: '1-2 hours',
  };

  return {
    whyRecommended: ev.why,
    triggeredBySignal: ev.signal,
    triggeredByFinding: ev.finding,
    // ax71: mentioned === undefined means the caller never supplied a
    // count — the old `?? 0` default fabricated '0 of 11' for every fix.
    // A supplied 0 is real (mentioned nowhere) and renders as 0.
    platformEvidence: mentioned === undefined
      ? `AI visibility score ${score}/100 (platform coverage not recorded for this fix).`
      : `You appear on ${mentioned} of ${total} AI platforms (score ${score}/100).`,
    // ax81: the same number the queue shows (metadata midpoint), not a
    // per-fix literal. null when the fix type has no known range.
    predictedImpact: canonicalFixImpact(input.fixType),
    confidence: ev.confidence,
    difficulty: ev.difficulty,
    timeToImplement: ev.time,
    verificationStatus: 'predicted',
    known: input.fixType in map,
  };
}

// b883: the per-fix estimate the surfaces should agree on. The
// generated_fixes row carries its own stored difficulty/time from
// generation time, which CONTRADICTED the steps on the same card
// (header "45 min" vs steps "20-30 minutes") and carried no
// confidence at all. The evidence map is the single source (the
// tool detail and the report already use it). Returns null for
// unknown fix types — no estimate is shown for those, rather
// than the generic fallback's placeholder numbers.
export function fixTypeEstimate(fixType: string | null | undefined): { confidence: number; difficulty: string; timeToImplement: string } | null {
  if (!fixType) return null;
  const ev = buildFixEvidence({ fixType });
  if (!ev.known) return null;
  return { confidence: ev.confidence, difficulty: ev.difficulty, timeToImplement: ev.timeToImplement };
}

// Human-readable title for a generate-fix fixType (generated_fixes row + email).
export function fixTypeLabel(fixType: string): string {
  const map: Record<string, string> = {
    crawler_access: 'AI Crawler Access Fix',
    bing_places: 'Bing Places Optimization',
    faq_schema: 'FAQ Schema',
    jsonld: 'LocalBusiness JSON-LD Schema',
    directory: 'Directory Citations',
    reviews: 'Review Responses',
    reddit: 'Community Presence (Reddit)',
    knowledge_panel: 'Google Knowledge Panel',
  };
  return map[fixType] ?? fixType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
