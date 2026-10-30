// ── Outreach failure shapes (fix #10) ─────────────────────────────────────
// Three small honesty fixes for the dashboard outreach flow:
//  (a) a failed SerpAPI search is an explicit error, never a silent [];
//  (b) a successful search with zero targets says so, with the search terms;
//  (c) the CSV export's report_url is the public /r/<id> link ONLY when the
//      scan is shareable (same rule as fix #1: ownerless → shareable,
//      owned → only if is_public). Ineligible → empty column, never a link
//      to a private report.
// Pure functions — no I/O — so they are unit-testable without SerpAPI.

import { canServePublicShare, isScanId } from './reportPayload';

/** Stable error code the dashboard page maps to friendly copy. */
export const TARGET_SEARCH_FAILED_CODE = 'target_search_failed';

/** The only SerpAPI-failure copy a user ever sees. Never includes the raw
 *  provider error body (it can carry request internals). */
export const TARGET_SEARCH_FAILED_MESSAGE = 'Target search failed — please try again.';

/** The 502 the find-targets route returns when SerpAPI fails. */
export function toTargetSearchErrorResponse(): {
  status: number;
  body: { error: string; message: string };
} {
  return {
    status: 502,
    body: { error: TARGET_SEARCH_FAILED_CODE, message: TARGET_SEARCH_FAILED_MESSAGE },
  };
}

/** Explicit empty state for a search that worked but found nothing. */
export function noTargetsMessage(industry: string, city: string): string {
  return `No targets found for ${industry} in ${city}. Try a different city or industry.`;
}

export interface OutreachTarget {
  businessName: string;
  address: string;
  phone: string;
  website: string | null;
  hasWebsite: boolean;
  rating: number | null;
  reviewCount: number | null;
  placeId: string | null;
  /** Quality score 0-2 (+1 website, +1 reviews). Filled by the find-targets route after dedupe. */
  qualityScore: number;
  /** Heuristic chain/franchise signal. Filled by the find-targets route after dedupe. */
  likelyChain: boolean;
}

/**
 * One SerpAPI Google Maps query. THROWS on any failure (non-OK status,
 * network error, unparseable body) — callers must turn that into an
 * explicit error response, never a silent [] that looks like "no targets".
 * `fetchFn` is injectable so tests can stub SerpAPI (no live calls).
 */
export async function fetchMapsResults(
  query: string,
  apiKey: string,
  gl: string = 'us',
  fetchFn: typeof fetch = fetch,
): Promise<OutreachTarget[]> {
  const params = new URLSearchParams({ engine: 'google_maps', q: query, api_key: apiKey, gl, hl: 'en', type: 'search' });
  const res = await fetchFn(`https://serpapi.com/search.json?${params}`);
  if (!res.ok) throw new Error(`SerpAPI non-OK: ${res.status}`);
  const data = await res.json();

  const localResults: any[] =
    Array.isArray(data?.local_results)         ? data.local_results :
    Array.isArray(data?.local_results?.places) ? data.local_results.places :
    Array.isArray(data?.places_results)        ? data.places_results :
    Array.isArray(data?.local_pack)            ? data.local_pack :
    [];

  return localResults.map((r: any) => {
    const website = r.website || r.links?.website || null;
    return {
      businessName: r.title || r.name || '',
      address:      r.address || '',
      phone:        r.phone || '',
      website:      website || null,
      hasWebsite:   !!website,
      rating:       r.rating ?? null,
      reviewCount:  r.reviews ?? r.review_count ?? null,
      placeId:      r.place_id || r.data_id || null,
      qualityScore: 0, // filled by the route, after dedupe
      likelyChain:  false, // filled by the route, after dedupe
    };
  });
}

/**
 * Fix #1's eligibility rule, applied to a scan row for the CSV export.
 * Ownerless scans are shareable; owned scans only when the owner published
 * them. (Fix #1's resolvePublicReportUrl is not on staging yet, so this
 * applies the same rule via the canonical canServePublicShare.)
 */
export function isScanShareable(userId: string | null | undefined, isPublic: unknown): boolean {
  return canServePublicShare(userId, isPublic);
}

export function isValidScanId(id: unknown): boolean {
  return isScanId(id);
}

/**
 * The CSV export's report_url value: the public /r/<id> link when the scan
 * is shareable, '' otherwise. Never a link to a private report.
 */
export function resolveCsvReportUrl(scanId: string | null | undefined, shareable: boolean): string {
  if (!scanId || !shareable) return '';
  return `https://www.rankall.io/r/${scanId}`;
}
