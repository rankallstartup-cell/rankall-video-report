// lib/rescanTrust.ts — like-for-like trust inputs for re-scans.
//
// The weekly rescan (app/api/rescan-weekly) and competitor scans must call
// detectTrustSignals on the same basis as /api/scan: the same website
// (user-supplied when we have it), the same websiteVerified flag (a
// Places-discovered site is NOT verified — its <title> may belong to
// another business, #40) and the same competitorNames attribution list.

/** Website for a rescan: the user-supplied site stored on the original
 *  scan (`website_url`, when that column exists and is set) is verified;
 *  otherwise the confidently-matched Google Places website is used but
 *  marked unverified, exactly as /api/scan treats it. */
export function resolveRescanWebsite(
  originalScan: { website_url?: unknown } | null | undefined,
  trustedGoogleWebsite: string | null | undefined,
): { websiteUrl: string | undefined; websiteVerified: boolean } {
  const stored = typeof originalScan?.website_url === 'string' ? originalScan.website_url.trim() : '';
  if (stored) return { websiteUrl: stored, websiteVerified: true };
  const places = typeof trustedGoogleWebsite === 'string' ? trustedGoogleWebsite.trim() : '';
  return { websiteUrl: places || undefined, websiteVerified: false };
}

/** Distinct non-empty competitor names (same shape /api/scan passes). */
export function competitorNameList(names: Array<string | null | undefined>): string[] {
  return [...new Set(names.filter((c): c is string => typeof c === 'string' && c.trim().length > 0))];
}
