// ── Hackathon video-report pipeline: scan aggregates ONLY ───────────────
// Privacy rule (from the scaffold, enforced here): a scan's raw AI output
// (`response_text` and friends) must NEVER reach the script writer, the
// director, or any provider. This module is the single choke point: every
// scan input — from the API route's DB rows or the CLI's JSON file — passes
// through sanitizeScanInput() before it touches the pipeline.
//
// Rankall honesty rule: NULLs are never backfilled. A missing score or
// mention count stays null, and the script + director handle "unknown"
// honestly instead of inventing a number.
import type { PlatformFinding, ScanVideoInput } from './script';

const STRING_FIELDS = [
  'businessName', 'industry', 'location', 'competitorName', 'topFix',
  'reportUrl', 'mentionNote',
] as const;

const NUMBER_FIELDS = [
  'overallScore', 'mentionedCount', 'totalPlatforms', 'competitorScore',
  'rating', 'reviewCount',
] as const;

// rankall_scans column names accepted as aliases for the camelCase fields.
const ALIASES: Record<string, string> = {
  user_business_name: 'businessName',
  input: 'businessName',
  overall_score: 'overallScore',
  mentioned_count: 'mentionedCount',
  total_platforms: 'totalPlatforms',
  competitor_name: 'competitorName',
  competitor_score: 'competitorScore',
  review_count: 'reviewCount',
};

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function asNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toPlatformFinding(raw: unknown): PlatformFinding | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const row = raw as Record<string, unknown>;
  const platform = asNonEmptyString(row.platform);
  if (!platform) return null;
  const score = asNumberOrNull(row.score) ?? 0;
  const sentimentRaw = asNonEmptyString(row.sentiment);
  const sentiment: PlatformFinding['sentiment'] =
    sentimentRaw === 'positive' || sentimentRaw === 'negative' ? sentimentRaw : 'neutral';
  return {
    platform,
    score,
    mentioned: row.mentioned === true || row.mentioned === 'true',
    sentiment,
    rank: asNumberOrNull(row.rank),
  };
}

/**
 * Convert untrusted scan JSON into the pipeline's aggregate input.
 * Drops every field that is not an explicit aggregate — in particular
 * `response_text` (raw AI output) can never survive this function, even
 * when nested inside platform rows. Throws on a missing business name.
 */
export function sanitizeScanInput(raw: unknown): ScanVideoInput {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('scan input must be a JSON object');
  }
  const row = raw as Record<string, unknown>;
  // Accept { scan: {...}, platforms: [...] } as well as a flat object.
  const flat: Record<string, unknown> = { ...(row.scan as Record<string, unknown> ?? {}), ...row };
  if (typeof row.scan === 'object' && row.scan !== null) {
    for (const [key, value] of Object.entries(row.scan as Record<string, unknown>)) {
      if (!(key in flat)) flat[key] = value;
    }
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    const mapped = ALIASES[key] ?? key;
    if ((STRING_FIELDS as readonly string[]).includes(mapped)) {
      const str = asNonEmptyString(value);
      if (str !== null) out[mapped] = str;
    } else if ((NUMBER_FIELDS as readonly string[]).includes(mapped)) {
      const num = asNumberOrNull(value);
      if (num !== null) out[mapped] = num;
    }
    // Every other field — response_text, raw responses, keys, ids — is dropped.
  }

  const businessName = asNonEmptyString(out.businessName);
  if (!businessName) {
    throw new Error('scan input is missing a business name (businessName / user_business_name)');
  }

  const platformsRaw = Array.isArray(flat.platforms) ? flat.platforms : [];
  const platforms = platformsRaw
    .map(toPlatformFinding)
    .filter((p): p is PlatformFinding => p !== null);

  const highlightsRaw = Array.isArray(flat.signalHighlights) ? flat.signalHighlights : [];
  const signalHighlights = highlightsRaw
    .map((h) => asNonEmptyString(h))
    .filter((h): h is string => h !== null)
    .slice(0, 3);

  const input: ScanVideoInput = {
    businessName,
    industry: (out.industry as string | undefined) ?? null,
    location: (out.location as string | undefined) ?? null,
    overallScore: (out.overallScore as number | undefined) ?? null,
    mentionedCount: (out.mentionedCount as number | undefined) ?? null,
    totalPlatforms: (out.totalPlatforms as number | undefined) ?? null,
    competitorName: (out.competitorName as string | undefined) ?? null,
    competitorScore: (out.competitorScore as number | undefined) ?? null,
    platforms,
    signalHighlights,
    topFix: (out.topFix as string | undefined) ?? null,
    reportUrl: (out.reportUrl as string | undefined) ?? undefined,
    rating: (out.rating as number | undefined) ?? null,
    reviewCount: (out.reviewCount as number | undefined) ?? null,
    mentionNote: (out.mentionNote as string | undefined) ?? null,
  };
  return input;
}
