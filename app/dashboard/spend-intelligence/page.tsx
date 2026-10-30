'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getBrowserClient } from '@/lib/supabase';
import { getCountryConfig, getRevenueSymbol, getAvgCustomerValue, type CountryConfig } from '@/lib/countryConfig';
import { usePlan } from '@/lib/usePlan';
import { getPlanConfig } from '@/lib/planConfig';
import { planMonthlyPrice } from '@/lib/planPrice';

const BG     = '#F8FAFC';
const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#E2E8F0';
const BLUE   = '#1B17FF';
const GREEN  = '#059669';
const PURPLE = '#1B17FF';
const GRAY   = '#64748B';
const LGRAY  = '#94A3B8';

function fmt(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

// b8ac: budget-allocation math, extracted so it is unit-testable. The old
// inline version clamped unallocated at 0 (Math.max(0, total - allocated)),
// so Ads $2,500 + SEO $800 against a $3,000 total showed "$0 unallocated"
// at 110% allocated — hiding $300 of overspend. Over-budget is now named.
export function budgetAllocation(budget: number, seo: number, total: number) {
  const allocated = budget + seo;
  const overBudget = allocated - total; // > 0 when Ads+SEO exceed the stated total
  const unallocated = Math.max(0, total - allocated);
  const allocatedPct = total > 0 ? Math.round((allocated / total) * 100) : 0;
  return { allocated, overBudget, unallocated, allocatedPct };
}

function Breadcrumb({ page }: { page: string }) {
  return (
    <nav style={{ fontSize: 13, color: GRAY, marginBottom: 20 }}>
      <Link href="/dashboard" style={{ color: BLUE, textDecoration: 'none', fontWeight: 600 }}>Dashboard</Link>
      <span style={{ margin: '0 8px', color: LGRAY }}>›</span>
      <span>{page}</span>
    </nav>
  );
}

export default function SpendIntelligencePage() {
  const [loaded, setLoaded]   = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [country, setCountry] = useState<CountryConfig>(getCountryConfig('US'));
  const [score, setScore]     = useState(0);
  const [industry, setIndustry] = useState('general');

  const [googleAds, setGoogleAds] = useState('1500');
  const [seoSpend, setSeoSpend]   = useState('800');
  const [totalBudget, setTotalBudget] = useState('3000');
  // Assumed cost per lead — a user-editable assumption, not a measured fact.
  const [cpl, setCpl] = useState('50');
  // b8ac: rawPlan (the user's REAL plan), not the admin-upgraded plan —
  // the AI Organic price must reflect what this account would actually
  // pay, never an admin 'enterprise' upgrade.
  const { rawPlan } = usePlan();
  // b8ac: whether the account has a scan yet — drives the honest empty
  // state for the AI section (S2) instead of a "0/100" sample.
  const [hasScan, setHasScan] = useState(false);
  const [scanDate, setScanDate] = useState<string | null>(null);
  const [scanInput, setScanInput] = useState('');

  useEffect(() => {
    const match = document.cookie.split('; ').find(r => r.startsWith('rankall_country='));
    const code = match ? match.split('=')[1] : 'US';
    setCountry(getCountryConfig(code));

    async function load() {
      try {
        const supabase = getBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setLoaded(true); return; }
        setSignedIn(true);
        const { data } = await supabase
          .from('rankall_scans')
          .select('overall_score, industry, created_at, input')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) {
          setHasScan(true);
          setScore(data.overall_score ?? 0);
          if (data.industry) setIndustry(data.industry);
          if ((data as any).created_at) setScanDate(String((data as any).created_at));
          if ((data as any).input) setScanInput(String((data as any).input));
        }
      } catch { /* graceful */ }
      setLoaded(true);
    }
    load();
  }, []);

  const revSym = getRevenueSymbol(country);
  const avgValue = getAvgCustomerValue(industry, country.code);

  const budget   = Math.max(0, parseFloat(googleAds) || 0);
  // ax8r: SEO spend + total budget used to be dead inputs — entered but
  // never read by any calculation. They now drive the budget-allocation
  // line under the spend inputs (Ads + SEO vs the stated total).
  const seo = Math.max(0, parseFloat(seoSpend) || 0);
  const total = Math.max(0, parseFloat(totalBudget) || 0);
  const { allocated, overBudget, unallocated, allocatedPct } = budgetAllocation(budget, seo, total);
  const organicRecs = Math.round((score / 100) * country.monthlyAIInquiries);
  const organicValue = organicRecs * avgValue;

  const cplNum = Math.max(1, parseFloat(cpl) || 50);
  const paidLeads = Math.round(budget / cplNum);
  const aiWins = organicRecs >= paidLeads;

  // AI Organic cost = this account's REAL plan price (rawPlan — never the
  // admin-upgraded plan), from founder pricing. Plans without a listed
  // price fall back to Local Pro pricing, labelled as such.
  const { monthly: aiMonthly, exactPlanPrice } = planMonthlyPrice(rawPlan, country);
  const aiPlanLabel = exactPlanPrice ? `${getPlanConfig(rawPlan).displayName} plan` : 'Local Pro pricing';

  if (!loaded) return (
    <div style={{ padding: '48px 32px', textAlign: 'center', color: GRAY }}>Loading…</div>
  );

  // b8ac: signed-out visitors get the gate, not the full calculator shell
  // (the 21st no-redirect dashboard route). Same pattern as the other
  // dashboard pages.
  if (!signedIn) return (
    <div style={{ padding: '48px 32px', maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
      <p style={{ fontSize: 20, fontWeight: 800, color: NAVY, marginBottom: 10 }}>Sign in to use Spend Intelligence.</p>
      <p style={{ fontSize: 14, color: GRAY, marginBottom: 24, lineHeight: 1.7 }}>
        Compare your paid marketing spend against your real AI visibility score. Sign in to see it, or run a free scan to get your first score.
      </p>
      <Link href="/login?next=/dashboard/spend-intelligence" style={{ display: 'inline-block', background: PURPLE, color: 'white', padding: '10px 20px', borderRadius: 8, textDecoration: 'none', fontWeight: 700 }}>Sign in</Link>
    </div>
  );

  return (
    <div style={{ padding: '32px 32px 80px', maxWidth: 960, margin: '0 auto' }}>
      <Breadcrumb page="Spend Intelligence" />

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 6 }}><svg viewBox="0 0 512 512" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M32 32c17.7 0 32 14.3 32 32l0 336c0 8.8 7.2 16 16 16l400 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L80 480c-44.2 0-80-35.8-80-80L0 64C0 46.3 14.3 32 32 32zM160 224c17.7 0 32 14.3 32 32l0 64c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32zm128-64l0 160c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-160c0-17.7 14.3-32 32-32s32 14.3 32 32zm64 32c17.7 0 32 14.3 32 32l0 96c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-96c0-17.7 14.3-32 32-32zM480 96l0 224c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-224c0-17.7 14.3-32 32-32s32 14.3 32 32z"/></svg> Marketing Spend Intelligence</h1>
        <p style={{ fontSize: 14, color: GRAY }}>Compare paid vs AI visibility ROI — see what your marketing budget really buys.</p>
      </div>



      {/* YOUR CURRENT SPEND */}
      <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '24px 28px', marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Your Current Spend</p>
        <p style={{ fontSize: 12, color: GRAY, marginBottom: 18 }}>Your estimates — the fields start with defaults, but the comparison is only meaningful with your real numbers.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          <NumField label="Monthly Google Ads budget" prefix={revSym} value={googleAds} onChange={setGoogleAds} />
          <NumField label="Monthly SEO spend" prefix={revSym} value={seoSpend} onChange={setSeoSpend} />
          <NumField label="Total marketing budget" prefix={revSym} value={totalBudget} onChange={setTotalBudget} />
          <NumField label="Assumed cost per lead" prefix={revSym} value={cpl} onChange={setCpl} />
        </div>
        <p style={{ fontSize: 13, color: GRAY, marginTop: 14 }}>
          Ads ({revSym}{fmt(budget)}) + SEO ({revSym}{fmt(seo)}) = {revSym}{fmt(allocated)} of your {revSym}{fmt(total)} total budget
          {total > 0 ? ` (${allocatedPct}% allocated, ${overBudget > 0 ? `${revSym}${fmt(overBudget)} over budget` : `${revSym}${fmt(unallocated)} unallocated`})` : ''}.
        </p>
      </div>

      {/* AI VISIBILITY ROI */}
      <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '24px 28px', marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>AI Visibility ROI</p>
        {hasScan && scanDate && (
          <p style={{ fontSize: 12, color: GRAY, marginBottom: 18 }}>
            Your AI score below is from your scan{scanInput ? <> of &ldquo;{scanInput}&rdquo;</> : null} on {new Date(scanDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.
          </p>
        )}
        {hasScan ? (<>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          <Stat label="Your AI score" value={`${score}/100`} color={PURPLE} />
          <Stat label="Organic AI recommendations / mo" value={fmt(organicRecs)} color={BLUE} />
          <Stat label="Avg customer value (est.)" value={`${revSym}${fmt(avgValue)}`} color={NAVY} />
          <Stat label="Estimated organic revenue / mo" value={`${revSym}${fmt(organicValue)}`} color={GREEN} large />
        </div>
        <p style={{ fontSize: 12, color: LGRAY, marginTop: 14 }}>
          organicRecs = score/100 × {country.monthlyAIInquiries} monthly AI inquiries ({country.code}); revenue = recommendations × avg customer value.
          Avg customer value ({revSym}{fmt(avgValue)}) is Rankall&apos;s {country.code} default{industry !== 'general' ? ` for ${industry}` : ''} — an assumption, not a measured value.
        </p>
        </>) : (
          <p style={{ fontSize: 13, color: GRAY, lineHeight: 1.7 }}>
            No scan yet — run a scan to see your real AI visibility score, organic recommendations, and revenue estimate here. Your spend estimates above still work for planning.
          </p>
        )}
      </div>

      {/* THE COMPARISON */}
      <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '24px 28px', marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 18 }}>The Comparison</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ background: aiWins ? BG : '#ECEBFF', border: `1.5px solid ${aiWins ? BORDER : '#C9C6FF'}`, borderRadius: 14, padding: '20px' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: GRAY, textTransform: 'uppercase', marginBottom: 8 }}>Paid Ads</p>
            <p style={{ fontSize: 28, fontWeight: 900, color: NAVY, lineHeight: 1, marginBottom: 4 }}>{fmt(paidLeads)} leads</p>
            <p style={{ fontSize: 13, color: GRAY }}>{revSym}{fmt(budget)}/mo at your assumed {revSym}{fmt(cplNum)} cost-per-lead</p>
          </div>
          <div style={{ background: aiWins ? '#ECFDF5' : BG, border: `1.5px solid ${aiWins ? '#A7F3D0' : BORDER}`, borderRadius: 14, padding: '20px' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: GREEN, textTransform: 'uppercase', marginBottom: 8 }}>AI Organic</p>
            <p style={{ fontSize: 28, fontWeight: 900, color: GREEN, lineHeight: 1, marginBottom: 4 }}>{fmt(organicRecs)} leads</p>
            <p style={{ fontSize: 13, color: GRAY }}>~{country.symbol}{aiMonthly}/mo flat ({aiPlanLabel}), no per-lead cost</p>
          </div>
        </div>
        <div style={{ marginTop: 16, background: aiWins ? '#ECFDF5' : '#ECEBFF', border: `1.5px solid ${aiWins ? '#A7F3D0' : '#C9C6FF'}`, borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>{aiWins ? <svg viewBox="0 0 576 512" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M400 0L176 0c-26.5 0-48.1 21.8-47.1 48.2c.2 5.3 .4 10.6 .7 15.8L24 64C10.7 64 0 74.7 0 88c0 92.6 33.5 157 78.5 200.7c44.3 43.1 98.3 64.8 138.1 75.8c23.4 6.5 39.4 26 39.4 45.6c0 20.9-17 37.9-37.9 37.9L192 448c-17.7 0-32 14.3-32 32s14.3 32 32 32l192 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-26.1 0C337 448 320 431 320 410.1c0-19.6 15.9-39.2 39.4-45.6c39.9-11 93.9-32.7 138.2-75.8C542.5 245 576 180.6 576 88c0-13.3-10.7-24-24-24L446.4 64c.3-5.2 .5-10.4 .7-15.8C448.1 21.8 426.5 0 400 0zM48.9 112l84.4 0c9.1 90.1 29.2 150.3 51.9 190.6c-24.9-11-50.8-26.5-73.2-48.3c-32-31.1-58-76-63-142.3zM464.1 254.3c-22.4 21.8-48.3 37.3-73.2 48.3c22.7-40.3 42.8-100.5 51.9-190.6l84.4 0c-5.1 66.3-31.1 111.2-63 142.3z"/></svg> : <svg viewBox="0 0 640 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M384 32l128 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L398.4 96c-5.2 25.8-22.9 47.1-46.4 57.3L352 448l160 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-192 0-192 0c-17.7 0-32-14.3-32-32s14.3-32 32-32l160 0 0-294.7c-23.5-10.3-41.2-31.6-46.4-57.3L128 96c-17.7 0-32-14.3-32-32s14.3-32 32-32l128 0c14.6-19.4 37.8-32 64-32s49.4 12.6 64 32zm55.6 288l144.9 0L512 195.8 439.6 320zM512 416c-62.9 0-115.2-34-126-78.9c-2.6-11 1-22.3 6.7-32.1l95.2-163.2c5-8.6 14.2-13.8 24.1-13.8s19.1 5.3 24.1 13.8l95.2 163.2c5.7 9.8 9.3 21.1 6.7 32.1C627.2 382 574.9 416 512 416zM126.8 195.8L54.4 320l144.9 0L126.8 195.8zM.9 337.1c-2.6-11 1-22.3 6.7-32.1l95.2-163.2c5-8.6 14.2-13.8 24.1-13.8s19.1 5.3 24.1 13.8l95.2 163.2c5.7 9.8 9.3 21.1 6.7 32.1C242 382 189.7 416 126.8 416S11.7 382 .9 337.1z"/></svg>}</span>
          <p style={{ fontSize: 14, fontWeight: 700, color: aiWins ? GREEN : BLUE }}>
            {aiWins
              ? `AI Organic wins — it delivers ${fmt(organicRecs)} recommendations vs ${fmt(paidLeads)} paid leads, at a fraction of the cost.`
              : `Paid ads currently lead on volume — but raising your AI score closes the gap with no per-lead cost.`}
          </p>
        </div>
        <p style={{ fontSize: 12, color: LGRAY, marginTop: 14 }}>
          Estimates from your inputs and stated assumptions (assumed cost-per-lead, score × monthly AI inquiries). Not measured results.
        </p>
      </div>

      {/* CTA */}
      <div style={{ background: NAVY, borderRadius: 18, padding: '28px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <p style={{ fontSize: 17, fontWeight: 800, color: '#fff', marginBottom: 4 }}>Reduce your paid ad dependency</p>
          <p style={{ fontSize: 13, color: LGRAY }}>Every point of AI score is organic, compounding visibility you don't pay per click for.</p>
        </div>
        <Link href="/dashboard/fix" style={{ background: BLUE, borderRadius: 12, padding: '14px 24px', fontSize: 14, fontWeight: 700, color: '#fff', textDecoration: 'none', maxWidth: '100%', textAlign: 'center' }}>
          Improve your AI score to reduce paid ad dependency <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
      </div>
    </div>
  );
}

function NumField({ label, prefix, value, onChange }: { label: string; prefix: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 700, color: NAVY, display: 'block', marginBottom: 5 }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', border: `1.5px solid ${BORDER}`, borderRadius: 10, background: BG, overflow: 'hidden' }}>
        <span style={{ padding: '0 10px', fontSize: 13, color: GRAY, borderRight: `1px solid ${BORDER}`, background: '#F1F5F9', alignSelf: 'stretch', display: 'flex', alignItems: 'center' }}>{prefix}</span>
        <input type="number" min="0" value={value} onChange={e => onChange(e.target.value)} placeholder="0"
          style={{ flex: 1, border: 'none', padding: '10px 12px', fontSize: 14, color: NAVY, fontFamily: 'inherit', background: 'transparent', outline: 'none' }} />
      </div>
    </div>
  );
}

function Stat({ label, value, color, large }: { label: string; value: string; color: string; large?: boolean }) {
  return (
    <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '16px 18px' }}>
      <p style={{ fontSize: large ? 26 : 22, fontWeight: 900, color, lineHeight: 1, marginBottom: 4 }}>{value}</p>
      <p style={{ fontSize: 12, color: LGRAY }}>{label}</p>
    </div>
  );
}
