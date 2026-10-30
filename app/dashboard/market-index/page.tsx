'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Geist, Geist_Mono } from 'next/font/google';
import { getBrowserClient } from '@/lib/supabase';

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

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

// No invented baselines: the old DEFAULT_NATIONAL = 52 and a static
// "top industries" table (Med Spas 64, Dentists 61, …) were shown as
// averages. Every figure now comes from real scans via
// /api/dashboard/benchmarks (min sample, else "not enough data"). The old
// client-side industry average read rankall_scans under RLS, i.e. only the
// viewer's OWN scans, and called that the industry average.

const PLATFORM_TRENDS = [
  { name: 'ChatGPT',    note: 'Largest share of AI-driven discovery' },
  { name: 'Perplexity', note: 'Fastest-growing for local intent' },
  { name: 'Google AI',  note: 'AI Overviews expanding to more queries' },
  { name: 'Gemini',     note: 'Rising on mobile assistant integration' },
];

function Breadcrumb({ page }: { page: string }) {
  return (
    <nav style={{ fontSize: 13, color: GRAY, marginBottom: 20 }}>
      <Link href="/dashboard" style={{ color: PURPLE, textDecoration: 'none', fontWeight: 600 }}>Dashboard</Link>
      <span style={{ margin: '0 8px', color: LGRAY }}>›</span>
      <span>{page}</span>
    </nav>
  );
}

export default function MarketIndexPage() {
  const [loaded, setLoaded] = useState(false);
  // b89y: explicit sign-in state — a logged-out visitor previously got
  // the shell plus "not enough scans" placeholders (including a
  // "fewer than 20 scans" line that was false against the real count),
  // because the benchmarks fetch 401s and every figure stayed null.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [national, setNational] = useState<{ avg: number; count: number } | null>(null);
  const [industryAvg, setIndustryAvg] = useState<{ avg: number; count: number } | null>(null);
  const [yourScore, setYourScore] = useState<number | null>(null);
  const [industry, setIndustry] = useState('general');
  const [percentile, setPercentile] = useState<number | null>(null);
  const [percentileBelow, setPercentileBelow] = useState<number | null>(null);
  const [percentileSample, setPercentileSample] = useState<number | null>(null);
  const [countryCode, setCountryCode] = useState('US');
  const [topIndustries, setTopIndustries] = useState<Array<{ industry: string; avg: number; count: number }>>([]);
  const [minSample, setMinSample] = useState(5);

  const month = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  useEffect(() => {
    async function load() {
      try {
        const supabase = getBrowserClient();
        // The viewer's latest scan decides the country + industry compared.
        let userCountry = 'US';
        let userIndustry: string | null = null;
        let userScore: number | null = null;
        const { data: { session } } = await supabase.auth.getSession();
        setSignedIn(!!session);
        if (!session) { setLoaded(true); return; }
        if (session) {
          const { data: mine } = await supabase
            .from('rankall_scans')
            .select('overall_score, industry, country_code')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (mine) {
            userScore = typeof mine.overall_score === 'number' ? mine.overall_score : null;
            userIndustry = mine.industry ?? null;
            if (mine.country_code) userCountry = mine.country_code;
          }
        }
        setYourScore(userScore);
        if (userIndustry) setIndustry(userIndustry);
        setCountryCode(userCountry);

        const params = new URLSearchParams({ country: userCountry, industry: userIndustry ?? '' });
        if (userScore != null) params.set('score', String(userScore));
        const res = await fetch(`/api/dashboard/benchmarks?${params.toString()}`);
        if (res.ok) {
          const j = await res.json();
          setNational(j.national ?? null);
          setIndustryAvg(j.industry ?? null);
          setPercentile(typeof j.percentile === 'number' ? j.percentile : null);
          setPercentileBelow(typeof j.percentileBelow === 'number' ? j.percentileBelow : null);
          setPercentileSample(typeof j.percentileSample === 'number' ? j.percentileSample : null);
          setTopIndustries(Array.isArray(j.topIndustries) ? j.topIndustries : []);
          if (typeof j.minSample === 'number') setMinSample(j.minSample);
        }
      } catch { /* graceful: figures stay null → "not enough data" */ }
      setLoaded(true);
    }
    load();
  }, []);

  const barMax = Math.max(...topIndustries.map(i => i.avg), 1);

  if (!loaded) return <div style={{ padding: '48px 32px', textAlign: 'center', color: GRAY }}>Loading…</div>;

  if (signedIn === false) return (
    <div style={{ padding: '48px 32px', textAlign: 'center' }}>
      <p style={{ fontSize: 16, fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>Sign in to view the Market Index.</p>
      <p style={{ fontSize: 13, color: GRAY, margin: '0 0 16px' }}>The index compares your latest scan with real scans from the last 12 months.</p>
      <Link href="/login?next=/dashboard/market-index" style={{ color: BLUE, fontWeight: 700, fontSize: 14 }}>Sign in</Link>
    </div>
  );

  const vsAvg = yourScore != null && national ? yourScore - national.avg : null;

  return (
    <div className={`${geistSans.variable} ${geistMono.variable}`} style={{ background: BG, minHeight: '100vh', padding: '28px 24px', fontFamily: 'var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif' }}>
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .dash-card { animation: fadeInUp 0.5s ease both; transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .dash-card:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(27,23,255,0.15); }
        .card{background:#fff;border:1px solid #E7E7F0;border-radius:16px;padding:22px;min-width:0}
        .lbl{font-family:var(--font-geist-mono),monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#5F5F78}
        .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 18px;border-radius:12px;font-family:inherit;font-weight:600;font-size:14px;border:0;cursor:pointer;white-space:nowrap;text-decoration:none}
        .btn-blue{background:#1B17FF;color:#fff}.btn-blue:hover{background:#1310C4;color:#fff}
        .btn-line{background:#fff;color:#0A0A14;border:1.5px solid #E7E7F0}.btn-line:hover{border-color:#1B17FF;color:#1B17FF}
        .btn-ghost{background:transparent;color:#55556A}.btn-ghost:hover{background:#F6F6FB}
        .pagehead{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}
        @media (max-width:639px){
          .pagehead{flex-direction:column;align-items:stretch}
          .card{padding:18px}
        }
        @media (prefers-reduced-motion:reduce){*{animation:none!important}}
      `}</style>
    <div style={{ padding: '0 0 80px', maxWidth: 900, margin: '0 auto' }}>
      <Breadcrumb page="Market Index" />

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 6 }}><svg viewBox="0 0 512 512" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M64 64c0-17.7-14.3-32-32-32S0 46.3 0 64L0 400c0 44.2 35.8 80 80 80l400 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L80 416c-8.8 0-16-7.2-16-16L64 64zm406.6 86.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L320 210.7l-57.4-57.4c-12.5-12.5-32.8-12.5-45.3 0l-112 112c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L240 221.3l57.4 57.4c12.5 12.5 32.8 12.5 45.3 0l128-128z"/></svg> AI Recommendation Market Index</h1>
        <p style={{ fontSize: 14, color: GRAY }}>Monthly intelligence on AI visibility trends — {month}. Averages cover real scans from the last 12 months — the same sample as the public Market Index.</p>
      </div>

      {/* Current month stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
        <StatCard label={`Average score · ${countryCode}`} value={national ? `${national.avg}` : '—'} color={BLUE} sub={national ? `from ${national.count} ${countryCode} scans` : `fewer than ${minSample} ${countryCode} scans in the last 12 months yet`} />
        <StatCard label="Your score" value={yourScore != null ? `${yourScore}` : '—'} color={PURPLE} sub={vsAvg != null ? `${vsAvg >= 0 ? '+' : ''}${vsAvg} vs ${countryCode} average` : 'run a scan'} />
        <StatCard label="Your industry average" value={industryAvg ? `${industryAvg.avg}` : '—'} color={NAVY} sub={industryAvg ? `${industry} · ${industryAvg.count} scans` : `${industry} · not enough scans yet`} />
      </div>

      {/* Top industries chart */}
      <div className="card dash-card" style={{ padding: '24px 28px', marginBottom: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <p className="lbl" style={{ marginBottom: 6 }}>Top Industries by AI Visibility</p>
        <p style={{ fontSize: 12, color: LGRAY, marginBottom: 18 }}>Average scores from real {countryCode} scans (industries with at least {minSample} scans).</p>
        {topIndustries.length === 0 && (
          <p style={{ fontSize: 13, color: GRAY }}>Not enough scans yet to rank industries.</p>
        )}
        {topIndustries.map(ind => (
          <div key={ind.industry} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 13, color: GRAY, fontWeight: 600 }}>{ind.industry} <span style={{ fontWeight: 400, color: LGRAY }}>· {ind.count} scans</span></span>
              <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{ind.avg}</span>
            </div>
            <div style={{ height: 10, background: BORDER, borderRadius: 100, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(ind.avg / barMax) * 100}%`, background: BLUE, borderRadius: 100 }} />
            </div>
          </div>
        ))}
      </div>

      {/* Platform trends */}
      <div className="card dash-card" style={{ padding: '24px 28px', marginBottom: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <p className="lbl" style={{ marginBottom: 6 }}>Platform Trends</p>
        <p style={{ fontSize: 12, color: LGRAY, marginBottom: 18 }}>General guidance — not measured from this month&apos;s scans.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {PLATFORM_TRENDS.map(p => (
            <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 12 }}>
              <span style={{ fontSize: 18, color: GREEN }}>↑</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: NAVY, minWidth: 110 }}>{p.name}</span>
              <span style={{ fontSize: 13, color: GRAY }}>{p.note}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Your position */}
      <div className="card dash-card" style={{ background: '#F5F3FF', border: '1.5px solid #DDD6FE', padding: '24px 28px', marginBottom: 24 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: PURPLE, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Your Position in the Market</p>
        {percentile != null ? (
          <>
            <p style={{ fontSize: 18, fontWeight: 800, color: NAVY }}>
              You're in the top {Math.max(1, 100 - percentile)}% — ahead of {percentile}% of scanned {industry} businesses.
            </p>
            {/* b89y: the denominator + method, stated — the bare
                percentage could not be traced to any sample. */}
            {percentileBelow != null && percentileSample != null && yourScore != null && (
              <p style={{ fontSize: 13, color: GRAY, marginTop: 8 }}>
                {percentileBelow} of the {percentileSample} scanned {industry} businesses from the last 12 months scored lower than your {yourScore}. Ties count as not lower.
              </p>
            )}
          </>
        ) : (
          <p style={{ fontSize: 15, color: GRAY }}>
            {yourScore != null ? `Not enough ${industry} scans yet to rank you — we need at least ${minSample}.` : 'Run a scan to see your percentile rank against businesses in your industry.'} <Link href="/" style={{ color: PURPLE, fontWeight: 700 }}>Start here <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
          </p>
        )}
      </div>

      <div style={{ background: NAVY, borderRadius: 18, padding: '24px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <p style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>Move up the index — apply your top fixes.</p>
        <Link href="/dashboard/fix" className="btn btn-blue">
          View Fix Queue <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
      </div>
    </div>
    </div>
  );
}

function StatCard({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="card dash-card" style={{ padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <p style={{ fontSize: 30, fontWeight: 900, color, lineHeight: 1, marginBottom: 4 }}>{value}</p>
      <p style={{ fontSize: 12, color: LGRAY, marginBottom: sub ? 3 : 0 }}>{label}</p>
      {sub && <p style={{ fontSize: 11, color: GRAY, fontWeight: 600 }}>{sub}</p>}
    </div>
  );
}
