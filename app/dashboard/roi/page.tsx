'use client';
import { useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase';
import { Geist, Geist_Mono } from 'next/font/google';

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });
import { getCountryConfig, getRevenueSymbol, type CountryConfig } from '@/lib/countryConfig';
import { usePlan } from '@/lib/usePlan';
import { planMonthlyPrice } from '@/lib/planPrice';
const supabase = getBrowserClient();

const BG     = '#F6F6FB';
const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#E7E7F0';
const BLUE   = '#1B17FF';
const GREEN  = '#12A150';
const AMBER  = '#D97706';
const RED    = '#B4232A';
const GRAY   = '#55556A';
const LGRAY  = '#5F5F78';
const LGREEN = '#DCFCE7';
const PURPLE = '#7C3AED';

const SHARED_STYLE = `
@keyframes fadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.card { animation: fadeInUp 0.4s ease both; }
.dash-card { background: #fff; border: 1.5px solid #E7E7F0; border-radius: 16px; }
.lbl { font-size: 12px; font-weight: 700; color: #5F5F78; text-transform: uppercase; letter-spacing: 0.08em; }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 12px; padding: 14px 24px; font-size: 14px; font-weight: 700; text-decoration: none; cursor: pointer; font-family: inherit; border: none; }
.btn-blue { background: #1B17FF; color: #fff; }
.btn-line { background: #fff; color: #0A0A14; border: 1.5px solid #E7E7F0; }
.btn-ghost { background: transparent; color: #55556A; }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.pagehead { margin-bottom: 28px; }
.pagehead h1 { font-size: 30px; font-weight: 700; }
@media (max-width: 639px) { .pagehead h1 { font-size: 24px; } }
@media (prefers-reduced-motion: reduce) { .card { animation: none; } }
`;


const AI_IMPACT_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  'None':      { color: '#64748B', bg: '#F1F5F9', border: '#CBD5E1' },
  'Low':       { color: '#DC2626', bg: '#FEF2F2', border: '#FCA5A5' },
  'Medium':    { color: '#D97706', bg: '#FFFBEB', border: '#FCD34D' },
  'High':      { color: '#059669', bg: '#ECFDF5', border: '#6EE7B7' },
  'Very High': { color: '#1B17FF', bg: '#ECEBFF', border: '#93C5FD' },
}

interface CategoryResult {
  name: string
  amount: number
  aiImpact: string
  explanation: string
}

interface SpendAnalysis {
  categories: CategoryResult[]
  reallocation: {
    moveAmount: number
    fromCategory: string
    toCategory: string
    expectedImprovementPoints: number
    gapClosedPercent: number
    reasoning: string
  }
  bestHundred: {
    category: string
    action: string
    expectedImpact: string
  }
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function makeFmtDollar(symbol: string) {
  return (n: number) => symbol + fmt(Math.round(n));
}
function fmtPct(n: number) {
  return fmt(Math.round(n)) + '%';
}

interface Scan {
  overall_score: number;
  industry: string | null;
}

export default function ROIPage() {
  const [loaded, setLoaded] = useState(false);
  // b8a6: session + seed-scan attribution. Logged-out visitors used to
  // get the FULL calculator with default numbers (the same view as a
  // signed-in user), and the "Pre-filled from your latest scan" hint
  // showed even when no scan had seeded anything.
  const [signedIn, setSignedIn] = useState(false);
  const [scanMeta, setScanMeta] = useState<{ business: string; date: string } | null>(null);
  const [country, setCountry] = useState<CountryConfig>(getCountryConfig('US'));
  // b8a6: the transaction-value starting default is the country config's
  // average customer value — the same default the scan report's revenue
  // model uses (US $800) — not an unrelated hard-coded 150. It is a
  // starting assumption, labelled as such, and fully editable.
  const [txValue, setTxValue] = useState<string>(String(getCountryConfig('US').avgCustomerValue));
  const [monthlyCustomers, setMonthlyCustomers] = useState<string>('20');
  const [currentScore, setCurrentScore] = useState<string>('40');
  const [targetScore, setTargetScore] = useState<string>('70');
  const { plan, planConfig } = usePlan();
  const [industry, setIndustry] = useState<string>('general');

  // Spend intelligence state
  const [googleAds, setGoogleAds] = useState('');
  const [metaAds, setMetaAds] = useState('');
  const [seoAgency, setSeoAgency] = useState('');
  const [reviewMgmt, setReviewMgmt] = useState('');
  const [directories, setDirectories] = useState('');
  const [otherMarketing, setOtherMarketing] = useState('');
  const [spendLoading, setSpendLoading] = useState(false);
  const [spendAnalysis, setSpendAnalysis] = useState<SpendAnalysis | null>(null);
  const [spendError, setSpendError] = useState('');
  const [spendContext, setSpendContext] = useState<{ score: number; industry: string; city: string; competitor: string | null; total: number } | null>(null);

  const totalSpend = [googleAds, metaAds, seoAgency, reviewMgmt, directories, otherMarketing]
    .reduce((sum, v) => sum + (parseFloat(v) || 0), 0);

  useEffect(() => {
    const match = document.cookie.split('; ').find(r => r.startsWith('rankall_country='));
    const code = match ? match.split('=')[1] : 'US';
    const cfg = getCountryConfig(code);
    setCountry(cfg);
    // b8a6: keep the transaction-value default aligned with the resolved
    // country's average customer value (runs once, before user input).
    setTxValue(String(cfg.avgCustomerValue));

    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoaded(true); return; }
      setSignedIn(true);
      const { data } = await supabase
        .from('rankall_scans')
        .select('overall_score, industry, input, user_business_name, created_at')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (data) {
        // Only prefill from a measured scan score — never invent one.
        if (typeof data.overall_score === 'number') {
          const cur = data.overall_score;
          setCurrentScore(String(cur));
          setTargetScore(String(Math.min(cur + 30, 95)));
        }
        if (data.industry) setIndustry(data.industry);
        // b8a6: remember WHICH scan seeded the score so the page can say so.
        setScanMeta({
          business: (data as any).user_business_name || (data as any).input || '',
          date: (data as any).created_at
            ? new Date((data as any).created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : '',
        });
      }
      setLoaded(true);
    }
    load();
  }, []);

  async function handleAnalyzeSpend() {
    setSpendLoading(true);
    setSpendError('');
    setSpendAnalysis(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Please sign in to analyze your spend.');

      const res = await fetch('/api/intelligence/spend-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          googleAds:        parseFloat(googleAds)        || 0,
          metaAds:          parseFloat(metaAds)          || 0,
          seoAgency:        parseFloat(seoAgency)        || 0,
          reviewManagement: parseFloat(reviewMgmt)       || 0,
          directories:      parseFloat(directories)      || 0,
          otherMarketing:   parseFloat(otherMarketing)   || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Analysis failed');
      setSpendAnalysis(data.analysis as SpendAnalysis);
      setSpendContext(data.context);
    } catch (e) {
      setSpendError(String(e));
    }
    setSpendLoading(false);
  }

  // Annual cost uses this user's actual Rankall plan price (founder pricing),
  // never the Local Pro price for every plan. Plans without a listed price
  // use Local Pro pricing and say so in the explainer below.
  const { monthly: planMonthly, exactPlanPrice } = planMonthlyPrice(plan, country);
  const planCostLabel = exactPlanPrice ? `your ${planConfig.displayName} plan` : 'Local Pro pricing';
  const ANNUAL_COST  = planMonthly * 12;
  const revSym       = getRevenueSymbol(country); // local currency for revenue/spend
  const fmtDollar    = makeFmtDollar(revSym);

  const tx   = Math.max(0, parseFloat(txValue)         || 0);
  const mc   = Math.max(0, parseFloat(monthlyCustomers) || 0);
  const cs   = Math.min(100, Math.max(0, parseFloat(currentScore) || 0));
  const ts   = Math.min(100, Math.max(0, parseFloat(targetScore)  || 0));

  const currentAI    = mc * (cs / 100) * 0.3;
  const projectedAI  = mc * (ts / 100) * 0.3;
  const addlCustomers = Math.max(0, projectedAI - currentAI);
  const addlMonthly  = addlCustomers * tx;
  const addlAnnual   = addlMonthly * 12;
  // b8a6: the old "ROI" was GROSS revenue gain ÷ cost × 100 (692% for a
  // case whose net ROI is 592%) labelled simply "return". Net ROI
  // subtracts the cost: ((gain − cost) ÷ cost) × 100.
  const roi          = ANNUAL_COST > 0 ? ((addlAnnual - ANNUAL_COST) / ANNUAL_COST) * 100 : 0;
  const grossPct     = ANNUAL_COST > 0 ? (addlAnnual / ANNUAL_COST) * 100 : 0;
  const paybackWeeks = addlMonthly > 0 ? Math.ceil(ANNUAL_COST / (addlMonthly / 4.33)) : null;


  const barMax = Math.max(projectedAI, 1);
  const currentBarW  = Math.round((currentAI  / barMax) * 100);
  const projectedBarW = Math.round((projectedAI / barMax) * 100);

  const industries = [
    'general','dentist','restaurant','lawyer','plumber','hvac','medspa',
    'realestate','gym','accountant','chiropractor','veterinarian','autorepair',
    'hotel','electrician','landscaping','photographer','weddingvenue','therapist',
  ];

  if (!loaded) return (
    <div style={{ padding: '48px 32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: GRAY }}>Loading...</p>
    </div>
  );

  // b8a6: signed-out visitors get a sign-in gate — this is a per-account
  // tool seeded from the user's own scan, not a public calculator.
  if (!signedIn) return (
    <div style={{ padding: '32px 32px 80px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '48px 32px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <p style={{ fontSize: 18, fontWeight: 800, color: NAVY, marginBottom: 10 }}>Sign in to use the ROI Calculator</p>
        <p style={{ fontSize: 14, color: GRAY, marginBottom: 24, lineHeight: 1.7 }}>
          The calculator is seeded from your own latest scan — sign in to see your numbers, or run a free scan to get your first score.
        </p>
        <a href="/login?next=/dashboard/roi" style={{ display: 'inline-block', background: BLUE, borderRadius: 10, padding: '13px 28px', fontSize: 14, fontWeight: 700, color: '#fff', textDecoration: 'none' }}>
          Sign in
        </a>
      </div>
    </div>
  );

  const spendFields: Array<{ label: string; value: string; setter: (v: string) => void }> = [
    { label: 'Google Ads',            value: googleAds,      setter: setGoogleAds },
    { label: 'Meta / Facebook Ads',   value: metaAds,        setter: setMetaAds },
    { label: 'SEO Agency',            value: seoAgency,      setter: setSeoAgency },
    { label: 'Review Management',     value: reviewMgmt,     setter: setReviewMgmt },
    { label: 'Directory Listings',    value: directories,    setter: setDirectories },
    { label: 'Other Marketing',       value: otherMarketing, setter: setOtherMarketing },
  ];

  return (
    <div className={`${geistSans.variable} ${geistMono.variable}`} style={{ padding: '32px 32px 80px', maxWidth: 960, margin: '0 auto', fontFamily: 'var(--font-geist-sans), system-ui, sans-serif' }}>
      <style>{SHARED_STYLE}</style>

      {/* ══ MARKETING SPEND INTELLIGENCE ══ */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 6 }}><svg viewBox="0 0 512 512" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M32 32c17.7 0 32 14.3 32 32l0 336c0 8.8 7.2 16 16 16l400 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L80 480c-44.2 0-80-35.8-80-80L0 64C0 46.3 14.3 32 32 32zM160 224c17.7 0 32 14.3 32 32l0 64c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32zm128-64l0 160c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-160c0-17.7 14.3-32 32-32s32 14.3 32 32zm64 32c17.7 0 32 14.3 32 32l0 96c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-96c0-17.7 14.3-32 32-32zM480 96l0 224c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-224c0-17.7 14.3-32 32-32s32 14.3 32 32z"/></svg> Marketing Spend Intelligence</h2>
          <p style={{ fontSize: 14, color: GRAY }}>See how your current marketing spend maps to AI recommendation visibility — and where to reallocate for maximum impact.</p>
        </div>

        <div className="card dash-card" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '28px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 20 }}>Monthly Spend</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
            {spendFields.map(f => (
              <div key={f.label}>
                <label style={{ fontSize: 12, fontWeight: 700, color: NAVY, display: 'block', marginBottom: 5 }}>{f.label}</label>
                <div style={{ display: 'flex', alignItems: 'center', border: `1.5px solid ${BORDER}`, borderRadius: 10, background: BG, overflow: 'hidden' }}>
                  <span style={{ padding: '0 10px', fontSize: 13, color: GRAY, borderRight: `1px solid ${BORDER}`, height: '100%', display: 'flex', alignItems: 'center', background: '#F1F5F9' }}>{revSym}</span>
                  <input
                    type="number"
                    value={f.value}
                    onChange={e => f.setter(e.target.value)}
                    placeholder="0"
                    min="0"
                    style={{ flex: 1, border: 'none', padding: '10px 12px', fontSize: 14, color: NAVY, fontFamily: 'inherit', background: 'transparent', outline: 'none' }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Total */}
          <div style={{ background: totalSpend > 0 ? '#ECEBFF' : BG, border: `1.5px solid ${totalSpend > 0 ? '#C9C6FF' : BORDER}`, borderRadius: 12, padding: '14px 18px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>Total Monthly Spend</span>
            <span style={{ fontSize: 22, fontWeight: 900, color: totalSpend > 0 ? BLUE : LGRAY }}>{revSym}{fmt(Math.round(totalSpend))}/mo</span>
          </div>

          <button
            className="btn"
            onClick={handleAnalyzeSpend}
            disabled={spendLoading || totalSpend === 0}
            style={{ width: '100%', background: spendLoading || totalSpend === 0 ? GRAY : NAVY, border: 'none', borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 700, color: '#fff', cursor: spendLoading || totalSpend === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            {spendLoading ? (
              <>
                <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                Analyzing with Claude Opus...
              </>
            ) : (
              (<>Analyze My Spend <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>)
            )}
          </button>
          {spendError && <p style={{ fontSize: 13, color: RED, marginTop: 10 }}>{spendError}</p>}
        </div>

        {/* ── RESULTS ── */}
        {spendAnalysis && spendContext && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* SPEND BREAKDOWN */}
            <div className="card dash-card" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '24px 28px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Spend Breakdown</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {(spendAnalysis.categories ?? [])
                  .filter(c => c.amount > 0)
                  .map((cat, i) => {
                    const cfg = AI_IMPACT_CONFIG[cat.aiImpact] ?? AI_IMPACT_CONFIG['None'];
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 16px', background: BG, borderRadius: 12, border: `1px solid ${BORDER}` }}>
                        <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 72 }}>
                          <p style={{ fontSize: 16, fontWeight: 800, color: NAVY, margin: 0 }}>{revSym}{fmt(cat.amount)}</p>
                          <p style={{ fontSize: 10, color: LGRAY, margin: 0 }}>/month</p>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{cat.name}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 100, padding: '2px 8px', whiteSpace: 'nowrap' }}>
                              {cat.aiImpact} AI Impact
                            </span>
                          </div>
                          <p style={{ fontSize: 13, color: GRAY, margin: 0, lineHeight: 1.5 }}>{cat.explanation}</p>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* REALLOCATION RECOMMENDATION */}
            {spendAnalysis.reallocation && (
              <div style={{ background: '#0A0A14', borderRadius: 16, padding: '24px 28px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#93C5FD', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Reallocation Recommendation</p>

                <div style={{ background: 'rgba(27,23,255,0.15)', border: '1.5px solid rgba(27,23,255,0.4)', borderRadius: 12, padding: '16px 20px', marginBottom: 16, textAlign: 'center' }}>
                  <p style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF', lineHeight: 1.3, margin: 0 }}>
                    Move <span style={{ color: '#8D8BFF' }}>{revSym}{fmt(spendAnalysis.reallocation.moveAmount)}/month</span> from <span style={{ color: '#FCA5A5' }}>{spendAnalysis.reallocation.fromCategory}</span> to <span style={{ color: '#6EE7B7' }}>{spendAnalysis.reallocation.toCategory}</span>
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
                  <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                    <p style={{ fontSize: 22, fontWeight: 900, color: '#22C55E', margin: 0 }}>+{spendAnalysis.reallocation.expectedImprovementPoints}</p>
                    <p style={{ fontSize: 11, color: '#94A3B8', margin: 0 }}>expected AI score points</p>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                    <p style={{ fontSize: 22, fontWeight: 900, color: '#8D8BFF', margin: 0 }}>{spendAnalysis.reallocation.gapClosedPercent}%</p>
                    <p style={{ fontSize: 11, color: '#94A3B8', margin: 0 }}>of gap with {spendContext.competitor ?? 'competitor'} closed</p>
                  </div>
                </div>

                <p style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.7, margin: 0 }}>{spendAnalysis.reallocation.reasoning}</p>
              </div>
            )}

            {/* HIGHEST IMPACT $100 */}
            {spendAnalysis.bestHundred && (
              <div className="card dash-card" style={{ background: W, border: `1.5px solid #C9C6FF`, borderRadius: 16, padding: '24px 28px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <div style={{ width: 36, height: 36, background: '#ECEBFF', border: '1.5px solid #C9C6FF', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}><svg viewBox="0 0 384 512" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M272 384c9.6-31.9 29.5-59.1 49.2-86.2c0 0 0 0 0 0c5.2-7.1 10.4-14.2 15.4-21.4c19.8-28.5 31.4-63 31.4-100.3C368 78.8 289.2 0 192 0S16 78.8 16 176c0 37.3 11.6 71.9 31.4 100.3c5 7.2 10.2 14.3 15.4 21.4c0 0 0 0 0 0c19.8 27.1 39.7 54.4 49.2 86.2l160 0zM192 512c44.2 0 80-35.8 80-80l0-16-160 0 0 16c0 44.2 35.8 80 80 80zM112 176c0 8.8-7.2 16-16 16s-16-7.2-16-16c0-61.9 50.1-112 112-112c8.8 0 16 7.2 16 16s-7.2 16-16 16c-44.2 0-80 35.8-80 80z"/></svg></div>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Highest Impact Investment</p>
                    <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: 0 }}>Your best {revSym}100/month AI investment</p>
                  </div>
                </div>
                <div style={{ background: BG, borderRadius: 12, padding: '16px 18px', marginBottom: 12 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: BLUE, marginBottom: 4 }}>{spendAnalysis.bestHundred.category}</p>
                  <p style={{ fontSize: 14, color: NAVY, fontWeight: 600, marginBottom: 8 }}>{spendAnalysis.bestHundred.action}</p>
                  <p style={{ fontSize: 13, color: GRAY, lineHeight: 1.6, margin: 0 }}>{spendAnalysis.bestHundred.expectedImpact}</p>
                </div>
                <a
                  className="btn btn-blue"
                  href="/dashboard/fix"
                  style={{ display: 'inline-block', background: BLUE, borderRadius: 10, padding: '10px 22px', fontSize: 13, fontWeight: 700, color: '#fff', textDecoration: 'none' }}
                >
                  View Fix Queue <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
              </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}
      </div>

      {/* ══ DIVIDER ══ */}
      <div style={{ borderTop: `2px solid ${BORDER}`, marginBottom: 36 }} />

      {/* ══ ROI CALCULATOR (existing) ══ */}
      <div className="pagehead">
        <h1 style={{ fontSize: 30, fontWeight: 700, color: NAVY, marginBottom: 6 }}><svg viewBox="0 0 512 512" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M320 96L192 96 144.6 24.9C137.5 14.2 145.1 0 157.9 0L354.1 0c12.8 0 20.4 14.2 13.3 24.9L320 96zM192 128l128 0c3.8 2.5 8.1 5.3 13 8.4C389.7 172.7 512 250.9 512 416c0 53-43 96-96 96L96 512c-53 0-96-43-96-96C0 250.9 122.3 172.7 179 136.4c0 0 0 0 0 0s0 0 0 0c4.8-3.1 9.2-5.9 13-8.4zm84 88c0-11-9-20-20-20s-20 9-20 20l0 14c-7.6 1.7-15.2 4.4-22.2 8.5c-13.9 8.3-25.9 22.8-25.8 43.9c.1 20.3 12 33.1 24.7 40.7c11 6.6 24.7 10.8 35.6 14l1.7 .5c12.6 3.8 21.8 6.8 28 10.7c5.1 3.2 5.8 5.4 5.9 8.2c.1 5-1.8 8-5.9 10.5c-5 3.1-12.9 5-21.4 4.7c-11.1-.4-21.5-3.9-35.1-8.5c-2.3-.8-4.7-1.6-7.2-2.4c-10.5-3.5-21.8 2.2-25.3 12.6s2.2 21.8 12.6 25.3c1.9 .6 4 1.3 6.1 2.1c0 0 0 0 0 0s0 0 0 0c8.3 2.9 17.9 6.2 28.2 8.4l0 14.6c0 11 9 20 20 20s20-9 20-20l0-13.8c8-1.7 16-4.5 23.2-9c14.3-8.9 25.1-24.1 24.8-45c-.3-20.3-11.7-33.4-24.6-41.6c-11.5-7.2-25.9-11.6-37.1-15c0 0 0 0 0 0l-.7-.2c-12.8-3.9-21.9-6.7-28.3-10.5c-5.2-3.1-5.3-4.9-5.3-6.7c0-3.7 1.4-6.5 6.2-9.3c5.4-3.2 13.6-5.1 21.5-5c9.6 .1 20.2 2.2 31.2 5.2c10.7 2.8 21.6-3.5 24.5-14.2s-3.5-21.6-14.2-24.5c-6.5-1.7-13.7-3.4-21.1-4.7l0-13.9z"/></svg> ROI Calculator</h1>
        <p style={{ fontSize: 14, color: GRAY }}>See the business impact of improving your AI visibility score — calculated live as you type.</p>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 20, alignItems: 'start' }}>

        {/* ── LEFT: Inputs ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card dash-card" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '24px 28px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 20 }}>Your Numbers</p>

            <Field label="Average transaction / customer value" prefix={revSym} value={txValue} onChange={setTxValue} placeholder={String(country.avgCustomerValue)} hint="Starts at Rankall's default estimate for your market (the same default your scan report uses) — replace it with your real average revenue per new customer" />
            <Field label="Monthly new customers from online search" value={monthlyCustomers} onChange={setMonthlyCustomers} placeholder="20" hint="Starting default — replace it with how many new customers you actually get from search each month" />
            <Field label="Current AI visibility score" suffix="/100" value={currentScore} onChange={setCurrentScore} placeholder="40" hint={scanMeta ? `Pre-filled from your latest scan: ${scanMeta.business}${scanMeta.date ? ` — ${scanMeta.date}` : ''}` : 'No scan yet — run a scan to pre-fill your measured score'} />
            <Field label="Target AI visibility score" suffix="/100" value={targetScore} onChange={setTargetScore} placeholder="70" hint="Starting goal: your current score + 30 when pre-filled — an editable goal, not a projection. Your report's fix-based projection is the measured estimate" />

            <div style={{ marginTop: 4 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: NAVY, display: 'block', marginBottom: 6 }}>Industry</label>
              <select
                value={industry}
                onChange={e => setIndustry(e.target.value)}
                style={{ width: '100%', border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, color: NAVY, fontFamily: 'inherit', background: BG, outline: 'none' }}
              >
                {industries.map(ind => (
                  <option key={ind} value={ind}>{ind.charAt(0).toUpperCase() + ind.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Item 12: the per-industry "30→70 = +34% bookings" lines were
              invented. No measured outcome data is quoted here. */}
          <div style={{ background: '#ECEBFF', border: '1.5px solid #C9C6FF', borderRadius: 14, padding: '16px 20px' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>About these numbers</p>
            <p style={{ fontSize: 13, color: '#1E40AF', lineHeight: 1.6 }}>This calculator multiplies the inputs you enter. Rankall doesn&apos;t quote industry-wide outcome percentages — your verified before/after rescans are the measured results.</p>
          </div>
        </div>

        {/* ── RIGHT: Results ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Big result cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(140px, 100%), 1fr))', gap: 12 }}>
            <ResultCard label="Additional customers / mo" value={`+${fmt(Math.round(addlCustomers * 10) / 10)}`} color={GREEN} sub={addlCustomers === 0 ? 'increase your target score' : undefined} />
            <ResultCard label="Additional monthly revenue" value={fmtDollar(addlMonthly)} color={addlMonthly > 0 ? GREEN : GRAY} />
            <ResultCard label="Additional annual revenue" value={fmtDollar(addlAnnual)} color={addlAnnual > 0 ? GREEN : GRAY} large />
            <ResultCard label="Net ROI on Rankall" value={addlAnnual > 0 ? fmtPct(roi) : '—'} color={roi >= 100 ? GREEN : roi > 0 ? AMBER : GRAY} sub={addlAnnual > 0 ? `net of your ${country.symbol}${fmt(ANNUAL_COST)}/yr plan cost · gross revenue gain = ${fmtPct(grossPct)} of cost` : undefined} />
          </div>

          {paybackWeeks !== null && (
            <div style={{ background: LGREEN, border: `1.5px solid #86EFAC`, borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 28 }}><svg viewBox="0 0 448 512" width="28" height="28" fill="currentColor" aria-hidden="true"><path d="M349.4 44.6c5.9-13.7 1.5-29.7-10.6-38.5s-28.6-8-39.9 1.8l-256 224c-10 8.8-13.6 22.9-8.9 35.3S50.7 288 64 288l111.5 0L98.6 467.4c-5.9 13.7-1.5 29.7 10.6 38.5s28.6 8 39.9-1.8l256-224c10-8.8 13.6-22.9 8.9-35.3s-16.6-20.7-30-20.7l-111.5 0L349.4 44.6z"/></svg></span>
              <div>
                <p style={{ fontSize: 20, fontWeight: 900, color: GREEN, lineHeight: 1, marginBottom: 2 }}>{paybackWeeks} {paybackWeeks === 1 ? 'week' : 'weeks'}</p>
                <p style={{ fontSize: 12, color: '#166534' }}>to pay back your annual Rankall subscription</p>
              </div>
            </div>
          )}

          {/* Bar chart */}
          <div className="card dash-card" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '20px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>AI-Driven Customers / Month</p>
            <BarRow label={`Current (score ${Math.round(cs)})`} value={currentAI} widthPct={currentBarW} color={GRAY} max={barMax} />
            <BarRow label={`Projected (score ${Math.round(ts)})`} value={projectedAI} widthPct={projectedBarW} color={GREEN} max={barMax} />
          </div>

          {/* How we calculate */}
          <details className="card dash-card" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '14px 20px', fontSize: 13, color: GRAY, cursor: 'pointer' }}>
            <summary style={{ fontWeight: 700, color: NAVY, fontSize: 13 }}>How is this calculated?</summary>
            <div style={{ marginTop: 12, lineHeight: 1.8 }}>
              <p>AI-driven customers = monthly search customers × (score ÷ 100) × 30%</p>
              <p>The 30% factor is this calculator&apos;s assumption for the share of searches answered directly by AI assistants — an assumption, not a measured Rankall statistic.</p>
              <p>Net ROI = ((annual revenue gain − {country.symbol}{fmt(ANNUAL_COST)} annual cost) ÷ annual cost) × 100</p>
              <p>Payback = weeks to recover the annual subscription cost from new revenue.</p>
              <p>Annual cost uses {planCostLabel} ({country.symbol}{fmt(planMonthly)}/mo).</p>
              <p><strong>Why this differs from your scan report:</strong> this page is a simple what-if model driven by the numbers you type. Your report uses the scan&apos;s own revenue model (mention-rate gap × AI inquiries × customer value × 10% conversion), so its dollar figures will differ — the report&apos;s are the ones tied to your measured scan.</p>
            </div>
          </details>
        </div>
      </div>

      {/* CTA */}
      <div style={{ marginTop: 28, background: NAVY, borderRadius: 18, padding: '28px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <p style={{ fontSize: 17, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
            {addlAnnual > 0 ? `You could earn ${fmtDollar(addlAnnual)} more per year` : 'Start improving your AI visibility score'}
          </p>
          <p style={{ fontSize: 13, color: LGRAY }}>Apply the top fixes to reach your target score and capture more AI-driven customers.</p>
        </div>
        <a href="/dashboard/fix" className="btn btn-blue" style={{ background: BLUE, borderRadius: 12, padding: '14px 24px', fontSize: 14, fontWeight: 700, color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap' }}>
          View Fix Queue <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

function Field({ label, value, onChange, placeholder, prefix, suffix, hint }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; prefix?: string; suffix?: string; hint?: string;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 13, fontWeight: 700, color: NAVY, display: 'block', marginBottom: 5 }}>{label}</label>
      {hint && <p style={{ fontSize: 11, color: LGRAY, marginBottom: 5 }}>{hint}</p>}
      <div style={{ display: 'flex', alignItems: 'center', border: `1.5px solid ${BORDER}`, borderRadius: 10, background: BG, overflow: 'hidden' }}>
        {prefix && <span style={{ padding: '0 10px', fontSize: 14, color: GRAY, borderRight: `1px solid ${BORDER}`, height: '100%', display: 'flex', alignItems: 'center', background: '#F1F5F9' }}>{prefix}</span>}
        <input
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ flex: 1, border: 'none', padding: '10px 12px', fontSize: 14, color: NAVY, fontFamily: 'inherit', background: 'transparent', outline: 'none' }}
        />
        {suffix && <span style={{ padding: '0 10px', fontSize: 13, color: GRAY, borderLeft: `1px solid ${BORDER}`, height: '100%', display: 'flex', alignItems: 'center', background: '#F1F5F9' }}>{suffix}</span>}
      </div>
    </div>
  );
}

function ResultCard({ label, value, color, sub, large }: {
  label: string; value: string; color: string; sub?: string; large?: boolean;
}) {
  return (
    <div className="card dash-card" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <p style={{ fontSize: large ? 32 : 26, fontWeight: 900, color, lineHeight: 1, marginBottom: 4 }}>{value}</p>
      <p style={{ fontSize: 12, color: LGRAY, marginBottom: sub ? 4 : 0 }}>{label}</p>
      {sub && <p style={{ fontSize: 11, color, fontWeight: 600 }}>{sub}</p>}
    </div>
  );
}

function BarRow({ label, value, widthPct, color, max }: {
  label: string; value: number; widthPct: number; color: string; max: number;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: GRAY, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{(Math.round(value * 10) / 10).toFixed(1)} customers</span>
      </div>
      <div style={{ height: 10, background: BORDER, borderRadius: 100, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.max(widthPct, value > 0 ? 3 : 0)}%`, background: color, borderRadius: 100, transition: 'width 0.3s ease' }} />
      </div>
    </div>
  );
}

