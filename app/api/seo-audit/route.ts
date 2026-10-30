import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertPublicUrlWithDns, fetchPublicUrlWithDns } from '@/lib/ssrf-server'

let _admin: SupabaseClient | null = null
function getAdmin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
  }
  return _admin
}
const adminClient = new Proxy({} as SupabaseClient, { get(_t, p) { return (getAdmin() as any)[p] } })

export type SeoImpact = 'Very High' | 'High' | 'Medium' | 'Low' | 'None'

export interface SeoCheck {
  id: string
  name: string
  category: 'technical' | 'local' | 'content'
  status: 'pass' | 'fail'
  value: string
  points: number
  maxPoints: number
  seoImpact: SeoImpact
  aiImpact: SeoImpact
  fixType: string
  fix: string
}

export interface SeoAuditResult {
  url: string
  businessName?: string
  warning?: string
  seoScore: number
  technicalScore: number
  localScore: number
  contentScore: number
  checks: SeoCheck[]
  pageSpeed: {
    mobile: number | null
    desktop: number | null
    lcp: string | null
    cls: string | null
    fcp: string | null
  }
  places: { rating: number; reviewCount: number; hasHours: boolean } | null
  auditedAt: string
}

// ── SCRAPING ─────────────────────────────────────────────────────────────

async function scrapeHtml(url: string): Promise<string | null> {
  const key = process.env.FIRECRAWL_API_KEY
  if (key) {
    try {
      const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, formats: ['html'], onlyMainContent: false }),
      })
      const data = await res.json()
      const html = data?.data?.html ?? null
      if (html) return html
    } catch { /* fall through */ }
  }
  // Direct fetch with multiple fallback attempts
  const FETCH_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  };

  // Build list of URLs to try in order
  const urlObj = (() => { try { return new URL(url); } catch { return null; } })();
  const attempts: string[] = [url];
  if (urlObj) {
    // Try without www if has www, or with www if doesn't
    if (urlObj.hostname.startsWith('www.')) {
      attempts.push(url.replace('www.', ''));
    } else {
      attempts.push(`${urlObj.protocol}//${urlObj.hostname.replace(/^/, 'www.')}${urlObj.pathname}${urlObj.search}`);
    }
    // Try http if https
    if (url.startsWith('https://')) {
      attempts.push(url.replace('https://', 'http://'));
    }
  }

  for (const attemptUrl of attempts) {
    try {
      // SSRF guard: DNS-checked, redirects re-validated per hop (the old
      // plain fetch followed redirects into private/metadata addresses).
      const res = await fetchPublicUrlWithDns(attemptUrl, {
        signal: AbortSignal.timeout(15000),
        headers: FETCH_HEADERS,
      });
      if (res.ok) return await res.text();
    } catch { /* try next */ }
  }
  return null;
}

// ── PAGESPEED ─────────────────────────────────────────────────────────────

async function fetchPageSpeed(url: string) {
  const key = process.env.GOOGLE_PAGESPEED_API_KEY
  const empty = { mobile: null, desktop: null, lcp: null, cls: null, fcp: null }
  if (!key) return empty
  try {
    const base = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${key}`
    const ctrl = new AbortController()
    setTimeout(() => ctrl.abort(), 25000)
    const [mRes, dRes] = await Promise.allSettled([
      fetch(`${base}&strategy=mobile`, { signal: ctrl.signal }).then(r => r.json()),
      fetch(`${base}&strategy=desktop`, { signal: ctrl.signal }).then(r => r.json()),
    ])
    const result: { mobile: number | null; desktop: number | null; lcp: string | null; cls: string | null; fcp: string | null } = { ...empty }
    if (mRes.status === 'fulfilled') {
      const d = mRes.value
      const s = d?.lighthouseResult?.categories?.performance?.score
      result.mobile  = s != null ? Math.round(s * 100) : null
      result.lcp     = d?.lighthouseResult?.audits?.['largest-contentful-paint']?.displayValue ?? null
      result.cls     = d?.lighthouseResult?.audits?.['cumulative-layout-shift']?.displayValue ?? null
      result.fcp     = d?.lighthouseResult?.audits?.['first-contentful-paint']?.displayValue ?? null
    }
    if (dRes.status === 'fulfilled') {
      const d = dRes.value
      const s = d?.lighthouseResult?.categories?.performance?.score
      result.desktop = s != null ? Math.round(s * 100) : null
    }
    return result
  } catch {
    return empty
  }
}

// ── BUSINESS NAME EXTRACTION ──────────────────────────────────────────────

function extractBusinessNameFromHtml(html: string, url: string): string {
  // 1. og:site_name
  const ogSite = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i);
  if (ogSite?.[1]) return ogSite[1].trim();

  // 2. <title> tag — strip common suffixes like "| Home", "- Welcome"
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch?.[1]) {
    const raw = titleMatch[1].trim();
    const cleaned = raw.split(/\s*[\|\-–—:]\s*/)[0].trim();
    if (cleaned.length > 2 && cleaned.length < 60) return cleaned;
  }

  // 3. Derive from domain as last resort: deltadental.com → Delta Dental
  try {
    const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname
      .replace(/^www\./, '')
      .replace(/\.(com|io|net|org|co\.uk|co|dental|law|care)$/, '')
      .replace(/[^a-z0-9]/gi, ' ')
      .trim();
    return hostname.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  } catch {
    return '';
  }
}

// ── PLACES ────────────────────────────────────────────────────────────────

async function fetchPlaces(businessName: string, city: string) {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key || !businessName) return null
  try {
    const q = city ? `${businessName} ${city}` : businessName
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&key=${key}`
    const res = await fetch(url)
    const data = await res.json()
    const place = data?.results?.[0]
    if (!place) return null
    const hasHours = !!(place.opening_hours?.periods?.length)
    return {
      rating: place.rating ?? 0,
      reviewCount: place.user_ratings_total ?? 0,
      hasHours,
    }
  } catch {
    return null
  }
}

// ── HTML ANALYSIS ─────────────────────────────────────────────────────────

function countWords(html: string): number {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2).length
}

function countInternalLinks(html: string, domain: string): number {
  const links = html.match(/<a[^>]+href=["']([^"']+)["']/gi) || []
  return links.filter(l => {
    const href = l.match(/href=["']([^"']+)["']/i)?.[1] ?? ''
    return href.startsWith('/') || href.includes(domain)
  }).length
}

function altTagCoverage(html: string): number {
  const imgs = html.match(/<img[^>]*>/gi) || []
  if (!imgs.length) return 100
  const withAlt = imgs.filter(t => /alt=["'][^"']+["']/i.test(t)).length
  return Math.round((withAlt / imgs.length) * 100)
}

function hasRecentReviews(html: string): boolean {
  const now = Date.now()
  const dateRe = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2},?\s+202[45]\b/gi
  const matches = html.match(dateRe) || []
  for (const m of matches) {
    const d = new Date(m)
    if (!isNaN(d.getTime()) && now - d.getTime() < 30 * 24 * 60 * 60 * 1000) return true
  }
  return false
}

// ── BUILD CHECKS ──────────────────────────────────────────────────────────

function buildChecks(
  html: string,
  url: string,
  pageSpeed: { mobile: number | null; desktop: number | null },
  places: { rating: number; reviewCount: number; hasHours: boolean } | null
): SeoCheck[] {
  const domain = new URL(url).hostname.replace(/^www\./, '')

  // HTML signals
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const titleText  = titleMatch?.[1]?.trim() ?? ''
  const titleLen   = titleText.length
  const titleOk    = titleLen >= 50 && titleLen <= 60

  const metaDescMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{5,})["']/i)
                     ?? html.match(/<meta[^>]+content=["']([^"']{5,})["'][^>]+name=["']description["']/i)
  const metaDescText = metaDescMatch?.[1]?.trim() ?? ''
  const metaDescLen  = metaDescText.length
  const metaDescOk   = metaDescLen >= 120 && metaDescLen <= 160

  const h1Count   = (html.match(/<h1[\s>]/gi) || []).length
  const hasH1     = h1Count > 0
  const hasFaq    = /"@type"\s*:\s*"FAQPage"/i.test(html)
  const hasLocalBiz = /"@type"\s*:\s*"LocalBusiness"/i.test(html)
  const hasSchema = hasFaq || hasLocalBiz || /"@type"\s*:\s*"Organization"/i.test(html) || /"@type"\s*:\s*"WebSite"/i.test(html)
  const isNoindex = /<meta[^>]+content=["'][^"']*noindex[^"']*["'][^>]*>/i.test(html)
                 || /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html)

  const wordCount      = countWords(html)
  const internalLinks  = countInternalLinks(html, domain)
  const altCoverage    = altTagCoverage(html)
  const recentReviews  = hasRecentReviews(html)

  const mobileSpeed = pageSpeed.mobile ?? 0

  // GBP completeness heuristic — if Places data available
  const gbpComplete = !!(places && places.rating > 0 && places.reviewCount > 0 && places.hasHours)

  const checks: SeoCheck[] = [
    // ── TECHNICAL (40pts max) ──
    {
      id: 'title_length',
      name: 'Title Tag Length',
      category: 'technical',
      status: titleOk ? 'pass' : 'fail',
      value: titleText
        ? `${titleLen} chars — "${titleText.slice(0, 55)}${titleLen > 55 ? '…' : ''}"`
        : 'No title tag found',
      points: titleOk ? 5 : 0,
      maxPoints: 5,
      seoImpact: 'High',
      aiImpact: 'Medium',
      fixType: 'title_tag',
      fix: titleText
        ? `Title is ${titleLen < 50 ? 'too short' : 'too long'} (${titleLen} chars). Optimal is 50–60 characters. Current: "${titleText}"`
        : 'No title tag found. Add a <title> tag to your homepage.',
    },
    {
      id: 'meta_desc_length',
      name: 'Meta Description Length',
      category: 'technical',
      status: metaDescOk ? 'pass' : 'fail',
      value: metaDescText
        ? `${metaDescLen} chars — "${metaDescText.slice(0, 60)}${metaDescLen > 60 ? '…' : ''}"`
        : 'No meta description found',
      points: metaDescOk ? 5 : 0,
      maxPoints: 5,
      seoImpact: 'High',
      aiImpact: 'Medium',
      fixType: 'meta_description',
      fix: metaDescText
        ? `Meta description is ${metaDescLen < 120 ? 'too short' : 'too long'} (${metaDescLen} chars). Optimal is 120–160 characters.`
        : 'No meta description found.',
    },
    {
      id: 'h1_exists',
      name: 'H1 Tag',
      category: 'technical',
      status: hasH1 ? 'pass' : 'fail',
      value: hasH1 ? `${h1Count} H1 tag${h1Count > 1 ? 's (use only one)' : ' — present'}` : 'No H1 tag found',
      points: hasH1 ? 5 : 0,
      maxPoints: 5,
      seoImpact: 'Medium',
      aiImpact: 'Medium',
      fixType: 'h1_tag',
      fix: hasH1 && h1Count > 1
        ? `You have ${h1Count} H1 tags. Each page should have exactly one H1. Remove duplicates.`
        : 'No H1 tag found. Add a single <h1> to your homepage.',
    },
    {
      id: 'schema_any',
      name: 'Schema Markup (Structured Data)',
      category: 'technical',
      status: hasSchema ? 'pass' : 'fail',
      value: hasSchema
        ? `Detected — ${hasFaq ? 'FAQPage ' : ''}${hasLocalBiz ? 'LocalBusiness' : ''}`
        : 'No JSON-LD structured data found',
      points: hasSchema ? 10 : 0,
      maxPoints: 10,
      seoImpact: 'High',
      aiImpact: 'High',
      fixType: 'local_business_schema',
      fix: 'No structured data detected. Add LocalBusiness JSON-LD to your <head> tag.',
    },
    {
      id: 'pagespeed_50',
      name: 'Mobile Page Speed (50+)',
      category: 'technical',
      status: mobileSpeed >= 50 ? 'pass' : 'fail',
      value: mobileSpeed > 0 ? `${mobileSpeed}/100 mobile` : 'Could not fetch (PageSpeed API)',
      points: mobileSpeed >= 50 ? 5 : 0,
      maxPoints: 5,
      seoImpact: 'High',
      aiImpact: 'Low',
      fixType: 'page_speed',
      fix: `Mobile speed is ${mobileSpeed}/100. Improve with: compress images, enable browser caching, remove unused JS.`,
    },
    {
      id: 'pagespeed_70',
      name: 'Mobile Page Speed (70+)',
      category: 'technical',
      status: mobileSpeed >= 70 ? 'pass' : 'fail',
      value: mobileSpeed > 0 ? `${mobileSpeed}/100 mobile` : 'Could not fetch',
      points: mobileSpeed >= 70 ? 5 : 0,
      maxPoints: 5,
      seoImpact: 'High',
      aiImpact: 'Low',
      fixType: 'page_speed',
      fix: `Mobile speed is ${mobileSpeed}/100. To reach 70+ use WebP images, lazy loading, and a CDN.`,
    },
    {
      id: 'noindex',
      name: 'Not Noindex',
      category: 'technical',
      status: !isNoindex ? 'pass' : 'fail',
      value: isNoindex ? '⚠ noindex tag detected — page blocked from AI crawlers' : 'No noindex directive — page is indexable',
      points: !isNoindex ? 5 : 0,
      maxPoints: 5,
      seoImpact: 'High',
      aiImpact: 'High',
      fixType: 'noindex',
      fix: 'Remove the noindex meta tag from this page. While noindex, AI platforms cannot discover or cite you.',
    },

    // ── LOCAL SEO (35pts max) ──
    {
      id: 'gbp_complete',
      name: 'Google Business Profile Complete',
      category: 'local',
      status: gbpComplete ? 'pass' : 'fail',
      value: places
        ? `${places.rating}★ · ${places.reviewCount} reviews${places.hasHours ? ' · Hours set' : ' · Missing hours'}`
        : 'No GBP data detected (add Places API key for full check)',
      points: gbpComplete ? 10 : 0,
      maxPoints: 10,
      seoImpact: 'High',
      aiImpact: 'High',
      fixType: 'google_business',
      fix: 'Complete your Google Business Profile: add hours, photos, description, and all services. AI platforms pull GBP data directly.',
    },
    {
      id: 'reviews_20',
      name: 'Reviews — 20+ Google reviews',
      category: 'local',
      status: (places?.reviewCount ?? 0) >= 20 ? 'pass' : 'fail',
      value: places ? `${places.reviewCount} Google reviews` : 'No Places data',
      points: (places?.reviewCount ?? 0) >= 20 ? 5 : 0,
      maxPoints: 5,
      seoImpact: 'Medium',
      aiImpact: 'Very High',
      fixType: 'reviews',
      fix: 'Get to 20+ reviews by sending review request texts/emails after each job. AI platforms use review volume as a primary trust signal.',
    },
    {
      id: 'reviews_50',
      name: 'Reviews — 50+ Google reviews',
      category: 'local',
      status: (places?.reviewCount ?? 0) >= 50 ? 'pass' : 'fail',
      value: places ? `${places.reviewCount} Google reviews` : 'No Places data',
      points: (places?.reviewCount ?? 0) >= 50 ? 5 : 0,
      maxPoints: 5,
      seoImpact: 'High',
      aiImpact: 'Very High',
      fixType: 'reviews',
      fix: '50+ reviews triggers "high trust" classification in ChatGPT and Gemini. Automate review requests after every completed job.',
    },
    {
      id: 'rating_4',
      name: 'Rating — 4.0+',
      category: 'local',
      status: (places?.rating ?? 0) >= 4.0 ? 'pass' : 'fail',
      value: places ? `${places.rating} stars` : 'No Places data',
      points: (places?.rating ?? 0) >= 4.0 ? 5 : 0,
      maxPoints: 5,
      seoImpact: 'Medium',
      aiImpact: 'High',
      fixType: 'reviews',
      fix: `Rating is ${places?.rating ?? 'unknown'}. Respond to all negative reviews professionally and request reviews from satisfied customers.`,
    },
    {
      id: 'rating_45',
      name: 'Rating — 4.5+',
      category: 'local',
      status: (places?.rating ?? 0) >= 4.5 ? 'pass' : 'fail',
      value: places ? `${places.rating} stars` : 'No Places data',
      points: (places?.rating ?? 0) >= 4.5 ? 5 : 0,
      maxPoints: 5,
      seoImpact: 'High',
      aiImpact: 'High',
      fixType: 'reviews',
      fix: `4.5+ rating is the threshold where AI platforms consistently recommend businesses in competitive queries.`,
    },
    {
      id: 'recent_reviews',
      name: 'Recent Reviews (last 30 days)',
      category: 'local',
      status: recentReviews ? 'pass' : 'fail',
      value: recentReviews ? 'Recent review activity detected' : 'No recent reviews found on page',
      points: recentReviews ? 5 : 0,
      maxPoints: 5,
      seoImpact: 'Medium',
      aiImpact: 'Very High',
      fixType: 'reviews',
      fix: 'Review velocity (getting new reviews regularly) is a top AI trust signal. Set up an automated review request system.',
    },

    // ── CONTENT (25pts max) ──
    {
      id: 'word_count',
      name: 'Word Count (500+)',
      category: 'content',
      status: wordCount >= 500 ? 'pass' : 'fail',
      value: `~${wordCount} words on page`,
      points: wordCount >= 500 ? 5 : 0,
      maxPoints: 5,
      seoImpact: 'High',
      aiImpact: 'Medium',
      fixType: 'website_content',
      fix: `Page has ~${wordCount} words. Add service descriptions, FAQs, and local content to reach 500+ words. AI platforms need text to understand and describe your business.`,
    },
    {
      id: 'faq_schema',
      name: 'FAQ Schema (FAQPage JSON-LD)',
      category: 'content',
      status: hasFaq ? 'pass' : 'fail',
      value: hasFaq ? 'FAQPage schema detected — appears in AI Q&A responses' : 'No FAQ schema found',
      points: hasFaq ? 10 : 0,
      maxPoints: 10,
      seoImpact: 'High',
      aiImpact: 'Very High',
      fixType: 'faq_schema',
      fix: 'No FAQ schema found. Add FAQPage JSON-LD with 5 questions your customers ask, so AI platforms have structured answers they can quote.',
    },
    {
      id: 'alt_tags',
      name: 'Image Alt Tags (80%+ coverage)',
      category: 'content',
      status: altCoverage >= 80 ? 'pass' : 'fail',
      value: `${altCoverage}% of images have alt text`,
      points: altCoverage >= 80 ? 5 : 0,
      maxPoints: 5,
      seoImpact: 'Medium',
      aiImpact: 'Low',
      fixType: 'alt_tags',
      fix: `${100 - altCoverage}% of images are missing alt text. Add descriptive alt attributes to all <img> tags.`,
    },
    {
      id: 'internal_links',
      name: 'Internal Links (5+)',
      category: 'content',
      status: internalLinks >= 5 ? 'pass' : 'fail',
      value: `${internalLinks} internal links found`,
      points: internalLinks >= 5 ? 5 : 0,
      maxPoints: 5,
      seoImpact: 'Medium',
      aiImpact: 'Low',
      fixType: 'website_content',
      fix: `Only ${internalLinks} internal links found. Add links to your services, about, contact, and blog pages. Internal links help AI crawlers map your site structure.`,
    },
  ]

  return checks
}

// ── SCORER ────────────────────────────────────────────────────────────────

function computeScores(checks: SeoCheck[]) {
  const byCategory = (cat: string) => {
    const cat_checks = checks.filter(c => c.category === cat)
    const earned = cat_checks.reduce((s, c) => s + c.points, 0)
    const max    = cat_checks.reduce((s, c) => s + c.maxPoints, 0)
    return { earned, max, score: max > 0 ? Math.round((earned / max) * 100) : 0 }
  }
  const tech    = byCategory('technical')
  const local   = byCategory('local')
  const content = byCategory('content')
  const totalEarned = tech.earned + local.earned + content.earned
  const totalMax    = 100
  return {
    seoScore:      Math.min(100, Math.round((totalEarned / totalMax) * 100)),
    technicalScore: tech.score,
    localScore:     local.score,
    contentScore:   content.score,
  }
}

// ── ROUTE ─────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { url, businessName, city } = body as {
      url: string
      businessName?: string
      city?: string
    }

    if (!url) return Response.json({ error: 'url required' }, { status: 400 })
    const normalizedUrl = url.startsWith('http') ? url : `https://${url}`
    try {
      await assertPublicUrlWithDns(normalizedUrl)
    } catch {
      return Response.json({ error: 'That URL cannot be audited. Enter a public http(s) website address.' }, { status: 400 })
    }

    const [html, pageSpeed] = await Promise.all([
      scrapeHtml(normalizedUrl),
      fetchPageSpeed(normalizedUrl),
    ])

    if (!html) {
      // Partial audit — can't access HTML but can still return domain-derived info
      const fallbackName = extractBusinessNameFromHtml('', normalizedUrl);
      return Response.json({
        success: true,
        url: normalizedUrl,
        businessName: fallbackName,
        seoScore: 0,
        technicalScore: 0,
        localScore: 0,
        contentScore: 0,
        checks: [],
        pageSpeed,
        places: null,
        auditedAt: new Date().toISOString(),
        warning: 'We could not access this website directly. Your site may be blocking automated requests, behind Cloudflare protection, or temporarily unavailable. Make sure your website is publicly accessible and try again. Some checks were skipped.',
      });
    }

    // Always derive business name from the URL being audited — never from caller-supplied stale data
    const resolvedBusinessName = extractBusinessNameFromHtml(html, normalizedUrl);

    const places = await fetchPlaces(resolvedBusinessName || businessName || '', city ?? '');

    const checks = buildChecks(html, normalizedUrl, pageSpeed, places)
    const scores = computeScores(checks)

    const result: SeoAuditResult = {
      url: normalizedUrl,
      businessName: resolvedBusinessName,
      ...scores,
      checks,
      pageSpeed,
      places,
      auditedAt: new Date().toISOString(),
    }

    // Save non-fatally
    adminClient.from('seo_audits').insert({
      url: normalizedUrl,
      seo_score: scores.seoScore,
      result,
    }).then(({ error }) => {
      if (error) console.log('seo_audits insert (non-fatal):', error.message)
    })

    return Response.json({ success: true, ...result })
  } catch (err) {
    console.error('seo-audit error:', err)
    return Response.json({ error: 'Audit failed' }, { status: 500 })
  }
}
