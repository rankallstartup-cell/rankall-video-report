import type { MetadataRoute } from 'next';
import { INDUSTRIES, CITIES } from './[industry]/[city]/page';
import { supabase } from '@/lib/supabase';
import { getIndexableCombos } from '@/lib/programmaticAggregates';
import { programmaticSitemapEntries } from '@/lib/sitemapEntries';

const BASE = 'https://rankall.io';

// ax8c: ONE sitemap at /sitemap.xml (the URL already submitted to Search
// Console and listed in robots.txt). Splitting with generateSitemaps was
// considered and rejected: in Next 16 it serves /sitemap/[id].xml and does
// NOT generate a /sitemap.xml index, so robots + GSC would point at a 404 —
// and since only combos above the minimum sample are listed now, the file
// is far below the 50k-URL limit. Regenerated at most hourly.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static pages have no DB timestamp, so they OMIT lastModified entirely.
  // The old code stamped every URL with `now`, claiming every page changed
  // today — that trains crawlers to ignore lastmod. Only /blog carries a real
  // timestamp: the latest published post's publish date.
  let blogLastModified: Date | undefined;
  try {
    const { data } = await supabase
      .from('blog_posts')
      .select('published_at')
      .eq('published', true)
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.published_at) blogLastModified = new Date(data.published_at);
  } catch { /* non-fatal — /blog just omits lastmod */ }

  const static_pages: MetadataRoute.Sitemap = [
    { url: BASE,                     changeFrequency: 'daily',   priority: 1.0 },
    { url: `${BASE}/pricing`,        changeFrequency: 'weekly',  priority: 0.8 },
    { url: `${BASE}/leaderboard`,    changeFrequency: 'daily',   priority: 0.8 },
    { url: `${BASE}/about`,          changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/how-it-works`,   changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/developers`,      changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/methodology`,   changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/compare/profound`,    changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/compare/brightlocal`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/verified`,       changeFrequency: 'weekly',  priority: 0.6 },
    { url: `${BASE}/case-studies`,   changeFrequency: 'weekly',  priority: 0.7 },
    { url: `${BASE}/contact`,        changeFrequency: 'monthly', priority: 0.4 },
    { url: `${BASE}/agency`,         changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/personal`,            changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/brands`,              changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/city-intelligence`,   changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/blog`,                ...(blogLastModified ? { lastModified: blogLastModified } : {}), changeFrequency: 'daily', priority: 0.8 },
    // NOTE (ax8d): bare /score REMOVED — the route is only /score/[slug], bare /score 404s.
    // NOTE (ax8d): the 9 locale pages (/ie, /nz, /sg, /ae, /za, /ng, /ke, /gh, /ph) REMOVED —
    // each is a JS-redirect stub (sets a cookie, router.replace to /) that renders a "Loading…" page.
    // Listing near-soft-404s as real content is worse than omitting them.
  ];

  // azxc/azxg/ax8c: only INDEXABLE programmatic URLs. Combos below the
  // minimum sample are noindex on the page and omitted here; hubs are
  // listed only when at least one child combo is indexable (zero-data hubs
  // are noindex). The two index pages are always useful navigation.
  const combos = await getIndexableCombos(CITIES, Object.keys(INDUSTRIES));
  const { pages: programmatic_pages, hubs } = programmaticSitemapEntries(combos, BASE, {
    industries: new Set(Object.keys(INDUSTRIES)),
    cities: new Set(Object.keys(CITIES)),
  });
  const hub_pages: MetadataRoute.Sitemap = [
    { url: `${BASE}/industries`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/cities`,     changeFrequency: 'weekly', priority: 0.8 },
    ...hubs,
  ];

  const business_pages = await businessSitemap();

  return [...static_pages, ...hub_pages, ...programmatic_pages, ...business_pages];
}

async function businessSitemap(): Promise<MetadataRoute.Sitemap> {
  // Public business profiles. Best-effort — a query failure just omits them.
  const business_pages: MetadataRoute.Sitemap = [];
  try {
    const { data } = await supabase
      .from('businesses')
      .select('slug, last_scanned_at')
      .eq('is_public', true)
      .order('latest_score', { ascending: false })
      .limit(5000);
    for (const b of (data as Array<{ slug: string; last_scanned_at: string | null }> | null) ?? []) {
      if (!b.slug) continue;
      business_pages.push({
        url: `${BASE}/business/${b.slug}`,
        // Real timestamp: the profile's last scan date. A never-scanned
        // profile omits lastmod instead of claiming it changed today.
        ...(b.last_scanned_at ? { lastModified: new Date(b.last_scanned_at) } : {}),
        changeFrequency: 'weekly',
        priority: 0.6,
      });
    }
  } catch { /* non-fatal */ }
  return business_pages;
}
