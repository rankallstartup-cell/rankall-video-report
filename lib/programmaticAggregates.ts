import { cache } from 'react';
import { createClient } from '@supabase/supabase-js';

// ── Real aggregates for programmatic industry x city pages (ax8c) ─────────
// Before ax8c, every programmatic page showed a HARDCODED avgScore constant
// per industry (same "Dentists average 34/100" for all 293 cities) — a
// fabricated number. These helpers compute REAL aggregates from rankall_scans.
//
// Attribution rule (shared by the page and the sitemap, so they can never
// disagree): a scan belongs to a combo iff
//   - scan.industry === industry slug, AND
//   - scan.location's city part matches the combo's city label
//     ('Austin' and 'Austin, TX' both match Austin; 'Greater Austin' does not),
//   - scan.overall_score is non-null AND > 0.
// The score > 0 rule: a 0-score scan means either "no platform recommended
// the business" or "the scan itself failed", and the two are indistinguishable
// in the data. Counting failed scans as 0 would drag every city average down
// with non-measurements, so 0-score scans are excluded and the average is
// labeled with its sample size ("based on N scanned businesses").
// azxc: MINIMUM SAMPLE. A combo only "has data" when at least
// MIN_PUBLIC_SAMPLE DISTINCT businesses qualify (repeat scans of one
// business count once — its latest scan). Before this gate, a single scan
// published one business's exact score as the "city average" (and one
// customer's competitor as the city leader). Below the threshold the page
// shows no numbers, goes noindex, and the sitemap/hubs omit it.
//
// Privacy: aggregates only (counts, averages, rates). Scanned businesses are
// NEVER named — named leaderboards need the consent flow (ax8h note). The one
// named business on the page, the "top competitor", comes from the scan row's
// competitor_name field, exactly as the page already did.

export type CityInfo = { label: string; state: string; country?: string; nearby: string[] };
export type CitiesMap = Record<string, CityInfo>;

export type PlatformRate = { platform: string; mentionRate: number; scans: number };

export type ComboAggregate = {
  scanCount: number;
  avgScore: number; // rounded average overall_score over qualifying scans
  latestScanAt: string;
  topCompetitor: string | null;
  platformRates: PlatformRate[];
};

type ScanRow = {
  id: string;
  industry: string | null;
  location: string | null;
  overall_score: number | null;
  created_at: string | null;
  competitor_name: string | null;
  business_id?: string | null;
  user_business_name?: string | null;
  input?: string | null;
};

// ── Minimum-sample gate (azxc) ────────────────────────────────────────────
/** Distinct businesses required before ANY aggregate (average, competitor,
 *  platform rate) is published or the page is indexable. */
export const MIN_PUBLIC_SAMPLE = 5;

export function meetsMinSample(n: number | null | undefined): boolean {
  return typeof n === 'number' && Number.isFinite(n) && n >= MIN_PUBLIC_SAMPLE;
}

type IdentityRow = {
  id?: string | null;
  business_id?: string | null;
  user_business_name?: string | null;
  input?: string | null;
};

/** Stable identity of the scanned business, so repeat scans count once. */
export function businessKey(row: IdentityRow): string {
  if (row.business_id) return `b:${row.business_id}`;
  const norm = (v: string | null | undefined) => (v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const name = norm(row.user_business_name);
  if (name) return `n:${name}`;
  const input = norm(row.input);
  if (input) return `i:${input}`;
  return `s:${row.id ?? ''}`;
}

/** Keeps the FIRST row per business — callers pass rows newest-first, so
 *  this is each business's latest scan. */
export function latestPerBusiness<T extends IdentityRow>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const k = businessKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

export type ComboSummary = { count: number; sum: number; latestScanAt: string };

type SummaryRow = IdentityRow & {
  industry: string | null;
  location: string | null;
  overall_score: number | null;
  created_at: string | null;
};

/**
 * Pure: newest-first scan rows -> per-combo ("industry/city") summary over
 * DISTINCT businesses (latest scan each). Rows outside the industry set,
 * with no matching city, or without a positive score are ignored.
 */
export function summarizeCombos(rows: SummaryRow[], cities: CitiesMap, industrySet: Set<string>): Map<string, ComboSummary> {
  // Round 2: group candidate rows per combo, then select with the SAME
  // selectComboScans the combo page uses, so sitemap and page agree.
  const groups = new Map<string, { industry: string; citySlug: string; rows: SummaryRow[] }>();
  for (const r of rows) {
    if (!r.industry || !industrySet.has(r.industry)) continue;
    const citySlug = locationToCitySlug(r.location, cities);
    if (!citySlug) continue;
    const key = `${r.industry}/${citySlug}`;
    const g = groups.get(key) ?? { industry: r.industry, citySlug, rows: [] };
    g.rows.push(r);
    groups.set(key, g);
  }
  const out = new Map<string, ComboSummary>();
  for (const [key, g] of groups) {
    const scans = selectComboScans(g.rows, g.industry, g.citySlug, cities);
    if (scans.length === 0) continue;
    out.set(key, {
      count: scans.length,
      sum: scans.reduce((acc, r) => acc + (r.overall_score ?? 0), 0),
      latestScanAt: scans.reduce((m, r) => ((r.created_at ?? '') > m ? (r.created_at ?? '') : m), ''),
    });
  }
  return out;
}

/**
 * Pure, SHARED by the combo page (getComboAggregate) and — via
 * summarizeCombos, which applies the identical filter + dedupe — the
 * sitemap: newest-first rows -> the scans that count for one combo (right
 * industry, positive score, city match, latest scan per business).
 */
export function selectComboScans<T extends SummaryRow>(rows: T[], industry: string, citySlug: string, cities: CitiesMap): T[] {
  return latestPerBusiness(rows.filter((r) =>
    r.industry === industry
    && typeof r.overall_score === 'number' && r.overall_score > 0
    && locationToCitySlug(r.location, cities) === citySlug,
  ));
}

// Row paging shared by the page and the sitemap loaders.
const SCAN_PAGE_SIZE = 1000;
const MAX_SCAN_PAGES = 50;

/** Pure: only the combos that pass the minimum-sample gate. */
export function indexableCombos(summary: Map<string, ComboSummary>): Map<string, ComboSummary> {
  const out = new Map<string, ComboSummary>();
  for (const [k, v] of summary) if (meetsMinSample(v.count)) out.set(k, v);
  return out;
}

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) throw new Error('supabase env missing');
  return createClient(supabaseUrl, supabaseKey);
}

/** 'Austin, TX' -> 'austin'; 'New York' -> 'new-york'; anything else -> null. */
export function locationToCitySlug(location: string | null | undefined, cities: CitiesMap): string | null {
  if (!location) return null;
  const base = location.split(',')[0].trim().toLowerCase();
  if (!base) return null;
  for (const [slug, c] of Object.entries(cities)) {
    if (c.label.toLowerCase() === base) return slug;
  }
  return null;
}

/** Real aggregate for ONE combo, or null when fewer than MIN_PUBLIC_SAMPLE distinct businesses qualify. */
export const getComboAggregate = cache(
  async (industry: string, citySlug: string, cityLabel: string, cities: CitiesMap): Promise<ComboAggregate | null> => {
    try {
      const supabase = getSupabase();
      // DB pre-filter: industry + location starting with the city label +
      // scored scans. The in-code locationToCitySlug check below drops false
      // positives (e.g. 'Austinburg' for Austin).
      // Round 2: the page used only the newest 200 rows while the sitemap
      // (getIndexableCombos) counted every row, so a combo could be in the
      // sitemap yet render noindex (or vice versa). Both now read ALL rows
      // (paginated, same 50-page cap) and select scans with the SAME pure
      // function, selectComboScans.
      const all: ScanRow[] = [];
      for (let page = 0; page < MAX_SCAN_PAGES; page++) {
        const { data } = await supabase
          .from('rankall_scans')
          .select('id, industry, location, overall_score, created_at, competitor_name, business_id, user_business_name, input')
          .eq('industry', industry)
          .ilike('location', `${cityLabel}%`)
          .not('overall_score', 'is', null)
          .gt('overall_score', 0)
          .order('created_at', { ascending: false })
          .range(page * SCAN_PAGE_SIZE, page * SCAN_PAGE_SIZE + SCAN_PAGE_SIZE - 1);
        const batch = (data ?? []) as ScanRow[];
        all.push(...batch);
        if (batch.length < SCAN_PAGE_SIZE) break;
      }
      const scans = selectComboScans(all, industry, citySlug, cities);
      // azxc: below the minimum sample there is no publishable aggregate.
      if (!meetsMinSample(scans.length)) return null;

      const total = scans.reduce((sum, s) => sum + (s.overall_score ?? 0), 0);
      const latestScanAt = scans.map((s) => s.created_at ?? '').sort().at(-1) || '';
      // azxc residual: the old code named the "leading competitor" from
      // a SINGLE scan (the most recent row's competitor_name) — one
      // customer's scan cannot establish a city-wide leader. A name is
      // only published when it is the most frequent competitor_name
      // across the combo's scans AND appears in >= 2 scans.
      const competitorCounts = new Map<string, number>();
      for (const s of scans) {
        const name = (s.competitor_name ?? '').trim();
        if (name) competitorCounts.set(name, (competitorCounts.get(name) ?? 0) + 1);
      }
      let topCompetitor: string | null = null;
      let topCount = 0;
      for (const [name, count] of competitorCounts) {
        if (count > topCount) { topCompetitor = name; topCount = count; }
      }
      if (topCount < 2) topCompetitor = null;

      // Per-platform mention rates for this combo's scans (best-effort — if
      // the platform rows are missing, the section is omitted, never faked).
      const platformRates: PlatformRate[] = [];
      try {
        const ids = scans.map((s) => s.id);
        const { data: rows } = await supabase
          .from('rankall_platform_results')
          .select('scan_id, platform, mentioned, mention_rate')
          .in('scan_id', ids);
        const byPlatform = new Map<string, { sum: number; count: number }>();
        for (const r of (rows ?? []) as Array<{ platform: string; mentioned: boolean | null; mention_rate: number | null }>) {
          if (!r.platform) continue;
          const rate = typeof r.mention_rate === 'number' ? r.mention_rate : r.mentioned ? 1 : 0;
          const acc = byPlatform.get(r.platform) ?? { sum: 0, count: 0 };
          acc.sum += rate;
          acc.count += 1;
          byPlatform.set(r.platform, acc);
        }
        for (const [platform, acc] of byPlatform) {
          // azxc: a platform rate is an aggregate too — same minimum.
          if (meetsMinSample(acc.count)) {
            platformRates.push({ platform, mentionRate: Math.round((acc.sum / acc.count) * 100), scans: acc.count });
          }
        }
        platformRates.sort((a, b) => b.mentionRate - a.mentionRate);
      } catch { /* non-fatal — section omitted */ }

      return {
        scanCount: scans.length,
        avgScore: Math.round(total / scans.length),
        latestScanAt,
        topCompetitor,
        platformRates,
      };
    } catch {
      // Non-fatal: a query failure must not 500 the page. The caller treats
      // null as "no data" (noindex + CTA) rather than inventing a number.
      return null;
    }
  },
);

/**
 * Every (industry, city) combo that passes the minimum-sample gate, mapped
 * to its latest scan date (for sitemap lastmod). Uses the same attribution
 * + dedupe rules as getComboAggregate, so the sitemap lists exactly the
 * pages that are indexable. Paginated; capped at 50 pages (50k scans) as a
 * safety valve so sitemap generation can't run unbounded.
 */
export const getIndexableCombos = cache(
  async (cities: CitiesMap, industrySlugs: string[]): Promise<Map<string, string>> => {
    const rows: SummaryRow[] = [];
    try {
      const supabase = getSupabase();
      const PAGE = SCAN_PAGE_SIZE;
      for (let page = 0; page < MAX_SCAN_PAGES; page++) {
        const { data } = await supabase
          .from('rankall_scans')
          .select('id, industry, location, overall_score, created_at, business_id, user_business_name, input')
          .not('overall_score', 'is', null)
          .gt('overall_score', 0)
          .order('created_at', { ascending: false })
          .range(page * PAGE, page * PAGE + PAGE - 1);
        const batch = (data ?? []) as SummaryRow[];
        rows.push(...batch);
        if (batch.length < PAGE) break;
      }
    } catch { /* non-fatal — sitemap degrades to the combos found so far */ }
    const combos = new Map<string, string>();
    for (const [k, v] of indexableCombos(summarizeCombos(rows, cities, new Set(industrySlugs)))) {
      combos.set(k, v.latestScanAt);
    }
    return combos;
  },
);

export type HubCityStat = { slug: string; label: string; scanCount: number; avgScore: number };
export type HubIndustryStat = { slug: string; scanCount: number; avgScore: number };
// NOTE: no label here — the city-hub page maps slug -> INDUSTRIES[slug].label
// (importing programmaticData into this lib would make the lib depend on
// the page data module; the hub page already imports it).

export type IndustryHubAggregate = {
  totalScans: number;
  avgScore: number; // rounded average over ALL qualifying scans in this industry
  citiesWithData: HubCityStat[]; // sorted by scanCount desc
};

export type CityHubAggregate = {
  totalScans: number;
  avgScore: number; // rounded average over ALL qualifying scans in this city
  industriesWithData: HubIndustryStat[]; // sorted by scanCount desc
};

/** Pure: build hub totals from the indexable combos only (azxc/azxg). */
export function hubFromCombos<T extends { slug: string; scanCount: number; avgScore: number }>(
  entries: Array<{ stat: T; sum: number }>,
): { totalScans: number; avgScore: number; items: T[] } | null {
  if (entries.length === 0) return null;
  let totalScans = 0;
  let totalSum = 0;
  for (const e of entries) { totalScans += e.stat.scanCount; totalSum += e.sum; }
  return { totalScans, avgScore: Math.round(totalSum / totalScans), items: entries.map((e) => e.stat) };
}

/**
 * Hub aggregate for ONE industry across all cities (azxg). Same attribution
 * + dedupe + minimum-sample rules as getComboAggregate, but ONE paginated
 * query for the whole industry instead of one query per city.
 * Only cities whose combo passes the minimum sample are listed or counted.
 * Returns null when no city qualifies — the hub then renders as a plain
 * navigation page with no stats, and is noindex + omitted from the sitemap.
 */
export const getIndustryHubAggregate = cache(
  async (industry: string, cities: CitiesMap): Promise<IndustryHubAggregate | null> => {
    try {
      const supabase = getSupabase();
      const rows: SummaryRow[] = [];
      const PAGE = SCAN_PAGE_SIZE;
      for (let page = 0; page < MAX_SCAN_PAGES; page++) {
        const { data } = await supabase
          .from('rankall_scans')
          .select('id, industry, location, overall_score, created_at, business_id, user_business_name, input')
          .eq('industry', industry)
          .not('overall_score', 'is', null)
          .gt('overall_score', 0)
          .order('created_at', { ascending: false })
          .range(page * PAGE, page * PAGE + PAGE - 1);
        const batch = (data ?? []) as SummaryRow[];
        rows.push(...batch);
        if (batch.length < PAGE) break;
      }
      const combos = indexableCombos(summarizeCombos(rows, cities, new Set([industry])));
      const hub = hubFromCombos<HubCityStat>([...combos].map(([key, v]) => {
        const slug = key.split('/')[1];
        return { stat: { slug, label: cities[slug]?.label ?? slug, scanCount: v.count, avgScore: Math.round(v.sum / v.count) }, sum: v.sum };
      }));
      if (!hub) return null;
      const citiesWithData = hub.items.sort((a, b) => b.scanCount - a.scanCount || a.label.localeCompare(b.label));
      return { totalScans: hub.totalScans, avgScore: hub.avgScore, citiesWithData };
    } catch {
      return null;
    }
  },
);

/**
 * Hub aggregate for ONE city across all industries (azxg). Mirror of
 * getIndustryHubAggregate: one paginated query pre-filtered on the city
 * label, then the exact locationToCitySlug check drops false positives
 * (e.g. 'Austinburg' for Austin) and the industry set drops non-hub rows.
 * Only industries whose combo passes the minimum sample count.
 */
export const getCityHubAggregate = cache(
  async (citySlug: string, cityLabel: string, cities: CitiesMap, industrySlugs: string[]): Promise<CityHubAggregate | null> => {
    try {
      const supabase = getSupabase();
      const rows: SummaryRow[] = [];
      const PAGE = SCAN_PAGE_SIZE;
      for (let page = 0; page < MAX_SCAN_PAGES; page++) {
        const { data } = await supabase
          .from('rankall_scans')
          .select('id, industry, location, overall_score, created_at, business_id, user_business_name, input')
          .ilike('location', `${cityLabel}%`)
          .not('overall_score', 'is', null)
          .gt('overall_score', 0)
          .order('created_at', { ascending: false })
          .range(page * PAGE, page * PAGE + PAGE - 1);
        const batch = (data ?? []) as SummaryRow[];
        rows.push(...batch);
        if (batch.length < PAGE) break;
      }
      const combos = indexableCombos(summarizeCombos(rows, cities, new Set(industrySlugs)));
      const hub = hubFromCombos<HubIndustryStat>([...combos]
        .filter(([key]) => key.split('/')[1] === citySlug)
        .map(([key, v]) => ({ stat: { slug: key.split('/')[0], scanCount: v.count, avgScore: Math.round(v.sum / v.count) }, sum: v.sum })));
      if (!hub) return null;
      const industriesWithData = hub.items.sort((a, b) => b.scanCount - a.scanCount || a.slug.localeCompare(b.slug));
      return { totalScans: hub.totalScans, avgScore: hub.avgScore, industriesWithData };
    } catch {
      return null;
    }
  },
);
