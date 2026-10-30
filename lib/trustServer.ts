// lib/trustServer.ts — SERVER-ONLY trust entry (fetching).
//
// detectTrustSignals fetches the business's website server-side, so
// it lives here (not in lib/trust.ts, which client components import
// and which must stay client-bundle-safe). Website fetches go through
// fetchPublicUrlWithDns (ax89 SSRF guard: scheme + localhost +
// literal-private-IP + DNS answers + per-hop redirect validation).
// Never import this module from a client component.
import { getCountryConfig } from './countryConfig';
import { fetchPublicUrlWithDns } from './ssrf-server';
import {
  buildTechnicalSignals,
  buildDirectorySignals,
  buildReviewSignals,
  buildCommunitySignals,
  buildAIPlatformSignals,
  calculateOverall,
  coreBusinessName,
  hasAddress,
  hasPhoneNumber,
  type TrustSignalReport,
  type RedditEnrichment,
} from './trust';

// ax89 residual: cap on the HTML we read (a hostile or huge page must not
// exhaust memory) — enough for any real homepage.
export const MAX_HTML_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10000;

// Read a response body up to `maxBytes`, decoding as UTF-8. Streams when
// the runtime exposes res.body; falls back to text() + truncation.
async function readCappedText(res: Response, maxBytes: number): Promise<string> {
  const body = (res as { body?: ReadableStream<Uint8Array> | null }).body;
  if (body && typeof body.getReader === 'function') {
    const reader = body.getReader();
    const decoder = new TextDecoder('utf-8');
    let out = '';
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const remaining = maxBytes - received;
      const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
      received += chunk.byteLength;
      out += decoder.decode(chunk, { stream: true });
      if (received >= maxBytes) {
        try { await reader.cancel(); } catch { /* ignore */ }
        break;
      }
    }
    return out + decoder.decode();
  }
  const text = await res.text();
  return text.length > maxBytes ? text.slice(0, maxBytes) : text;
}

export async function fetchWebsiteHtml(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    // ax89: fetchPublicUrl validates the target + every redirect hop.
    const res = await fetchPublicUrlWithDns(normalized, {
      signal: controller.signal,
      // Real browser UA + Accept headers — a custom "RankAll Trust Scanner" UA
      // gets 403-blocked by many sites' CDN/WAF (Cloudflare etc.), which made
      // trust scans report a valid, reachable site as "Website not analyzed".
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) return null;
    // ax89 residual: the timeout stays armed THROUGH the body read (it was
    // cleared right after headers, so a slow-drip body could hang the
    // scan), and the body is capped at MAX_HTML_BYTES.
    return await readCappedText(res, MAX_HTML_BYTES);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ax89 residual: subpage URLs are built from the site ORIGIN — appending
// "/contact" to the raw URL produced "https://x.com/?ref=gbp/contact" or
// "https://x.com/page.html/contact".
export function subpageUrls(websiteUrl: string, paths: string[] = ['/contact', '/contact-us', '/about']): string[] {
  try {
    const normalized = /^https?:\/\//i.test(websiteUrl) ? websiteUrl : `https://${websiteUrl}`;
    const origin = new URL(normalized).origin;
    return paths.map(p => `${origin}${p}`);
  } catch {
    return [];
  }
}

export async function detectTrustSignals(params: {
  businessInput: string;
  websiteUrl?: string;
  // ax87: per-response attribution from the analyser's mentionRate.
  // A missing flag defaults to attributed (backwards compatible).
  scanResults: Array<{ platform: string; response: string | null; mentioned?: boolean }>;
  citationSources: string[];
  industry?: string;
  enrichment?: {
    reddit?: RedditEnrichment | null;
    google?: { rating?: number | null; reviewCount?: number | null; name?: string | null } | null;
    serpData?: Record<string, boolean | undefined> | null;
  } | null;
  // #40: true only when the user supplied/verified websiteUrl. A URL
  // discovered elsewhere (Places) is unverified: a non-matching title from
  // it is never quoted.
  websiteVerified?: boolean;
  // ax87: longer known competitor names — a mention of this business
  // inside one of them is attributed to the competitor.
  competitorNames?: string[];
}, countryCode: string = 'US'): Promise<TrustSignalReport> {
  const { businessInput, websiteUrl, scanResults, citationSources, enrichment } = params;

  const countryConfig = getCountryConfig(countryCode);
  const localTrustSources = countryConfig.trustSources;

  // ax87: attribution — pattern matches only count when they refer to THIS
  // business. A response that never mentions the business (a competitor
  // list, generic advice) must not contribute review/community/AI/
  // directory signals. Only attributed responses feed the builders below;
  // totalPlatforms keeps the full denominator for the mention-rate signal.
  const attributedResults = scanResults.filter(r => r.mentioned !== false);
  const attributedText = attributedResults
    .map(r => r.response ?? '')
    .filter(Boolean)
    .join('\n');
  const totalPlatforms = scanResults.length;

  let html: string | null = null;
  let fetchFailed = false;
  let extraHtml = '';

  if (websiteUrl) {
    html = await fetchWebsiteHtml(websiteUrl);
    if (!html) {
      fetchFailed = true;
    } else if (!hasAddress(html) || !hasPhoneNumber(html)) {
      // Address/phone often live only on /contact or /about — the old
      // homepage-only check reported false 'Address missing'. Fetch the
      // key subpages in parallel (bounded by the per-fetch timeout) and
      // fold them into the address/phone checks only.
      const sub = await Promise.all(subpageUrls(websiteUrl).map(u => fetchWebsiteHtml(u)));
      extraHtml = sub.filter(Boolean).join('\n');
    }
  }

  // azzu: the title check must use the RESOLVED business name. The raw
  // input can be typo'd ('Bright Smile Dental Dallas TX' vs resolved
  // 'Brite Smiles Dentistry') — checking the title against the typo made
  // the signal blame the website for not containing the typo, even when
  // the title held the resolved name exactly. Places canonical name wins;
  // raw input is only the fallback when no resolved name exists.
  // b8ad: core name only — a Places name carrying its SEO tagline
  // ('Royal Lane Dental Center - Best Dentist in Dallas | ...') makes
  // every real title fail the check. See coreBusinessName.
  const titleCheckName = coreBusinessName(enrichment?.google?.name || businessInput);
  // ax87 (d): the SAME resolved name drives review/community/AI
  // attribution — matching the raw typed input ('Bright Smile Dental
  // Dallas TX') missed every sentence about the resolved business.
  const attributionName = titleCheckName;
  const attributionOpts = { competitorNames: params.competitorNames ?? [] };
  const technical = buildTechnicalSignals(html, websiteUrl, titleCheckName, fetchFailed || !websiteUrl, extraHtml, { websiteVerified: params.websiteVerified === true });
  const directory = buildDirectorySignals(citationSources, attributedText, localTrustSources, {
    industry: params.industry,
    google: params.enrichment?.google ?? null,
    serpData: (params.enrichment?.serpData ?? null) as Record<string, boolean | undefined> | null,
    businessName: attributionName,
    competitorNames: attributionOpts.competitorNames,
  });
  const reviews = buildReviewSignals(attributedResults, attributedText, attributionName, enrichment?.google ?? null, attributionOpts);
  const community = buildCommunitySignals(attributedText, enrichment?.reddit, attributionName, attributionOpts);
  // b8ad: responded count (platforms that answered) so the mention-rate
  // value can reconcile coverage (of 11) with response rate.
  const respondedPlatforms = scanResults.filter(r => r.response).length;
  const aiPlatforms = buildAIPlatformSignals(attributedResults, attributionName, totalPlatforms, respondedPlatforms);

  const allSignals = [...technical, ...directory, ...reviews, ...community, ...aiPlatforms];

  return {
    technical,
    directory,
    reviews,
    community,
    aiPlatforms,
    overall: calculateOverall(allSignals),
  };
}
