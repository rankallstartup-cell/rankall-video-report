import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabase } from '@/lib/supabase';
import { assertPublicUrlWithDns, fetchPublicUrlWithDns } from '@/lib/ssrf-server';

// ── INTERFACES ────────────────────────────────────────────────────────

export interface UrlSignal {
  name: string;
  status: 'pass' | 'fail';
  value: string;
  impact: 'high' | 'medium' | 'low';
  fix: string;
}

export interface PageSpeedData {
  mobile: number | null;
  desktop: number | null;
  lcp: string | null;
  cls: string | null;
}

export interface PlacesData {
  name: string;
  rating: number;
  reviewCount: number;
}

export interface UrlIntelligenceResult {
  score: number;
  signals: UrlSignal[];
  url: string;
  scrapedAt: string;
  auditId: string;
  pageSpeed: PageSpeedData;
  places: PlacesData | null;
}

// ── SCRAPING ─────────────────────────────────────────────────────────

async function scrapeWithFirecrawl(websiteUrl: string): Promise<string | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    console.error('[url-intelligence] FIRECRAWL_API_KEY is not set');
    return null;
  }
  console.log('[url-intelligence] Firecrawl scraping:', websiteUrl);
  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: websiteUrl, formats: ['html'], onlyMainContent: false }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('[url-intelligence] Firecrawl error', res.status, JSON.stringify(data));
      return null;
    }
    const html = data?.data?.html || null;
    console.log('[url-intelligence] Firecrawl ok, html length:', html?.length ?? 0);
    return html;
  } catch (err) {
    console.error('[url-intelligence] Firecrawl fetch threw:', err);
    return null;
  }
}

async function scrapeDirectly(websiteUrl: string): Promise<string | null> {
  console.log('[url-intelligence] Falling back to direct fetch:', websiteUrl);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    // SSRF guard: scheme/port/private-IP + DNS check on the target and on
    // every redirect hop (redirects followed manually). The old plain
    // fetch() followed redirects to anything, e.g. http://169.254.169.254.
    const res = await fetchPublicUrlWithDns(websiteUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RankAll/1.0; +https://rankall.io)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.error('[url-intelligence] Direct fetch failed:', res.status);
      return null;
    }
    const html = await res.text();
    console.log('[url-intelligence] Direct fetch ok, html length:', html.length);
    return html;
  } catch (err) {
    console.error('[url-intelligence] Direct fetch threw:', err);
    return null;
  }
}

// ── PAGESPEED ─────────────────────────────────────────────────────────

async function fetchPageSpeed(websiteUrl: string): Promise<PageSpeedData> {
  const key = process.env.GOOGLE_PAGESPEED_API_KEY;
  const empty: PageSpeedData = { mobile: null, desktop: null, lcp: null, cls: null };
  if (!key) return empty;
  try {
    const base = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(websiteUrl)}&key=${key}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const [mRes, dRes] = await Promise.allSettled([
      fetch(`${base}&strategy=mobile`, { signal: controller.signal }).then(r => r.json()),
      fetch(`${base}&strategy=desktop`, { signal: controller.signal }).then(r => r.json()),
    ]);
    clearTimeout(timeout);
    const result: PageSpeedData = { ...empty };
    if (mRes.status === 'fulfilled') {
      const d = mRes.value;
      const score = d?.lighthouseResult?.categories?.performance?.score;
      result.mobile  = score != null ? Math.round(score * 100) : null;
      result.lcp     = d?.lighthouseResult?.audits?.['largest-contentful-paint']?.displayValue ?? null;
      result.cls     = d?.lighthouseResult?.audits?.['cumulative-layout-shift']?.displayValue ?? null;
    }
    if (dRes.status === 'fulfilled') {
      const d = dRes.value;
      const score = d?.lighthouseResult?.categories?.performance?.score;
      result.desktop = score != null ? Math.round(score * 100) : null;
    }
    return result;
  } catch (err) {
    console.error('[url-intelligence] PageSpeed error:', err);
    return empty;
  }
}

// ── GOOGLE PLACES ─────────────────────────────────────────────────────

async function fetchGooglePlaces(businessName: string, phone: string, domain: string): Promise<PlacesData | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return null;
  const query = phone ? `${businessName} ${phone}` : `${businessName} ${domain}`;
  try {
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${key}`;
    const res = await fetch(url);
    const data = await res.json();
    const place = data?.results?.[0];
    if (!place || !place.rating) return null;
    return { name: place.name, rating: place.rating, reviewCount: place.user_ratings_total ?? 0 };
  } catch (err) {
    console.error('[url-intelligence] Places error:', err);
    return null;
  }
}

// ── CONTEXT EXTRACTION ────────────────────────────────────────────────

interface PageContext {
  businessName: string;
  phone: string;
  address: string;
  city: string;
  url: string;
  titleText: string;
  metaDescText: string;
  domain: string;
  h1Text: string;
  h2Texts: string[];
  bodySnippet: string;
  isEcommerce: boolean;
  isLocalBusiness: boolean;
}

function stripTags(s: string) {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractContext(html: string, websiteUrl: string): PageContext {
  const titleMatch  = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const rawTitle    = titleMatch?.[1]?.trim() || '';
  const titleText   = rawTitle.replace(/\s*[|\-–—]\s*.{0,40}$/, '').trim().slice(0, 80);
  const businessName = titleText || new URL(websiteUrl).hostname.replace(/^www\./, '');

  const telHref  = html.match(/href=["']tel:([^"']+)["']/i)?.[1]?.trim() || '';
  const telPlain = html.match(/(\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4})/)?.[1]?.trim() || '';
  const phone = telHref || telPlain || '';

  const streetSchema = html.match(/"streetAddress"\s*:\s*"([^"]+)"/i)?.[1]?.trim() || '';
  const addressTag   = html.match(/<address[^>]*>([\s\S]{0,200}?)<\/address>/i)?.[1]
                         ?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || '';
  const address = streetSchema || addressTag || '';

  const citySchema   = html.match(/"addressLocality"\s*:\s*"([^"]+)"/i)?.[1]?.trim() || '';
  const cityFromAddr = address.match(/,\s*([A-Za-z\s]+),?\s*[A-Z]{2}/)?.[1]?.trim() || '';
  const city = citySchema || cityFromAddr || '';

  const metaDescMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
                     ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  const metaDescText  = metaDescMatch?.[1]?.trim().slice(0, 160) || '';

  const h1Match = html.match(/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/i);
  const h1Text  = h1Match ? stripTags(h1Match[1]).slice(0, 100) : '';

  const h2Texts: string[] = [];
  const h2Re = /<h2[^>]*>([\s\S]{0,200}?)<\/h2>/gi;
  let h2m;
  while ((h2m = h2Re.exec(html)) !== null && h2Texts.length < 4) {
    const t = stripTags(h2m[1]).slice(0, 80);
    if (t) h2Texts.push(t);
  }

  const bodySnippet = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);

  const lcHtml = html.toLowerCase();
  const isEcommerce = /add.{0,5}to.{0,5}cart|shopify|woocommerce|href=["'][^"']*\/cart["']|href=["'][^"']*\/shop["']/.test(lcHtml);
  const isLocalBusiness = !!(phone || address) && !isEcommerce;

  const domain = new URL(websiteUrl).hostname.replace(/^www\./, '');

  return {
    businessName, phone, address, city, url: websiteUrl,
    titleText: rawTitle.slice(0, 80), metaDescText, domain,
    h1Text, h2Texts, bodySnippet, isEcommerce, isLocalBusiness,
  };
}

function generateMetaDesc(ctx: PageContext): string {
  const { businessName: biz, h1Text, h2Texts, bodySnippet, city, phone, isEcommerce, isLocalBusiness } = ctx;
  const valueProp = h2Texts.find(h =>
    /free.{0,10}ship|money.{0,5}back|guarantee|same.{0,5}day|next.{0,5}day|trusted|award|top.{0,5}rated/i.test(h)
  ) || '';
  if (isEcommerce) {
    const category = h1Text || h2Texts[0] || 'products';
    const shipping  = valueProp || 'fast shipping';
    return `Shop ${category} at ${biz} — ${shipping}. Browse our full range online.`.slice(0, 160);
  }
  if (isLocalBusiness) {
    const service = h1Text || h2Texts[0] || 'services';
    const loc = city ? ` in ${city}` : '';
    const cta = phone ? ` Call ${phone}.` : ' Get in touch today.';
    return `${biz} — ${service}${loc}.${cta}`.slice(0, 160);
  }
  const firstSentence = bodySnippet.match(/[A-Z][^.!?]{20,120}[.!?]/)?.[0]?.trim() || '';
  if (h1Text) return `${biz} — ${h1Text}. ${firstSentence}`.slice(0, 160).trimEnd();
  return `${biz} — ${firstSentence || h2Texts[0] || 'Visit our website to learn more.'}`.slice(0, 160);
}

// ── IMAGE ALT TEXT AUDIT ──────────────────────────────────────────────

function analyzeAltText(html: string): UrlSignal {
  const imgTags = html.match(/<img[^>]*>/gi) || [];
  const total = imgTags.length;
  if (total === 0) {
    return { name: 'Image Alt Text', status: 'pass', value: 'No images found on page', impact: 'low', fix: '' };
  }
  const missing = imgTags.filter(tag => !/alt=["'][^"']+["']/i.test(tag)).length;
  const pct = missing / total;
  if (missing === 0) {
    return { name: 'Image Alt Text', status: 'pass', value: `All ${total} images have alt text`, impact: 'medium', fix: '' };
  }
  return {
    name: 'Image Alt Text',
    status: pct > 0.2 ? 'fail' : 'pass',
    value: `${missing} of ${total} images missing alt text`,
    impact: 'medium',
    fix: `Add descriptive alt attributes to all <img> tags. Example:\n\n<img src="photo.jpg" alt="[Describe what's in the image clearly]">\n\nAlt text lets AI platforms understand your visual content and improves accessibility scores, which AI crawlers factor into trust signals.`,
  };
}

// ── CONTENT FRESHNESS ─────────────────────────────────────────────────

function analyzeContentFreshness(html: string): UrlSignal {
  const timeTag    = html.match(/<time[^>]*datetime=["']([^"']+)["']/i)?.[1];
  const schemaDate = html.match(/"dateModified"\s*:\s*"([^"]+)"/i)?.[1]
                  || html.match(/"datePublished"\s*:\s*"([^"]+)"/i)?.[1];
  const metaDate   = html.match(/<meta[^>]+(?:name=["'](?:date|last-modified)["'])[^>]+content=["']([^"']+)["']/i)?.[1];
  const rawDate    = timeTag || schemaDate || metaDate;

  if (rawDate) {
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      const monthsAgo = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30);
      const label = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      if (monthsAgo < 3) {
        return { name: 'Content Freshness', status: 'pass', value: `Recently updated: ${label}`, impact: 'medium', fix: '' };
      }
      if (monthsAgo < 12) {
        return { name: 'Content Freshness', status: 'pass', value: `Last updated: ${label} (${Math.round(monthsAgo)} months ago)`, impact: 'medium', fix: 'Update your content more frequently. AI platforms favour recently updated pages in recommendations.' };
      }
      return { name: 'Content Freshness', status: 'fail', value: `Content appears stale: ${label} (${Math.round(monthsAgo / 12)}+ years ago)`, impact: 'medium', fix: "Update your key pages and publish new blog posts. AI platforms deprioritise sites that haven't been updated in over a year. Add a <time datetime=\"YYYY-MM-DD\"> tag to your latest content." };
    }
  }

  const copyrightYear = html.match(/©\s*(\d{4})/)?.[1] || html.match(/copyright\s+(\d{4})/i)?.[1];
  if (copyrightYear) {
    const age = new Date().getFullYear() - parseInt(copyrightYear);
    if (age <= 1) {
      return { name: 'Content Freshness', status: 'pass', value: `Copyright ${copyrightYear} — appears current`, impact: 'medium', fix: '' };
    }
  }

  return {
    name: 'Content Freshness',
    status: 'fail',
    value: 'No recent content dates found',
    impact: 'medium',
    fix: 'Add publication dates to blog posts using <time datetime="YYYY-MM-DD"> tags and a "Last updated" note on key pages. Publish new content regularly — AI platforms use recency signals to rank recommendations.',
  };
}

// ── SIGNAL ANALYSIS ────────────────────────────────────────────────────

function analyzeHtml(html: string, websiteUrl: string): UrlSignal[] {
  const isHttps = websiteUrl.startsWith('https://');

  const hasFaqSchema   = /"@type"\s*:\s*"FAQPage"/i.test(html);
  const hasLocalBiz    = /"@type"\s*:\s*"LocalBusiness"/i.test(html);
  const hasMetaDesc    = /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{10,}["']/i.test(html)
                      || /<meta[^>]+content=["'][^"']{10,}["'][^>]+name=["']description["']/i.test(html);
  const hasOgTitle     = /<meta[^>]+property=["']og:title["']/i.test(html);
  const hasOgDesc      = /<meta[^>]+property=["']og:description["']/i.test(html);
  const hasOgImage     = /<meta[^>]+property=["']og:image["']/i.test(html);
  const hasOgAll       = hasOgTitle && hasOgDesc && hasOgImage;
  const hasH1          = /<h1[\s>]/i.test(html);
  const hasPhone       = /(\+?1?\s*\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4})/i.test(html);
  const hasAddress     = /<address[\s>]|itemprop=["']address["']|streetAddress/i.test(html);
  const hasBlog        = /href=["'][^"']*(?:blog|news|articles|posts)[^"']*["']/i.test(html);
  const hasServices    = /href=["'][^"']*(?:services|treatments|procedures|what-we-do)[^"']*["']/i.test(html);
  const hasReviews     = /(?:testimonials?|reviews?|what.{0,10}(clients?|customers?|patients?).{0,10}say)/i.test(html);
  const hasTitle       = /<title[^>]*>[^<]{3,}<\/title>/i.test(html);
  const hasCanonical   = /<link[^>]+rel=["']canonical["']/i.test(html);
  const hasTwitterCard = /<meta[^>]+name=["']twitter:card["']/i.test(html);
  const hasSchema      = hasFaqSchema || hasLocalBiz;

  const ctx = extractContext(html, websiteUrl);
  const { businessName: biz, phone, address, url, titleText, metaDescText, domain, h1Text, h2Texts, isEcommerce } = ctx;

  const schemaType = isEcommerce ? 'OnlineStore' : 'LocalBusiness';

  const localBizJsonLd = `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "${schemaType}",
  "name": "${biz}",
  "url": "${url}"${phone ? `,\n  "telephone": "${phone}"` : ''}${address ? `,\n  "address": {\n    "@type": "PostalAddress",\n    "streetAddress": "${address}"\n  }` : ''}${!isEcommerce ? ',\n  "openingHours": "Mo-Fr 09:00-17:00",\n  "priceRange": "$$"' : ''}
}
</script>

Paste inside your <head> tag.${!isEcommerce ? ' Update openingHours and priceRange to match your business.' : ''}`;

  const service = h1Text || h2Texts[0] || 'our products and services';
  const faqQ1 = isEcommerce ? `What does ${biz} sell?` : `What does ${biz} offer?`;
  const faqA1 = isEcommerce
    ? `${biz} sells ${service}. Browse our full catalogue at ${url}.`
    : `${biz} provides ${service}. Visit ${url} for full details.`;

  const faqJsonLd = `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "${faqQ1}",
      "acceptedAnswer": { "@type": "Answer", "text": "${faqA1}" }
    },
    {
      "@type": "Question",
      "name": "Where can I find ${biz}?",
      "acceptedAnswer": { "@type": "Answer", "text": "${address ? `Visit us at ${address} or online at ${url}.` : `Find us online at ${url}.`}" }
    },
    {
      "@type": "Question",
      "name": "How do I contact ${biz}?",
      "acceptedAnswer": { "@type": "Answer", "text": "${phone ? `Call us at ${phone} or visit ${url}.` : `Visit ${url} to get in touch.`}" }
    }
  ]
}
</script>

Paste inside your <head> tag. Replace the answer text with your actual content and add 2–3 more questions your customers frequently ask.`;

  const suggestedDesc = generateMetaDesc(ctx);
  const generatedMetaDesc = `No meta description found. Based on your page content, here is a suggested one:\n\n<meta name="description" content="${suggestedDesc}">\n\nPaste inside your <head> tag. Aim for 140–160 characters covering your main offering and a call to action.`;

  const descForOg = metaDescText || suggestedDesc;
  const ogTags = `<!-- Add inside your <head> tag -->
<meta property="og:type"        content="website">
<meta property="og:url"         content="${url}">
<meta property="og:title"       content="${titleText || biz}">
<meta property="og:description" content="${descForOg}">
<meta property="og:image"       content="${url.replace(/\/$/, '')}/og-image.jpg">

Replace og:image with the full URL of a 1200×630px image (your logo or hero photo).`;

  const twitterTags = `<!-- Add inside your <head> tag -->
<meta name="twitter:card"        content="summary_large_image">
<meta name="twitter:title"       content="${titleText || biz}">
<meta name="twitter:description" content="${descForOg}">
<meta name="twitter:image"       content="${url.replace(/\/$/, '')}/og-image.jpg">`;

  const canonicalTag = `<link rel="canonical" href="${url}">

Paste inside your <head> tag. This tells AI crawlers which URL is the authoritative version of this page.`;

  return [
    {
      name: 'FAQ Schema (FAQPage JSON-LD)',
      status: hasFaqSchema ? 'pass' : 'fail',
      value: hasFaqSchema ? 'FAQPage schema detected — ChatGPT will surface your Q&As in local queries' : 'No FAQPage schema found',
      impact: 'high',
      fix: faqJsonLd,
    },
    {
      name: 'LocalBusiness JSON-LD',
      status: hasLocalBiz ? 'pass' : 'fail',
      value: hasLocalBiz ? 'LocalBusiness schema detected — all 12 AI platforms can read your business context' : 'No LocalBusiness JSON-LD found',
      impact: 'high',
      fix: localBizJsonLd,
    },
    {
      name: 'HTTPS',
      status: isHttps ? 'pass' : 'fail',
      value: isHttps ? 'Site is served over HTTPS' : 'Site is not served over HTTPS',
      impact: 'high',
      fix: `${url} is not served over HTTPS. Enable SSL via your hosting provider — it's free via Let's Encrypt or Cloudflare. Google AI and Perplexity apply trust penalties to non-HTTPS sites.`,
    },
    {
      name: 'Meta Description',
      status: hasMetaDesc ? 'pass' : 'fail',
      value: hasMetaDesc ? `Present: "${metaDescText.slice(0, 80)}${metaDescText.length > 80 ? '…' : ''}"` : 'No meta description found',
      impact: 'high',
      fix: generatedMetaDesc,
    },
    {
      name: 'Open Graph Tags',
      status: hasOgAll ? 'pass' : 'fail',
      value: hasOgAll ? 'All OG tags present (og:title, og:description, og:image)' : hasOgTitle ? 'Partial — og:title found but og:description or og:image missing' : 'No Open Graph tags found',
      impact: 'medium',
      fix: ogTags,
    },
    {
      name: 'H1 Tag',
      status: hasH1 ? 'pass' : 'fail',
      value: hasH1 ? 'H1 tag found on page' : 'No H1 tag found',
      impact: 'medium',
      fix: `Add a single H1 tag to your homepage. Example:\n\n<h1>${biz}${h2Texts[0] ? ` — ${h2Texts[0]}` : ' — [Your Main Offering]'}</h1>\n\nAI platforms extract the H1 to understand your page topic. There should be exactly one H1 per page.`,
    },
    {
      name: 'Phone Number on Page',
      status: hasPhone ? 'pass' : 'fail',
      value: hasPhone ? 'Phone number detected on page' : 'No phone number found',
      impact: 'medium',
      fix: `Add your phone number in plain HTML on ${domain}. Example:\n\n<a href="tel:+1XXXXXXXXXX">(XXX) XXX-XXXX</a>\n\nPlace it in your header and footer. AI platforms verify real businesses by the presence of a contactable phone number.`,
    },
    {
      name: 'Address on Page',
      status: hasAddress ? 'pass' : 'fail',
      value: hasAddress ? 'Address markup found on page' : 'No address markup found',
      impact: 'medium',
      fix: `Add your street address to ${domain} using the <address> tag:\n\n<address>\n  ${address || '[Street], [City], [State] [ZIP]'}\n</address>\n\nWithout an on-page address, AI cannot include you in "near me" local queries.`,
    },
    {
      name: 'Title Tag',
      status: hasTitle ? 'pass' : 'fail',
      value: hasTitle ? `Present: "${titleText.slice(0, 60)}${titleText.length > 60 ? '…' : ''}"` : 'No title tag found',
      impact: 'medium',
      fix: `Add a <title> tag to your homepage. Keep it under 60 characters:\n\n<title>${biz}${h1Text ? ` — ${h1Text.slice(0, 40)}` : ' — [Main Offering]'}</title>\n\nAI uses the title to identify and describe your business in recommendation responses.`,
    },
    {
      name: 'Canonical URL',
      status: hasCanonical ? 'pass' : 'fail',
      value: hasCanonical ? 'Canonical URL tag found' : 'No canonical URL tag found',
      impact: 'low',
      fix: canonicalTag,
    },
    {
      name: 'Twitter Card',
      status: hasTwitterCard ? 'pass' : 'fail',
      value: hasTwitterCard ? 'Twitter Card meta tag found' : 'No Twitter Card tag found',
      impact: 'low',
      fix: twitterTags,
    },
    {
      name: 'Blog or Content Section',
      status: hasBlog ? 'pass' : 'fail',
      value: hasBlog ? 'Blog or news section detected' : 'No blog or content section found',
      impact: 'low',
      fix: `Create a /blog section on ${domain} with 4–6 posts answering questions your customers ask${h1Text ? ` about "${h1Text}"` : ''} (e.g. "How much does [your service] cost?"). Each post is a potential AI citation source. Aim for 600+ words per post.`,
    },
    {
      name: 'Services Page',
      status: hasServices ? 'pass' : 'fail',
      value: hasServices ? 'Services page detected' : 'No services page found',
      impact: 'low',
      fix: `Create a ${isEcommerce ? '/collections or /shop' : '/services'} page on ${domain} listing each ${isEcommerce ? 'product category' : 'service'} with a dedicated section. AI platforms enumerate your ${isEcommerce ? 'catalogue' : 'services'} from this page when answering "what does ${biz} offer?" queries.`,
    },
    {
      name: 'Reviews or Testimonials',
      status: hasReviews ? 'pass' : 'fail',
      value: hasReviews ? 'Reviews or testimonials section detected' : 'No reviews/testimonials section found',
      impact: 'medium',
      fix: `Add a testimonials section to ${domain} with 3–5 real customer quotes. Example structure:\n\n<section id="testimonials">\n  <h2>What Our Customers Say</h2>\n  <blockquote>"[Quote]" — [Name], [City]</blockquote>\n</section>\n\nAI platforms use on-page review content to verify social proof before recommending a business.`,
    },
    {
      name: 'Structured Data (any schema)',
      status: hasSchema ? 'pass' : 'fail',
      value: hasSchema ? 'Structured data detected on page' : 'No structured data (JSON-LD) found',
      impact: 'high',
      fix: `${domain} has no JSON-LD structured data. Start with a LocalBusiness schema block (see the LocalBusiness JSON-LD fix above). Validate at https://search.google.com/test/rich-results after adding it.`,
    },
    analyzeAltText(html),
    analyzeContentFreshness(html),
  ];
}

// ── CORE AUDIT RUNNER ─────────────────────────────────────────────────

async function runAudit(websiteUrl: string): Promise<UrlIntelligenceResult | null> {
  const normalizedUrl = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
  // Reject internal/private targets up front (before Firecrawl/PageSpeed
  // also receive them).
  try {
    await assertPublicUrlWithDns(normalizedUrl);
  } catch (err) {
    console.error('[url-intelligence] blocked URL:', (err as Error).message);
    return null;
  }

  const [html, pageSpeed] = await Promise.all([
    (async () => {
      const h = await scrapeWithFirecrawl(normalizedUrl);
      return h ?? scrapeDirectly(normalizedUrl);
    })(),
    fetchPageSpeed(normalizedUrl),
  ]);

  if (!html) return null;

  const signals = analyzeHtml(html, normalizedUrl);
  const ctx     = extractContext(html, normalizedUrl);
  const places  = ctx.phone ? await fetchGooglePlaces(ctx.businessName, ctx.phone, ctx.domain) : null;
  const passing = signals.filter(s => s.status === 'pass').length;
  const score   = Math.round((passing / signals.length) * 100);

  return {
    score,
    signals,
    url: websiteUrl,
    scrapedAt: new Date().toISOString(),
    auditId: crypto.randomBytes(6).toString('hex'),
    pageSpeed,
    places,
  };
}

// ── ROUTES ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auditId = req.nextUrl.searchParams.get('audit');
  if (!auditId) return NextResponse.json({ error: 'audit param required' }, { status: 400 });
  try {
    const { data, error } = await supabase
      .from('audit_results')
      .select('results')
      .eq('id', auditId)
      .single();
    if (error || !data) return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    return NextResponse.json({ success: true, ...(data.results as object) });
  } catch {
    return NextResponse.json({ error: 'Failed to load audit' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { websiteUrl, competitorUrl } = await req.json();
    if (!websiteUrl) return NextResponse.json({ error: 'websiteUrl required' }, { status: 400 });

    const [result, competitorResult] = await Promise.all([
      runAudit(websiteUrl),
      competitorUrl ? runAudit(competitorUrl) : Promise.resolve(null),
    ]);

    if (!result) {
      const keySet = !!process.env.FIRECRAWL_API_KEY;
      return NextResponse.json({
        error: `Could not fetch website. ${keySet ? 'Firecrawl returned no content and direct fetch also failed.' : 'FIRECRAWL_API_KEY is not configured.'} Check the URL is publicly accessible and try again.`,
      }, { status: 422 });
    }

    // Save to Supabase — fire and forget
    void supabase.from('audit_results').insert({
      id: result.auditId,
      url: websiteUrl,
      results: { ...result, competitor: competitorResult ?? undefined },
    });

    return NextResponse.json({
      success: true,
      ...result,
      ...(competitorResult ? { competitor: competitorResult } : {}),
    });
  } catch (err) {
    console.error('URL intelligence error:', err);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}
