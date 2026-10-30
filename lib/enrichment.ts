// lib/enrichment.ts
export interface EnrichmentData {
  google?: {
    reviewCount: number | null;
    rating: number | null;
    // azzt: Google Places has NO claimed-status field. This is the
    // listing's OPERATIONAL status (business_status === 'OPERATIONAL') —
    // an unclaimed listing is still OPERATIONAL. Never read it as claimed.
    operational?: boolean;
    // Legacy rows (pre-azzt) stored the same OPERATIONAL boolean under the
    // misleading name `claimed`. Read-only fallback; never written.
    claimed?: boolean;
    address: string | null;
    phone: string | null;
    website: string | null;
    hours: string | null;
    photos: number | null;
    category: string | null;
    // Identity + geo — the canonical anchors for the business entity layer.
    placeId: string | null;
    name: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  serpData?: {
    localPackPosition: number | null;
    competitorInPack: string | null;
    yelpPresent: boolean;
    tripadvisorPresent: boolean;
    healthgradesPresent: boolean;
    avvoPresent: boolean;
    zillowPresent: boolean;
    linkedinPresent: boolean;
    facebookPresent: boolean;
  };
  pageSpeed?: {
    performanceScore: number | null;
    mobileScore: number | null;
    lcp: number | null;
    cls: number | null;
    fid: number | null;
  };
  reddit?: {
    mentionCount: number;
    topSubreddits: string[];
    sentiment: 'positive' | 'neutral' | 'negative' | null;
  };
  dataforSeo?: {
    localRank: number | null;
    citationCount: number | null;
    napConsistency: boolean;
  };
}

import { businessNamesMatch } from './dataQuality';
import { mentionsBusinessName } from './trust';

// ── GBP match validation ────────────────────────────────────────────────────
// Google Places is a fuzzy matcher: it returns the closest place even when no
// place actually matches the query ("Bright Smile Dental" + Dallas →
// "Brite Smiles Dentistry" in Flower Mound). Never trust the first result:
// require a confident name match AND a city match before accepting a
// candidate as the scanned business. Prefer no-match over wrong-match —
// a rejected candidate surfaces as an honest "no confident match" instead
// of another business's reviews, address, and phone presented as your own.

const CITY_ALIASES: Record<string, string> = { st: 'saint', ft: 'fort', mt: 'mount' };

function normalizeForCity(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => CITY_ALIASES[w] || w)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when the candidate's address is in the queried city. No city given → true (nothing to check against). No address → false (can't prove it's in the city). */
export function addressMatchesCity(address: string | null | undefined, city: string | null | undefined): boolean {
  if (!city || !city.trim()) return true;
  if (!address) return false;
  const a = ` ${normalizeForCity(address)} `;
  const c = normalizeForCity(city);
  if (!c) return true;
  return a.includes(` ${c} `);
}

/** A Places candidate is a confident match only when its name matches the queried business AND its address is in the queried city. */
export function isConfidentPlaceMatch(
  queryName: string,
  queryCity: string | null | undefined,
  candidateName: string | null | undefined,
  candidateAddress: string | null | undefined,
): boolean {
  if (!queryName || !candidateName) return false;
  if (!businessNamesMatch(queryName, candidateName, queryCity || undefined)) return false;
  if (!addressMatchesCity(candidateAddress, queryCity)) return false;
  return true;
}

// ── Render-time re-validation for STORED Google data ───────────────────────
// Pre-PR #37 scans stored the first fuzzy Places result with zero validation,
// so old reports can carry another business's Google data ("Brite Smiles
// Dentistry", Flower Mound, saved as "Bright Smile Dental", Dallas). Fresh
// scans are protected by isConfidentPlaceMatch; old rows are not. These
// helpers re-run the SAME check at render time so old reports never show
// wrong-business data. Read-only: no DB writes, no migration, no backfill.

/**
 * Returns the stored enrichment.google only when it passes the confident
 * name + city match against the scan's own query. Otherwise undefined —
 * the caller renders an honest no-match state instead. Never throws.
 */
export function getTrustedStoredGoogle(
  input: string | null | undefined,
  location: string | null | undefined,
  google: EnrichmentData['google'] | null | undefined,
): EnrichmentData['google'] | undefined {
  if (!google) return undefined;
  try {
    if (!isConfidentPlaceMatch(input || '', location, google.name, google.address)) return undefined;
  } catch {
    return undefined;
  }
  return google;
}

/**
 * b87d: contact details (NAP) for a public /business/[slug] page. The
 * businesses row's address/phone/website came from the Google match, so a
 * pre-validation wrong match published another business's address and
 * phone under this page (Flower Mound NAP on a Dallas page). When the
 * stored address is not in the business's own city, none of the Google
 * contact fields are trusted. No address → nothing contradicts the rest.
 */
export function getTrustedBusinessContact(b: {
  city: string | null | undefined;
  address: string | null | undefined;
  phone: string | null | undefined;
  website: string | null | undefined;
}): { address: string | null; phone: string | null; website: string | null } {
  const address = b.address?.trim() || null;
  if (address && b.city && !addressMatchesCity(address, b.city)) {
    return { address: null, phone: null, website: null };
  }
  return { address, phone: b.phone?.trim() || null, website: b.website?.trim() || null };
}

/**
 * Display name for a report. The scan route saves user_business_name from
 * the Google name (g?.name) when enrichment matched, so a poisoned stored
 * Google name also poisoned the stored heading. When the stored Google data
 * fails re-validation, fall back to the scan's own queried input — never
 * show the wrong business's name as the heading. When there is no stored
 * Google name to distrust, the stored name stands (e.g. Knowledge Panel
 * titles, which have their own validation).
 */
export function getTrustedDisplayName(
  input: string | null | undefined,
  location: string | null | undefined,
  userBusinessName: string | null | undefined,
  google: EnrichmentData['google'] | null | undefined,
): string {
  if (google?.name) {
    try {
      if (!isConfidentPlaceMatch(input || '', location, google.name, google.address)) {
        return input || userBusinessName || 'Business';
      }
    } catch {
      // Fail open to the stored name — a validator crash must not blank headings.
    }
  }
  return userBusinessName || input || 'Business';
}

export async function fetchSerpData(query: string, location: string, countryCode: string = 'US'): Promise<EnrichmentData['serpData']> {
  try {
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey) return undefined;

    const params = new URLSearchParams({
      api_key: apiKey,
      engine: 'google',
      q: query,
      // azzz: gl from the BUSINESS's country. The old hardcoded
      // gl='us' gave every GB/AU/IE business US SERP presence flags
      // (yelpPresent etc.) — the wrong market. hl stays 'en': every
      // supported market searches in English (CountryConfig has no
      // per-country language field).
      gl: countryCode.toLowerCase(),
      hl: 'en',
      num: '10',
    });

    const res = await fetch(`https://serpapi.com/search.json?${params}`);
    const data = await res.json();

    if (data.error) {
      console.error('SerpAPI error:', data.error);
      return undefined;
    }

    const allText = JSON.stringify(data).toLowerCase();
    const localResults = data.local_results?.places || data.local_results || [];

    return {
      localPackPosition: localResults.length > 0 ? 1 : null,
      competitorInPack: localResults[0]?.title || null,
      yelpPresent: allText.includes('yelp.com'),
      tripadvisorPresent: allText.includes('tripadvisor.com'),
      healthgradesPresent: allText.includes('healthgrades.com'),
      avvoPresent: allText.includes('avvo.com'),
      zillowPresent: allText.includes('zillow.com'),
      linkedinPresent: allText.includes('linkedin.com'),
      facebookPresent: allText.includes('facebook.com'),
    };
  } catch (err) {
    console.error('SerpAPI fetch error:', err);
    return undefined;
  }
}

export interface PlacesLookupResult {
  hasListing: boolean;
  placeId: string | null;
  placeTypes: string[] | null;
  placeName: string | null;
  placeWebsite: string | null;
  placePhone: string | null;
  placeAddress: string | null;
}

export async function lookupGooglePlace(name: string, location: string, category?: string): Promise<PlacesLookupResult> {
  const none: PlacesLookupResult = { hasListing: false, placeId: null, placeTypes: null, placeName: null, placeWebsite: null, placePhone: null, placeAddress: null };
  try {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) return none;
    const searchQuery = `${name}${category ? ' ' + category : ''}${location ? ' ' + location : ''}`;
    const params = new URLSearchParams({
      input: searchQuery,
      inputtype: 'textquery',
      fields: 'place_id,name,types,formatted_address',
      key: apiKey,
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?${params}`,
      { signal: controller.signal },
    );
    const data = await res.json();
    const candidate = data.candidates?.[0];
    if (!candidate) { clearTimeout(timer); return none; }
    // Find Place returns the closest fuzzy match even when nothing matches.
    // Validate before trusting it — a different-city / different-spelling
    // candidate must never be accepted as the queried business.
    if (!isConfidentPlaceMatch(name, location, candidate.name, candidate.formatted_address)) {
      console.log('[lookupGooglePlace] rejecting candidate:', candidate.name, '|', candidate.formatted_address, '| for query:', searchQuery);
      clearTimeout(timer);
      return none;
    }

    let placeWebsite: string | null = null;
    let placePhone: string | null = null;
    let placeAddress: string | null = null;
    if (candidate.place_id) {
      try {
        const detailsParams = new URLSearchParams({
          place_id: candidate.place_id,
          fields: 'website,international_phone_number,formatted_address',
          key: apiKey,
        });
        const detailsRes = await fetch(
          `https://maps.googleapis.com/maps/api/place/details/json?${detailsParams}`,
          { signal: controller.signal },
        );
        const details = await detailsRes.json();
        placeWebsite = details.result?.website || null;
        placePhone = details.result?.international_phone_number || null;
        placeAddress = details.result?.formatted_address || null;
      } catch { /* fail open — website/phone/address are best-effort */ }
    }
    clearTimeout(timer);

    return {
      hasListing: true,
      placeId: candidate.place_id || null,
      placeTypes: candidate.types?.length ? candidate.types : null,
      placeName: candidate.name || null,
      placeWebsite,
      placePhone,
      placeAddress,
    };
  } catch {
    return none;
  }
}

export async function extractSpecialtySignal(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'RankallBot/1.0' },
      redirect: 'follow',
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.split(' ').slice(0, 500).join(' ');
  } catch {
    return null;
  }
}

export async function hasGooglePlacesListing(name: string, location: string): Promise<boolean> {
  const result = await lookupGooglePlace(name, location);
  return result.hasListing;
}

export async function fetchGooglePlaces(businessName: string, location: string): Promise<EnrichmentData['google']> {
  try {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    console.log('[fetchGooglePlaces] businessName:', businessName, '| location:', location, '| apiKey present:', !!apiKey);
    if (!apiKey) {
      console.error('[fetchGooglePlaces] GOOGLE_PLACES_API_KEY is not set');
      return undefined;
    }

    const searchQuery = `${businessName}${location ? ' ' + location : ''}`;
    console.log('[fetchGooglePlaces] search query:', searchQuery);

    // Text Search returns up to 20 candidates; Find Place returned only the
    // single closest fuzzy match, which is how a different-city,
    // different-spelling business ("Brite Smiles Dentistry", Flower Mound)
    // was accepted as "Bright Smile Dental" (Dallas). Validate every
    // candidate and take the first CONFIDENT match — never the first result.
    const searchParams = new URLSearchParams({
      query: searchQuery,
      key: apiKey,
    });

    const searchRes = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?${searchParams}`);
    const searchData = await searchRes.json();
    console.log('[fetchGooglePlaces] search response status:', searchData.status, '| results:', searchData.results?.length ?? 0);

    if (searchData.error_message) {
      console.error('[fetchGooglePlaces] search error:', searchData.error_message);
      return undefined;
    }

    const candidates = searchData.results || [];
    let place: any = null;
    for (const c of candidates) {
      if (isConfidentPlaceMatch(businessName, location, c.name, c.formatted_address)) {
        place = c;
        break;
      }
      console.log('[fetchGooglePlaces] rejecting candidate:', c.name, '|', c.formatted_address, '| for query:', searchQuery);
    }
    if (!place) {
      console.log('[fetchGooglePlaces] no confident match for query:', searchQuery);
      return undefined;
    }
    console.log('[fetchGooglePlaces] matched candidate:', place.name, '| place_id:', place.place_id);

    const detailsParams = new URLSearchParams({
      place_id: place.place_id,
      fields: 'name,rating,user_ratings_total,formatted_address,opening_hours,photos,business_status,types,international_phone_number,website,url,geometry',
      key: apiKey,
    });

    const detailsRes = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${detailsParams}`);
    const detailsData = await detailsRes.json();
    console.log('[fetchGooglePlaces] details response status:', detailsData.status, '| name:', detailsData.result?.name);

    if (detailsData.error_message) {
      console.error('[fetchGooglePlaces] details error:', detailsData.error_message);
      return undefined;
    }

    const details = detailsData.result;

    return {
      reviewCount: details?.user_ratings_total || null,
      rating: details?.rating || null,
      operational: details?.business_status === 'OPERATIONAL',
      address: details?.formatted_address || null,
      phone: details?.international_phone_number || null,
      website: details?.website || null,
      hours: details?.opening_hours?.weekday_text?.[0] || null,
      photos: details?.photos?.length || null,
      category: details?.types?.[0] || null,
      placeId: place.place_id || null,
      name: details?.name || null,
      latitude: details?.geometry?.location?.lat ?? null,
      longitude: details?.geometry?.location?.lng ?? null,
    };
  } catch (err) {
    console.error('[fetchGooglePlaces] fetch error:', err);
    return undefined;
  }
}

export async function fetchPageSpeed(websiteUrl: string): Promise<EnrichmentData['pageSpeed']> {
  try {
    const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
    if (!apiKey || !websiteUrl) return undefined;

    const url = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
    const params = new URLSearchParams({
      url,
      key: apiKey,
      strategy: 'mobile',
      category: 'performance',
    });

    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`);
    const data = await res.json();

    if (data.error) {
      console.error('PageSpeed error:', data.error.message);
      return undefined;
    }

    const categories = data.lighthouseResult?.categories;
    const audits = data.lighthouseResult?.audits;

    return {
      performanceScore: categories?.performance?.score ? Math.round(categories.performance.score * 100) : null,
      mobileScore: categories?.performance?.score ? Math.round(categories.performance.score * 100) : null,
      lcp: audits?.['largest-contentful-paint']?.numericValue || null,
      cls: audits?.['cumulative-layout-shift']?.numericValue || null,
      fid: audits?.['total-blocking-time']?.numericValue || null,
    };
  } catch (err) {
    console.error('PageSpeed fetch error:', err);
    return undefined;
  }
}

// azzx: does this text mention the business? Reddit search is
// fuzzy/OR-ish, so this is what separates a real mention from a result
// about the neighbourhood or dentists in general.
// ax87 residual: delegates to the SAME whole-name matcher the trust
// attribution uses (lib/trust.ts mentionsBusinessName). The old local
// rule dropped every word of <= 3 letters, so "Ace Dental" matched on
// "dental" alone (every dentist), "Joe's Pizza" on "pizza" (Tony's Pizza
// too), and "Joe's Bar" collapsed to nothing and never matched.
function postMentionsBusiness(text: string, businessName: string): boolean {
  return mentionsBusinessName(text, businessName);
}

export async function fetchRedditMentions(businessName: string, location: string): Promise<EnrichmentData['reddit']> {
  try {
    const cleanName = businessName
      .replace(/^best\s+/i, '')
      .replace(/\s+in\s+.+$/i, '')
      .trim();

    const query = encodeURIComponent(`${cleanName} ${location}`);
    const res = await fetch(
      `https://www.reddit.com/search.json?q=${query}&limit=25&sort=relevance&t=year`,
      { headers: { 'User-Agent': 'RankallScanner/1.0' } }
    );

    if (!res.ok) return { mentionCount: 0, topSubreddits: [], sentiment: null };

    const data = await res.json();
    const posts = data?.data?.children || [];
    // azzx: count ONLY posts whose title/selftext actually mentions the
    // business. Before this, mentionCount = posts.length counted every
    // fuzzy Reddit search result (neighbourhood, city, dentists generally)
    // as a 'mention', inflating the signal.
    const mentioning = posts.filter((p: any) => {
      const text = `${p.data?.title ?? ''} ${p.data?.selftext ?? ''}`;
      return postMentionsBusiness(text, cleanName);
    });
    console.log(`[fetchRedditMentions] ${mentioning.length} of ${posts.length} results mention the business`);
    const mentionCount = mentioning.length;
    const subreddits = [...new Set(mentioning.map((p: any) => p.data?.subreddit).filter(Boolean))] as string[];

    const titles = mentioning.map((p: any) => p.data?.title?.toLowerCase() || '').join(' ');
    const posWords = ['great', 'excellent', 'best', 'recommend', 'love', 'amazing', 'good'];
    const negWords = ['avoid', 'bad', 'worst', 'terrible', 'scam', 'horrible', 'poor'];
    const posCount = posWords.filter(w => titles.includes(w)).length;
    const negCount = negWords.filter(w => titles.includes(w)).length;
    const sentiment = posCount > negCount ? 'positive' : negCount > posCount ? 'negative' : 'neutral';

    return {
      mentionCount,
      topSubreddits: subreddits.slice(0, 5),
      sentiment: mentionCount > 0 ? sentiment : null,
    };
  } catch (err) {
    console.error('Reddit fetch error:', err);
    return { mentionCount: 0, topSubreddits: [], sentiment: null };
  }
}

export async function fetchDataForSeo(businessName: string, location: string): Promise<EnrichmentData['dataforSeo']> {
  try {
    const login = process.env.DATAFORSEO_LOGIN;
    const password = process.env.DATAFORSEO_PASSWORD;
    if (!login || !password) return undefined;

    const credentials = Buffer.from(`${login}:${password}`).toString('base64');

    const res = await fetch('https://api.dataforseo.com/v3/serp/google/maps/live/advanced', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{
        keyword: businessName,
        location_name: location ? `${location}, United States` : 'United States',
        language_name: 'English',
        depth: 10,
      }]),
    });

    const data = await res.json();

    if (data.status_code !== 20000) {
      console.error('DataForSEO error:', data.status_message);
      return undefined;
    }

    const results = data?.tasks?.[0]?.result?.[0]?.items || [];
    const cleanName = businessName
      .replace(/^best\s+/i, '')
      .replace(/\s+in\s+.+$/i, '')
      .trim()
      .toLowerCase();

    const localRank = results.findIndex((r: any) =>
      r.title?.toLowerCase().includes(cleanName)
    );

    return {
      localRank: localRank >= 0 ? localRank + 1 : null,
      citationCount: results.length,
      napConsistency: localRank >= 0,
    };
  } catch (err) {
    console.error('DataForSEO fetch error:', err);
    return undefined;
  }
}

export async function fetchFirecrawl(websiteUrl: string): Promise<string | null> {
  try {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey || !websiteUrl) return null;

    const url = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;

    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['html'],
        onlyMainContent: false,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.html || null;
  } catch (err) {
    console.error('Firecrawl fetch error:', err);
    return null;
  }
}

export async function enrichBusinessData(params: {
  businessInput: string;
  location: string;
  websiteUrl?: string;
  countryCode?: string;
}): Promise<EnrichmentData> {
  const { businessInput, location, websiteUrl } = params;

  console.log('Enrichment starting for:', businessInput, '| location:', location);

  const [google, serpData, pageSpeed, reddit, dataforSeo] = await Promise.allSettled([
    fetchGooglePlaces(businessInput, location),
    fetchSerpData(businessInput, location, params.countryCode),
    websiteUrl ? fetchPageSpeed(websiteUrl) : Promise.resolve(undefined),
    fetchRedditMentions(businessInput, location),
    fetchDataForSeo(businessInput, location),
  ]);

  const result: EnrichmentData = {
    google: google.status === 'fulfilled' ? google.value : undefined,
    serpData: serpData.status === 'fulfilled' ? serpData.value : undefined,
    pageSpeed: pageSpeed.status === 'fulfilled' ? pageSpeed.value : undefined,
    reddit: reddit.status === 'fulfilled' ? reddit.value : undefined,
    dataforSeo: dataforSeo.status === 'fulfilled' ? dataforSeo.value : undefined,
  };

  console.log('Enrichment complete:', JSON.stringify({
    google: !!result.google,
    serpData: !!result.serpData,
    reddit: result.reddit?.mentionCount,
    dataforSeo: !!result.dataforSeo,
  }));

  return result;
}
