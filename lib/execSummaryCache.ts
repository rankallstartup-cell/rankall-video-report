// ── Executive summary localStorage cache (report page) ────────────────────
// Item 7: the summary was cached for 24h under `rankall_exec_summary_<id>`
// even when it was generated from pre-fix data, or from a race where the
// platform results hadn't loaded yet (mentionedCount = 0 → "you appear on 0
// platforms" bullets that then stuck for a day). Now:
//   * the key carries a VERSION — bump it whenever the summary inputs or
//     their derivation change, and every older cached summary is ignored;
//   * the page only requests (and so only caches) a summary once the
//     platform results AND the fix queue have settled successfully.

export const EXEC_SUMMARY_CACHE_VERSION = 'v2';
export const EXEC_SUMMARY_TTL_MS = 24 * 60 * 60 * 1000;

export function execSummaryCacheKey(scanId: string, version: string = EXEC_SUMMARY_CACHE_VERSION): string {
  return `rankall_exec_summary_${version}_${scanId}`;
}

/** The pre-versioning key — removed on read so stale summaries don't linger. */
export function legacyExecSummaryCacheKey(scanId: string): string {
  return `rankall_exec_summary_${scanId}`;
}

/** Parse a cached entry; null when missing, malformed or expired. */
export function readExecSummaryCache(raw: string | null, now: number, ttlMs: number = EXEC_SUMMARY_TTL_MS): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { bullets?: unknown; ts?: unknown };
    if (!Array.isArray(parsed.bullets) || parsed.bullets.length === 0) return null;
    if (!parsed.bullets.every(b => typeof b === 'string')) return null;
    if (typeof parsed.ts !== 'number' || now - parsed.ts >= ttlMs || parsed.ts > now) return null;
    return parsed.bullets as string[];
  } catch {
    return null;
  }
}

/** Only summarise from fully-loaded data — never from a half-loaded page. */
export function shouldRequestExecSummary(s: {
  resultsLoaded: boolean;
  platformError: boolean;
  fixesSettled: boolean;
}): boolean {
  return s.resultsLoaded && !s.platformError && s.fixesSettled;
}
