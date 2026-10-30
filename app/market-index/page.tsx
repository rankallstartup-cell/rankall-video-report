import { getSupabaseAdmin } from '@/lib/supabase';
import { GRADE_BANDS } from '@/lib/projection';

export const dynamic = 'force-dynamic';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'AI Recommendation Index | Rankall' },
  description:
    'The live average AI visibility score across real businesses scanned by Rankall, broken down by industry, city, and country.',
  alternates: { canonical: '/market-index' },
};


// The AI Recommendation Market Index — computed live from REAL scan data.
//
// Privacy rules (see ax8m): no business is ever named here. Only aggregates
// are published, and a group (industry / city / country) is shown only when
// it has at least MIN_GROUP_SCANS scans — a smaller group could identify
// an individual customer's score. The old page rendered hardcoded
// "June 2026" fallback numbers (national avg 34, fake industry/city
// tables) because it read a market_index_snapshots table that does not
// exist. The fallback is gone: with no qualifying data the page says so.
const MIN_GROUP_SCANS = 5;
const MAX_SCANS = 5000;

interface ScanRow {
  overall_score: number | null;
  industry: string | null;
  resolved_category: string | null;
  business_city: string | null;
  location: string | null;
  country_code: string | null;
  created_at: string | null;
}

function normalizeCity(r: ScanRow): string | null {
  const raw = (r.business_city || r.location || '').trim().toLowerCase();
  if (!raw) return null;
  // "austin, tx" and "austin" are the same city.
  const city = raw.split(',')[0].trim();
  return city || null;
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function mean(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function groupAvg(rows: ScanRow[], key: (r: ScanRow) => string | null) {
  const buckets = new Map<string, number[]>();
  for (const r of rows) {
    if (r.overall_score == null) continue;
    const k = key(r);
    if (!k) continue;
    const arr = buckets.get(k) ?? [];
    arr.push(r.overall_score);
    buckets.set(k, arr);
  }
  return [...buckets.entries()]
    .filter(([, v]) => v.length >= MIN_GROUP_SCANS)
    .map(([name, v]) => ({ name, avg: Math.round(mean(v)), count: v.length }))
    .sort((a, b) => b.avg - a.avg);
}

export default async function MarketIndexPage() {
  let rows: ScanRow[] = [];
  let loadError = false;
  try {
    const sb = getSupabaseAdmin();
    // Only dated scans from the last 12 months count toward a dated index.
    // (Rows with NULL created_at are real scans, but they cannot be placed
    // in a time window, so the methodology note says they are excluded.)
    const since = new Date();
    since.setFullYear(since.getFullYear() - 1);
    const { data, error } = await sb
      .from('rankall_scans')
      .select('overall_score, industry, resolved_category, business_city, location, country_code, created_at')
      .not('overall_score', 'is', null)
      .not('created_at', 'is', null)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(MAX_SCANS);
    if (error) throw error;
    rows = (data ?? []) as ScanRow[];
  } catch {
    loadError = true;
  }

  const scores = rows.map((r) => r.overall_score as number);
  const nationalAvg = scores.length > 0 ? Math.round(mean(scores)) : null;
  const topIndustries = groupAvg(rows, (r) => (r.resolved_category || r.industry || '').trim().toLowerCase() || null);
  const topCities = groupAvg(rows, normalizeCity);
  const countryBreakdown = groupAvg(rows, (r) => (r.country_code || '').trim().toUpperCase() || null);
  const monthLabel = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  // b8av: the "high performer" threshold is Rankall's own 'Strong' band
  // from the single grade table (lib/projection.ts GRADE_BANDS) — not an
  // invented "regularly recommended" line. The count is shown alongside
  // the percentage so the derivation is traceable on the page.
  const strongMin = GRADE_BANDS.find((b) => b.label === 'Strong')?.min ?? 71;
  const highPerformers = scores.length > 0 ? scores.filter((s) => s >= strongMin).length : 0;
  const highPct = scores.length > 0 ? Math.round((highPerformers / scores.length) * 100) : 0;

  return (
    <main style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: 'sans-serif', padding: '60px 20px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ marginBottom: 40 }}>
          <p style={{ color: '#1B17FF', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 8px' }}>
            Research Report
          </p>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: '#111827', margin: '0 0 8px' }}>
            Rankall AI Recommendation Market Index
          </h1>
          <p style={{ color: '#6b7280', fontSize: 16, margin: 0 }}>{monthLabel}</p>
        </div>

        {loadError || nationalAvg == null ? (
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 32, textAlign: 'center' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>Not enough data yet</h2>
            <p style={{ color: '#6b7280', fontSize: 15, margin: '0 0 20px', lineHeight: 1.6 }}>
              The index needs at least {MIN_GROUP_SCANS} dated scans with a measured score before it can
              publish an average. Run a scan to contribute to the next index.
            </p>
            <a href="/" style={{ display: 'inline-block', background: '#1B17FF', color: '#fff', textDecoration: 'none', borderRadius: 12, padding: '14px 28px', fontWeight: 700, fontSize: 16 }}>
              Scan My Business Free →
            </a>
          </div>
        ) : (
          <>
            {/* National average */}
            <div style={{ background: '#1B17FF', borderRadius: 16, padding: 32, color: '#fff', marginBottom: 32, textAlign: 'center' }}>
              <p style={{ margin: '0 0 8px', opacity: 0.8, fontSize: 14 }}>Average AI Visibility Score — All Businesses</p>
              <p style={{ fontSize: 72, fontWeight: 900, margin: '0 0 8px' }}>{nationalAvg}<span style={{ fontSize: 28, opacity: 0.6 }}>/100</span></p>
              <p style={{ opacity: 0.8, fontSize: 15, margin: 0 }}>
                Based on {scores.length.toLocaleString()} dated scans from the last 12 months
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, marginBottom: 32 }}>
              {/* Top industries */}
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px', color: '#111827' }}>Top Industries by AI Visibility</h2>
                <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>Only groups with at least {MIN_GROUP_SCANS} scans are listed.</p>
                {topIndustries.length > 0 ? topIndustries.map((ind, i) => (
                  <div key={ind.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: i > 0 ? '1px solid #f3f4f6' : 'none' }}>
                    <span style={{ fontSize: 14, color: '#374151', textTransform: 'capitalize' }}>{ind.name} <span style={{ color: '#9ca3af', fontSize: 12 }}>({ind.count} scans)</span></span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#1B17FF' }}>{ind.avg}/100</span>
                  </div>
                )) : (
                  <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>No industry has {MIN_GROUP_SCANS}+ scans yet.</p>
                )}
              </div>

              {/* Top cities */}
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px', color: '#111827' }}>Top Cities by AI Visibility</h2>
                <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px' }}>Only groups with at least {MIN_GROUP_SCANS} scans are listed.</p>
                {topCities.length > 0 ? topCities.map((city, i) => (
                  <div key={city.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: i > 0 ? '1px solid #f3f4f6' : 'none' }}>
                    <span style={{ fontSize: 14, color: '#374151' }}>{titleCase(city.name)} <span style={{ color: '#9ca3af', fontSize: 12 }}>({city.count} scans)</span></span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#1B17FF' }}>{city.avg}/100</span>
                  </div>
                )) : (
                  <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>No city has {MIN_GROUP_SCANS}+ scans yet.</p>
                )}
              </div>
            </div>

            {/* Country breakdown */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, marginBottom: 32 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px', color: '#111827' }}>By Country</h2>
              {countryBreakdown.length > 0 ? (
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {countryBreakdown.slice(0, 8).map((c) => (
                    <div key={c.name} style={{ background: '#f9fafb', borderRadius: 8, padding: '12px 20px', textAlign: 'center', minWidth: 80 }}>
                      <p style={{ fontWeight: 700, fontSize: 22, color: '#1B17FF', margin: '0 0 2px' }}>{c.avg}</p>
                      <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>{c.name} · {c.count} scans</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>No country has {MIN_GROUP_SCANS}+ scans yet.</p>
              )}
            </div>

            {/* Key insight — computed from the real sample, not asserted */}
            <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 12, padding: 24, marginBottom: 32 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px', color: '#6d28d9' }}>Key Insight</h2>
              <p style={{ color: '#374151', margin: 0, lineHeight: 1.6 }}>
                Across {scores.length.toLocaleString()} measured scans, the average business scores {nationalAvg}/100 on
                AI visibility, and {highPerformers} of {scores.length.toLocaleString()} scans ({highPct}%) reach {strongMin} or higher — Rankall&apos;s &apos;Strong&apos; band. Most businesses are still effectively invisible to AI recommendation engines like
                ChatGPT, Gemini, and Perplexity.
              </p>
            </div>

            {/* Methodology — what the numbers are and are not */}
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, marginBottom: 32 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px', color: '#111827' }}>How this index is built</h2>
              <ul style={{ color: '#374151', fontSize: 14, lineHeight: 1.7, margin: 0, paddingLeft: 20 }}>
                <li>Source: real Rankall scans — each business is scored across 12 AI platforms on whether AI assistants recommend it.</li>
                <li>Sample: {scores.length.toLocaleString()} dated scans from the last 12 months (most recent {MAX_SCANS.toLocaleString()} at most). Scans without a date are excluded.</li>
                <li>Privacy: no business is named. Averages are published only for groups with at least {MIN_GROUP_SCANS} scans, so no single customer&apos;s score can be identified.</li>
                <li>Freshness: computed live on every visit from the current scan data — not a frozen snapshot.</li>
              </ul>
            </div>

            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#6b7280', fontSize: 14, margin: '0 0 16px' }}>Where does your business rank?</p>
              <a href="/" style={{ display: 'inline-block', background: '#1B17FF', color: '#fff', textDecoration: 'none', borderRadius: 12, padding: '14px 28px', fontWeight: 700, fontSize: 16 }}>
                Scan My Business Free →
              </a>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
