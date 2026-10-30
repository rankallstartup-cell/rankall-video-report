'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getBrowserClient } from '@/lib/supabase';
import { PlanPageGuard } from '@/components/PlanPageGuard';
import { usePlan } from '@/lib/usePlan';
const supabase = getBrowserClient();

const BG     = '#F6F6FB';
const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#E7E7F0';
const BLUE   = '#1B17FF';
const GREEN  = '#12A150';
const AMBER  = '#D97706';
const PURPLE = '#7C3AED';
const GRAY   = '#55556A';
const LGRAY  = '#5F5F78';

interface LabelRow {
  industry: string;
  city: string;
  state: string;
  query_type: string;
  business_type: string;
  ai_recommendation_confidence: string;
  created_at: string;
  overall_score: number;
  trust_score: number;
  country?: string;
}

function StatCard({ label, value, sub, color = BLUE }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="dash-card" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '20px 24px' }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>{label}</p>
      <p style={{ fontSize: 32, fontWeight: 900, color, margin: '0 0 4px', lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 12, color: LGRAY, margin: 0 }}>{sub}</p>}
    </div>
  );
}

function BarRow({ label, value, max, color = BLUE }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
      <span style={{ fontSize: 13, color: NAVY, fontWeight: 600, width: 160, flexShrink: 0, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: 8, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.6s ease' }} />
      </div>
      <span style={{ fontSize: 12, color: LGRAY, width: 32, textAlign: 'right', flexShrink: 0 }}>{value}</span>
    </div>
  );
}

function count(rows: LabelRow[], key: keyof LabelRow): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const v = (r[key] as string) || 'unknown';
    out[v] = (out[v] || 0) + 1;
  }
  return out;
}

function top(map: Record<string, number>, n = 10): Array<{ label: string; value: number }> {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([label, value]) => ({ label, value }));
}

function dayBuckets(rows: LabelRow[], days = 30): Array<{ date: string; count: number }> {
  const buckets: Record<string, number> = {};
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000);
    buckets[d.toISOString().slice(0, 10)] = 0;
  }
  for (const r of rows) {
    const d = r.created_at?.slice(0, 10);
    if (d && d in buckets) buckets[d]++;
  }
  return Object.entries(buckets).map(([date, count]) => ({ date, count }));
}

function GrowthChart({ data }: { data: Array<{ date: string; count: number }> }) {
  const maxVal = Math.max(...data.map(d => d.count), 1);
  const W_SVG = 520, H_SVG = 80;
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * W_SVG;
    const y = H_SVG - (d.count / maxVal) * (H_SVG - 8);
    return `${x},${y}`;
  });
  const area = `M0,${H_SVG} L${pts.join(' L')} L${W_SVG},${H_SVG} Z`;
  const line = `M${pts.join(' L')}`;

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W_SVG} ${H_SVG}`} style={{ width: '100%', height: 80, display: 'block' }}>
        <defs>
          <linearGradient id="ig-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BLUE} stopOpacity="0.2" />
            <stop offset="100%" stopColor={BLUE} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#ig-grad)" />
        <path d={line} fill="none" stroke={BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 10, color: LGRAY }}>{data[0]?.date?.slice(5)}</span>
        <span style={{ fontSize: 10, color: LGRAY }}>{data[data.length - 1]?.date?.slice(5)}</span>
      </div>
    </div>
  );
}

const QUERY_COLORS: Record<string, string> = {
  local: GREEN, informational: BLUE, transactional: AMBER, navigational: PURPLE,
};
const CONF_COLORS: Record<string, string> = { high: GREEN, medium: AMBER, low: '#DC2626' };

export default function IntelligencePage() {
  const [rows, setRows]       = useState<LabelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState('ALL');
  const [kpStats, setKpStats] = useState<Array<{ knowledge_panel_exists: boolean | null; knowledge_panel_claimed: boolean | null; industry: string | null; country_code: string | null }> | null>(null);
  const [loadError, setLoadError] = useState(false);
  // b89v: session state is tracked explicitly — logged-out visitors
  // previously got the dashboard shell plus the plan paywall, and a
  // signed-in Free account saw no gate wording at all (the admin
  // test account resolves to an enterprise plan, which masked it).
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const { plan, rawPlan } = usePlan();

  async function load() {
    setLoadError(false);
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setSignedIn(!!session);
      if (!session) { setLoading(false); return; }
      const { data, error } = await supabase
        .from('data_labels')
        .select('industry,city,state,query_type,business_type,ai_recommendation_confidence,created_at,overall_score,trust_score,country')
        .order('created_at', { ascending: false })
        .limit(5000);
      if (error) throw error;
      setRows(data || []);

      // Cross-user aggregate via the server (owner-only RLS hides other
      // users' scans from the browser); non-identifying columns only.
      const kpRes = await fetch('/api/dashboard/kp-stats');
      const kpJson = kpRes.ok ? await kpRes.json().catch(() => null) : null;
      setKpStats(Array.isArray(kpJson?.rows) ? kpJson.rows : null);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filteredRows = selectedCountry === 'ALL' ? rows : rows.filter(r => r.country === selectedCountry);

  const total       = filteredRows.length;
  const avgScore    = total ? Math.round(filteredRows.reduce((s, r) => s + r.overall_score, 0) / total) : 0;
  const avgTrust    = total ? Math.round(filteredRows.reduce((s, r) => s + r.trust_score, 0) / total) : 0;
  const last7       = filteredRows.filter(r => Date.now() - new Date(r.created_at).getTime() < 7 * 86400000).length;

  const byIndustry  = top(count(filteredRows, 'industry'), 10);
  const byCity      = top(count(filteredRows, 'city'), 10);
  const byQueryType = count(filteredRows, 'query_type');
  const byConf      = count(filteredRows, 'ai_recommendation_confidence');
  const byBizType   = top(count(filteredRows, 'business_type'), 8);
  const growth      = dayBuckets(filteredRows, 30);

  // Global comparison — real per-country averages from the labeled rows
  // (unfiltered: the comparison spans all countries). No hardcoded table:
  // countries with no labeled scans simply don't appear.
  const countryAgg: Record<string, { sum: number; n: number }> = {};
  for (const r of rows) {
    const c = r.country || 'unknown';
    const agg = countryAgg[c] ?? { sum: 0, n: 0 };
    agg.sum += r.overall_score || 0;
    agg.n += 1;
    countryAgg[c] = agg;
  }
  const countryRows = Object.entries(countryAgg)
    .map(([country, a]) => ({ country, avg: Math.round(a.sum / a.n), n: a.n }))
    .sort((a, b) => b.avg - a.avg);

  const maxInd  = byIndustry[0]?.value || 1;
  const maxCity = byCity[0]?.value || 1;
  const maxBiz  = byBizType[0]?.value || 1;

  if (loading) {
    return (
      <div style={{ padding: '48px 28px', textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: LGRAY }}>Loading Intelligence Graph…</p>
      </div>
    );
  }

  // b89v: the sign-in gate renders BEFORE the plan paywall — a
  // logged-out visitor is asked to sign in, never shown an upgrade
  // card for a feature they cannot evaluate signed out.
  if (signedIn === false) {
    return (
      <div style={{ padding: '48px 28px', textAlign: 'center' }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>Sign in to view the Intelligence Graph.</p>
        <p style={{ fontSize: 13, color: GRAY, margin: '0 0 16px' }}>Auto-labeled scan data powering AI visibility insights across industries and markets.</p>
        <Link href="/login?next=/dashboard/intelligence" style={{ color: BLUE, fontWeight: 700, fontSize: 14 }}>Sign in</Link>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ background: BG, minHeight: '100vh', padding: '28px 24px', fontFamily: 'var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif' }}>
          <nav style={{ fontSize: 13, color: GRAY, marginBottom: 20, display: 'flex', gap: 8, alignItems: 'center' }}>
          <a href="/dashboard" style={{ color: PURPLE, textDecoration: 'none', fontWeight: 600 }}>Dashboard</a>
          <span>›</span>
          <span>Intelligence</span>
        </nav>
        <header className="pagehead">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.035em', color: NAVY, margin: 0 }}>Intelligence Graph</h1>
            <p style={{ fontSize: 14, color: GRAY, margin: 0 }}>Auto-labeled scan data powering AI visibility insights across industries and markets.</p>
          </div>
        </header>
        <div className="card dash-card" style={{ marginTop: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}><svg viewBox="0 0 512 512" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg></div>
          <h3 style={{ color: NAVY, marginBottom: 8 }}>Something went wrong</h3>
          <p style={{ marginBottom: 16 }}>We couldn&apos;t load the Intelligence Graph. Please try again.</p>
          <button onClick={load} className="btn btn-blue">Try Again</button>
        </div>
      </div>
    );
  }

  return (
    <PlanPageGuard feature="canSeeIntelGraph" requiredPlan="business">
    <div style={{ padding: '32px 28px', maxWidth: 1100, margin: '0 auto' }}>
      {plan !== rawPlan && (
        <div style={{ background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 12, padding: '10px 16px', marginBottom: 20 }}>
          <p style={{ fontSize: 12, color: '#92400E', fontWeight: 600, margin: 0 }}>
            Admin view — your account plan is {rawPlan}; the Intelligence Graph is gated to Local Business plans and above for customers.
          </p>
        </div>
      )}

      {/* Breadcrumb */}
      <nav style={{ fontSize: 13, color: '#64748B', marginBottom: 20, display: 'flex', gap: 8, alignItems: 'center' }}>
        <a href="/dashboard" style={{ color: '#7C3AED', textDecoration: 'none', fontWeight: 600 }}>Dashboard</a>
        <span>›</span>
        <span>Intelligence</span>
      </nav>

      {/* Header */}
      <header className="pagehead" style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.035em', color: NAVY, margin: 0 }}>Intelligence Graph</h1>
            <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', background: '#ECEBFF', color: BLUE, borderRadius: 20, border: '1.5px solid #C9C6FF' }}>
              {total.toLocaleString()} data points
            </span>
          </div>
          <p style={{ fontSize: 14, color: GRAY, margin: 0 }}>Auto-labeled scan data powering AI visibility insights across industries and markets.</p>
        </div>
      </header>

      {/* Country filter */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#55556A', alignSelf: 'center' }}>Filter by country:</span>
        {['ALL', 'US', 'GB', 'AU', 'CA', 'IN', 'IE', 'NZ', 'SG', 'AE', 'ZA', 'NG', 'KE', 'GH', 'PH'].map(c => (
          <button
            key={c}
            onClick={() => setSelectedCountry(c)}
            style={{
              padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${selectedCountry === c ? '#1B17FF' : '#E7E7F0'}`,
              background: selectedCountry === c ? '#ECEBFF' : '#F6F6FB',
              color: selectedCountry === c ? '#1B17FF' : '#55556A',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {c === 'ALL' ? 'All Countries' : c}
          </button>
        ))}
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
        <StatCard label="Total Scans Labeled" value={total.toLocaleString()} sub="intelligence data points" color={BLUE} />
        <StatCard label="Added Last 7 Days"   value={last7} sub="new labels" color={GREEN} />
        <StatCard label="Avg Visibility Score" value={avgScore} sub="across all scans" color={avgScore >= 70 ? GREEN : avgScore >= 40 ? AMBER : '#DC2626'} />
        <StatCard label="Avg Trust Score"     value={avgTrust} sub="across all scans" color={PURPLE} />
        <StatCard label="Industries Tracked"  value={Object.keys(count(filteredRows, 'industry')).length} sub="unique industries" color={AMBER} />
        <StatCard label="Cities Tracked"      value={Object.keys(count(filteredRows, 'city')).length} sub="unique cities" color={NAVY} />
      </div>

      {/* Growth chart */}
      <div className="card dash-card" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '24px 28px', marginBottom: 24 }}>
        <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, margin: '0 0 16px' }}>Scans per Day — Last 30 Days</p>
        <GrowthChart data={growth} />
      </div>

      {/* Two column: industries + cities */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>

        <div className="card dash-card" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '24px 28px' }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, margin: '0 0 20px' }}>Top Industries</p>
          {byIndustry.length === 0
            ? <p style={{ fontSize: 13, color: LGRAY }}>No data yet</p>
            : byIndustry.map(({ label, value }) => (
                <BarRow key={label} label={label || 'unknown'} value={value} max={maxInd} color={BLUE} />
              ))}
        </div>

        <div className="card dash-card" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '24px 28px' }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, margin: '0 0 20px' }}>Top Cities by Scan Volume</p>
          {byCity.length === 0
            ? <p style={{ fontSize: 13, color: LGRAY }}>No data yet</p>
            : byCity.map(({ label, value }) => (
                <BarRow key={label} label={label || 'unknown'} value={value} max={maxCity} color={GREEN} />
              ))}
        </div>
      </div>

      {/* Query type + confidence + business type */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 24 }}>

        <div className="card dash-card" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '24px 28px' }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, margin: '0 0 20px' }}>Query Type Breakdown</p>
          {Object.entries(byQueryType).length === 0
            ? <p style={{ fontSize: 13, color: LGRAY }}>No data yet</p>
            : Object.entries(byQueryType).sort((a, b) => b[1] - a[1]).map(([type, n]) => (
                <div key={type} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: (QUERY_COLORS[type] || GRAY) + '22', color: QUERY_COLORS[type] || GRAY }}>
                    {type}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{n}</span>
                </div>
              ))}
        </div>

        <div className="card dash-card" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '24px 28px' }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, margin: '0 0 20px' }}>AI Recommendation Confidence</p>
          {Object.entries(byConf).length === 0
            ? <p style={{ fontSize: 13, color: LGRAY }}>No data yet</p>
            : ['high', 'medium', 'low'].map(level => {
                const n = byConf[level] || 0;
                if (!n) return null;
                return (
                  <div key={level} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: (CONF_COLORS[level]) + '22', color: CONF_COLORS[level] }}>
                      {level}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 60, height: 6, background: '#F1F5F9', borderRadius: 3 }}>
                        <div style={{ height: '100%', width: `${Math.round((n / total) * 100)}%`, background: CONF_COLORS[level], borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{n}</span>
                    </div>
                  </div>
                );
              })}
        </div>

        <div className="card dash-card" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '24px 28px' }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, margin: '0 0 20px' }}>Business Type Mix</p>
          {byBizType.length === 0
            ? <p style={{ fontSize: 13, color: LGRAY }}>No data yet</p>
            : byBizType.map(({ label, value }) => (
                <BarRow key={label} label={label.replace('_', ' ')} value={value} max={maxBiz} color={PURPLE} />
              ))}
        </div>
      </div>

      {/* Footer note */}
      <div className="card dash-card" style={{ background: '#ECEBFF', border: '1.5px solid #C9C6FF', borderRadius: 12, padding: '16px 20px' }}>
        <p style={{ fontSize: 13, color: '#1310C4', margin: 0, lineHeight: 1.6 }}>
          <strong>Intelligence Graph size: {total.toLocaleString()} data points.</strong> Every scan automatically adds a labeled data point. Labels include industry, city, query type, confidence level, and platform results — used to improve fix recommendations and benchmark scores across markets.
        </p>
      </div>

      {/* Entity Verification Rates */}
      {kpStats && kpStats.length > 0 && (() => {
        const total = kpStats.length;
        const hasPanel = kpStats.filter(s => s.knowledge_panel_exists).length;
        const claimed = kpStats.filter(s => s.knowledge_panel_claimed).length;
        const panelPct = Math.round((hasPanel / total) * 100);
        const claimedPct = Math.round((claimed / total) * 100);

        return (
          <div className="card dash-card" style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, marginTop: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px', color: '#111827' }}>
              Entity Verification Rates
            </h3>
            <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 36, fontWeight: 800, color: '#dc2626' }}>{panelPct}%</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>have Knowledge Panel</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 36, fontWeight: 800, color: '#7c3aed' }}>{claimedPct}%</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>have claimed panel</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 36, fontWeight: 800, color: '#059669' }}>{100 - panelPct}%</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>missing entirely</div>
              </div>
            </div>
            {/* b89v: these rates are computed from scans with a recorded
                Knowledge Panel check (kp-stats) — a different, larger
                set than this page's labeled data points, and they move
                as new scans land (43% -> 39% -> 36% across checks). The
                basis is stated on the card; the old copy stated no
                denominator and claimed an unsourced superlative. */}
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 6px', fontStyle: 'italic' }}>
              Only {panelPct}% of these businesses have a Google Knowledge Panel.
            </p>
            <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
              Based on {total} scanned businesses with a Knowledge Panel check recorded (all countries) — this set is separate from the labeled data points above and grows as new scans land.
            </p>
          </div>
        );
      })()}

      {/* Global Comparison — real averages from labeled scans */}
      <div style={{ marginTop: 24 }}>
        <p style={{ fontSize: 14, fontWeight: 800, color: NAVY, margin: '0 0 4px' }}>Global Comparison — Avg AI Visibility Score by Country</p>
        <p style={{ fontSize: 12, color: GRAY, margin: '0 0 12px' }}>Averages from labeled scans in this Intelligence Graph. Countries with no labeled scans don&apos;t appear.</p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F6F6FB' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: NAVY, border: '1px solid #e5e7eb' }}>Country</th>
                <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: NAVY, border: '1px solid #e5e7eb' }}>Avg AI Score</th>
                <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: NAVY, border: '1px solid #e5e7eb' }}>Labeled Scans</th>
              </tr>
            </thead>
            <tbody>
              {countryRows.length === 0 && (
                <tr style={{ background: W }}>
                  <td colSpan={3} style={{ padding: '12px 16px', color: GRAY, border: '1px solid #e5e7eb', textAlign: 'center' }}>No labeled scans yet — the comparison will appear once scans are labeled.</td>
                </tr>
              )}
              {countryRows.map(({ country, avg, n }) => (
                <tr key={country} style={{ background: W }}>
                  <td style={{ padding: '8px 16px', color: GRAY, border: '1px solid #e5e7eb', fontWeight: 600 }}>{country}</td>
                  <td style={{ padding: '8px 16px', color: NAVY, border: '1px solid #e5e7eb', textAlign: 'right', fontWeight: 700 }}>{avg}</td>
                  <td style={{ padding: '8px 16px', color: GRAY, border: '1px solid #e5e7eb', textAlign: 'right' }}>{n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
    </PlanPageGuard>
  );
}
