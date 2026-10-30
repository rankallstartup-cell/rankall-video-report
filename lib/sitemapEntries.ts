// Pure sitemap builders for the programmatic layer (ax8c/azxc/azxg).
// Input: the indexable combos ("industry/city" -> latest scan ISO date)
// from getIndexableCombos — i.e. combos that pass the minimum-sample gate.
// A sitemap must list ONLY indexable URLs, so:
//   - programmatic pages: exactly the indexable combos;
//   - industry hubs / city hubs: only hubs with >= 1 indexable child
//     (a hub without one is noindex — see app/[industry]/page.tsx and
//     app/cities/[city]/page.tsx).

export type SitemapEntry = {
  url: string;
  lastModified?: Date;
  changeFrequency: 'daily' | 'weekly' | 'monthly';
  priority: number;
};

function validDate(iso: string | undefined): Date | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function keepLatest(m: Map<string, string>, key: string, value: string | undefined): void {
  const v = value ?? '';
  if (!m.has(key) || v > (m.get(key) ?? '')) m.set(key, v);
}

export function programmaticSitemapEntries(
  combos: Map<string, string>,
  base: string,
  known: { industries: Set<string>; cities: Set<string> },
): { pages: SitemapEntry[]; hubs: SitemapEntry[] } {
  const pages: SitemapEntry[] = [];
  const industryLatest = new Map<string, string>();
  const cityLatest = new Map<string, string>();
  for (const [key, latest] of combos) {
    const [industry, city] = key.split('/');
    // Defence in depth: never emit a URL for a slug the routes would 404.
    if (!known.industries.has(industry) || !known.cities.has(city)) continue;
    const lastModified = validDate(latest);
    pages.push({ url: `${base}/${industry}/${city}`, ...(lastModified ? { lastModified } : {}), changeFrequency: 'weekly', priority: 0.7 });
    keepLatest(industryLatest, industry, latest);
    keepLatest(cityLatest, city, latest);
  }
  const hubs: SitemapEntry[] = [];
  for (const [industry, latest] of industryLatest) {
    const lastModified = validDate(latest);
    hubs.push({ url: `${base}/${industry}`, ...(lastModified ? { lastModified } : {}), changeFrequency: 'weekly', priority: 0.7 });
  }
  for (const [city, latest] of cityLatest) {
    const lastModified = validDate(latest);
    hubs.push({ url: `${base}/cities/${city}`, ...(lastModified ? { lastModified } : {}), changeFrequency: 'weekly', priority: 0.7 });
  }
  pages.sort((a, b) => a.url.localeCompare(b.url));
  hubs.sort((a, b) => a.url.localeCompare(b.url));
  return { pages, hubs };
}
