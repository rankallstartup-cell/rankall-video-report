'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { getBrowserClient } from '@/lib/supabase';
import { calculateSimulation, type SimulatorFix, type SimulatorOutput } from '@/lib/simulator';
import { PROPOSAL_FEE_SYMBOL } from '@/lib/proposalCurrency';
import { Geist, Geist_Mono } from 'next/font/google';
const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });
import { usePlan } from '@/lib/usePlan';
import { isAgencyPlan } from '@/lib/planConfig';
import { PlanGuard } from '@/components/PlanGuard';

// ── b35t: b35q design tokens (Overview v2 mockup) on staging logic ──
const BG     = '#F6F6FB';
const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#E7E7F0';
const BLUE   = '#1B17FF';
const PURPLE = '#7C3AED'; // agency accent — projections (unchanged value)
const GREEN  = '#12A150';
const RED    = '#B4232A';
const RED_X  = '#D92D20';
const RED_BG = '#FDECEC';
const GRAY   = '#55556A';
const LGRAY  = '#94A3B8';
const MUTED  = '#5F5F78';
const TINT_BORDER = '#DCDAFF';
const FIX_BG = '#F4F3FF';

const DEFAULT_FIXES: SimulatorFix[] = [
  { id: 'faq_schema',           title: 'Add FAQ schema markup',        fix_type: 'faq_schema' },
  { id: 'directory_citations',  title: 'Build directory citations',    fix_type: 'directory_citations' },
  { id: 'review_velocity',      title: 'Increase review velocity',     fix_type: 'review_velocity' },
  { id: 'content_optimization', title: 'Optimize website content',     fix_type: 'content_optimization' },
  { id: 'trust_signals',        title: 'Strengthen trust signals',     fix_type: 'trust_signals' },
];

const PROGRESS_MESSAGES = [
  'Scanning business…',
  'Analyzing AI visibility gaps…',
  'Finding competitor data…',
  'Generating your proposal…',
];

// b35q shared classes (subset used on this page) — same definitions as the
// dashboard + agency pages, scoped to this page's <style> blocks.
const PAGE_CLASSES = `
  .lbl{font-family:var(--font-geist-mono),monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#5F5F78}
  .card{background:#fff;border:1px solid #E7E7F0;border-radius:16px;padding:22px;min-width:0}
  .h3{margin:0;font-size:17px;font-weight:700;letter-spacing:-0.01em}
  .sub{margin:0;font-size:13px;color:#55556A}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 18px;border-radius:12px;font-family:inherit;font-weight:600;font-size:14px;border:0;cursor:pointer;white-space:nowrap;text-decoration:none}
  .btn-blue{background:#1B17FF;color:#fff}.btn-blue:hover{background:#1310C4;color:#fff}
  .btn-line{background:#fff;color:#0A0A14;border:1px solid #D9D9E6}.btn-line:hover{border-color:#0A0A14;color:#0A0A14}
  .btn-white{background:#fff;color:#0A0A14}.btn-white:hover{color:#1B17FF}
  @media (max-width:639px){.card{padding:18px}}
`;

export default function ProposalBuilderPage() {
  const pageFont = { fontFamily: 'var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif' } as React.CSSProperties;
  const [step, setStep]                 = useState<1 | 2 | 3>(1);
  const [useUrl, setUseUrl]             = useState(true);
  const [websiteUrl, setWebsiteUrl]     = useState('');
  const [businessName, setBusinessName] = useState('');
  const [city, setCity]                 = useState('');
  const [state, setState]               = useState('');
  const [fee, setFee]                   = useState('');
  const [agencyName, setAgencyName]     = useState('');
  const [progressIdx, setProgressIdx]   = useState(0);
  const [proposalContent, setProposalContent] = useState('');
  const [proposalId, setProposalId]     = useState<string | null>(null);
  const [simulation, setSimulation]     = useState<SimulatorOutput | null>(null);
  const [error, setError]               = useState('');
  const [copied, setCopied]             = useState(false);
  const progressRef                     = useRef<ReturnType<typeof setInterval> | null>(null);
  // b89b: sign-in + Agency-plan gates (the builder rendered for
  // everyone; its generate route is plan-gated in the b89c branch).
  const { plan, rawPlan, loading: planLoading } = usePlan();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = getBrowserClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setSignedIn(false); return; }
      setSignedIn(true);
      const { data: settings } = await supabase
        .from('agency_settings')
        .select('agency_name')
        .eq('agency_user_id', data.user.id)
        .limit(1)
        .single();
      if (settings?.agency_name) setAgencyName(settings.agency_name);
    });
  }, []);

  async function handleSubmit() {
    setError('');
    const name = useUrl ? (websiteUrl.replace(/https?:\/\//, '').split('/')[0]) : businessName;
    if (!name || !fee) { setError('Please fill in all required fields.'); return; }

    setStep(2);
    setProgressIdx(0);

    // Cycle progress messages
    progressRef.current = setInterval(() => {
      setProgressIdx(i => Math.min(i + 1, PROGRESS_MESSAGES.length - 1));
    }, 1800);

    try {
      const res = await fetch('/api/agency/generate-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: useUrl ? name : businessName,
          website: useUrl ? websiteUrl : null,
          city: useUrl ? null : city,
          state: useUrl ? null : state,
          proposed_fee: fee,
          agency_name: agencyName,
        }),
      });
      clearInterval(progressRef.current!);
      if (!res.ok) throw new Error('Generation failed');
      const data = await res.json();
      setProposalContent(data.content);
      setProposalId(data.proposal_id || null);

      // Build a visibility projection for the prospect — only from measured
      // data. When no scan exists for this prospect there is no projection:
      // the old code invented one from hardcoded 35 / 62 / 3 / 3500 inputs.
      // The on-screen projection uses the scan's own estimate in the scan
      // market's currency (the proposal document quotes one currency only).
      const simGap = typeof data.scan_revenue_gap === 'number' ? data.scan_revenue_gap : data.revenue_gap;
      const sim = typeof data.score === 'number' && typeof simGap === 'number'
        ? calculateSimulation({
            currentScore: data.score,
            industry: data.industry || 'other',
            city: useUrl ? '' : city,
            countryCode: 'US',
            competitorScore: typeof data.competitor_score === 'number' ? data.competitor_score : null,
            platformsCovered: typeof data.platforms_covered === 'number' ? data.platforms_covered : 0,
            fixes: DEFAULT_FIXES,
            revenueGap: simGap,
            revenueSymbol: typeof data.scan_revenue_symbol === 'string' ? data.scan_revenue_symbol : (typeof data.revenue_symbol === 'string' ? data.revenue_symbol : '$'),
          })
        : null;
      setSimulation(sim);

      setStep(3);
    } catch {
      clearInterval(progressRef.current!);
      setError('Failed to generate proposal. Please try again.');
      setStep(1);
    }
  }

  function handleReset() {
    setStep(1);
    setWebsiteUrl('');
    setBusinessName('');
    setCity('');
    setState('');
    setFee('');
    setProposalContent('');
    setProposalId(null);
    setSimulation(null);
    setProgressIdx(0);
    setError('');
  }

  function handlePrint() {
    window.print();
  }

  // b35r form-field treatment: 1px border, radius 12, BG fill.
  const inp: React.CSSProperties = {
    background: BG, border: `1px solid ${BORDER}`,
    borderRadius: 12, padding: '11px 14px', fontSize: 14,
    color: NAVY, width: '100%', outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box',
  };

  const label = (t: string, req = false) => (
    <p className="lbl" style={{ marginBottom: 7 }}>
      {t}{req && <span style={{ color: RED_X, marginLeft: 3 }}>*</span>}
    </p>
  );

  // b89b gates — before every step view.
  if (planLoading || signedIn === null) return (
    <div style={{ padding: 40, color: GRAY, fontFamily: 'system-ui, sans-serif' }}>Loading…</div>
  );
  if (signedIn === false) return (
    <div style={{ padding: '48px 24px', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <p style={{ fontSize: 16, fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>Sign in to use the Proposal Builder.</p>
      <p style={{ fontSize: 13, color: GRAY, margin: '0 0 16px' }}>Generate a professional GEO proposal for a prospect.</p>
      <Link href="/login?next=/dashboard/agency/proposal" style={{ color: BLUE, fontWeight: 700, fontSize: 14 }}>Sign in</Link>
    </div>
  );
  if (plan === rawPlan && !isAgencyPlan(plan)) return (
    <PlanGuard feature="canSeeAgency" requiredPlan="agency" currentPlan={plan} isAdmin={false}>
      <></>
    </PlanGuard>
  );

  // ── Step 1: Input Form ──────────────────────────────────────────────────
  if (step === 1) return (
    <div className={`${geistSans.variable} ${geistMono.variable}`} style={{ background: BG, minHeight: '100vh', padding: '28px 24px', ...pageFont }}>
      <style>{PAGE_CLASSES}</style>
      <div style={{ maxWidth: 560, margin: '0 auto' }}><div style={{ marginBottom: 28 }}>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, letterSpacing: '-0.035em', color: NAVY }}>Proposal Builder</h1>
          <p style={{ fontSize: 14, color: GRAY, margin: '6px 0 0' }}>Generate a professional GEO proposal for a prospect in seconds</p>
        </div>

        {error && (
          <div style={{ background: RED_BG, border: '1px solid #FECACA', borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 14, color: RED, fontWeight: 600 }}>
            {error}
          </div>
        )}

        <div className="card">

          {/* Toggle URL vs Name */}
          <div style={{ display: 'flex', background: BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 4, marginBottom: 24 }}>
            {[
              { v: true,  l: 'I have their website URL' },
              { v: false, l: "I'll enter their business name" },
            ].map(o => (
              <button
                key={String(o.v)}
                onClick={() => setUseUrl(o.v)}
                style={{ flex: 1, background: useUrl === o.v ? W : 'transparent', border: 'none', borderRadius: 8, padding: '10px 12px', fontSize: 13, fontWeight: useUrl === o.v ? 700 : 500, color: useUrl === o.v ? NAVY : GRAY, cursor: 'pointer', fontFamily: 'inherit', boxShadow: useUrl === o.v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.15s' }}
              >
                {o.l}
              </button>
            ))}
          </div>

          {useUrl ? (
            <div style={{ marginBottom: 20 }}>
              {label('Prospect Website URL', true)}
              <input style={inp} value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} placeholder="https://theirwebsite.com" type="url" />
            </div>
          ) : (
            <div style={{ marginBottom: 20 }}>
              <div style={{ marginBottom: 14 }}>
                {label('Business Name', true)}
                <input style={inp} value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Smith Dental Group" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  {label('City')}
                  <input style={inp} value={city} onChange={e => setCity(e.target.value)} placeholder="Austin" />
                </div>
                <div>
                  {label('State')}
                  <input style={inp} value={state} onChange={e => setState(e.target.value)} placeholder="TX" />
                </div>
              </div>
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            {label('Proposed Monthly Fee', true)}
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 14, fontWeight: 700, color: GRAY }}>{PROPOSAL_FEE_SYMBOL}</span>
              <input
                style={{ ...inp, paddingLeft: 28 }}
                type="number"
                min="0"
                value={fee}
                onChange={e => setFee(e.target.value)}
                placeholder="1500"
              />
            </div>
          </div>

          <div style={{ marginBottom: 28 }}>
            {label('Your Agency Name')}
            <input style={inp} value={agencyName} onChange={e => setAgencyName(e.target.value)} placeholder="Acme Digital Agency" />
          </div>

          <button
            onClick={handleSubmit}
            className="btn btn-blue"
            style={{ width: '100%', minHeight: 48, fontSize: 15, letterSpacing: '-0.2px' }}
          >
            Generate Proposal <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></button>
        </div>
      </div>
    </div>
  );

  // ── Step 2: Scanning / Generating ──────────────────────────────────────
  if (step === 2) return (
    <div className={`${geistSans.variable} ${geistMono.variable}`} style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, ...pageFont }}>
      <style>{`${PAGE_CLASSES}
            @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          `}</style>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        {/* Spinner */}
        <div style={{ position: 'relative', width: 72, height: 72, margin: '0 auto 28px' }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            border: `4px solid ${BORDER}`,
            borderTopColor: BLUE,
            animation: 'spin 0.9s linear infinite',
          }} />
        </div>

        <h2 style={{ fontSize: 20, fontWeight: 800, color: NAVY, marginBottom: 12, letterSpacing: '-0.01em' }}>
          Building your proposal…
        </h2>

        <div style={{ height: 28, overflow: 'hidden', position: 'relative' }}>
          {PROGRESS_MESSAGES.map((msg, i) => (
            <p
              key={i}
              style={{
                fontSize: 14, color: GRAY, margin: 0,
                position: 'absolute', width: '100%',
                opacity: i === progressIdx ? 1 : 0,
                transform: i === progressIdx ? 'translateY(0)' : 'translateY(8px)',
                transition: 'opacity 0.4s, transform 0.4s',
              }}
            >
              {msg}
            </p>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 24 }}>
          {PROGRESS_MESSAGES.map((_, i) => (
            <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i <= progressIdx ? BLUE : BORDER, transition: 'background 0.3s' }} />
          ))}
        </div>
      </div>
    </div>
  );

  // ── Step 3: Result ──────────────────────────────────────────────────────
  const prospectName =
    (useUrl ? websiteUrl.replace(/https?:\/\//, '').split('/')[0] : businessName) || 'this business';
  return (
    <div className={`${geistSans.variable} ${geistMono.variable}`} style={{ background: BG, minHeight: '100vh', padding: '28px 24px', ...pageFont }}>
      <style>{PAGE_CLASSES}</style>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 14, color: W, fontWeight: 800 }}><svg viewBox="0 0 448 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg></span>
              </div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: NAVY, letterSpacing: '-0.01em' }}>Your proposal is ready</h1>
            </div>
            <p style={{ fontSize: 14, color: GRAY, marginLeft: 38, marginTop: 0 }}>Review and send to your prospect</p>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={handlePrint}
              className="btn btn-blue"
            >
              Download / Print PDF
            </button>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(proposalContent);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch { /* clipboard unavailable */ }
              }}
              className="btn btn-line"
              style={{ color: copied ? GREEN : undefined }}
            >
              {copied ? (<><svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>{' '}Copied</>) : 'Copy Text'}
            </button>
            <button
              onClick={() => {
                const mailto = `mailto:?subject=${encodeURIComponent('AI Visibility Proposal')}&body=${encodeURIComponent(proposalContent)}`;
                window.location.href = mailto;
              }}
              className="btn btn-line"
            >
              Email to Prospect
            </button>
            <button
              onClick={() => {
                if (proposalId) window.location.href = `/dashboard/agency/proposals`;
              }}
              className="btn"
              style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', color: BLUE }}
            >
              Save Proposal
            </button>
          </div>
        </div>

        {/* Proposal content */}
        <div className="card" style={{ padding: '32px', marginBottom: 20 }}>
          <div style={{ fontSize: 15, color: NAVY, lineHeight: 1.8, whiteSpace: 'pre-wrap', fontFamily: 'Georgia, serif' }}>
            {proposalContent}
          </div>
        </div>

        {/* Recommendation Simulator */}
        {simulation && (
          <div className="card" style={{ padding: '28px 32px', marginBottom: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: PURPLE, marginBottom: 6, letterSpacing: '-0.01em' }}>
              What {prospectName} can achieve
            </h2>
            <p style={{ fontSize: 13, color: GRAY, marginBottom: 22, marginTop: 0 }}>
              Projected AI-visibility improvement with our recommended GEO program
            </p>

            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 24 }}>
              <div style={{ flex: 1, minWidth: 150, background: FIX_BG, border: `1px solid ${TINT_BORDER}`, borderRadius: 12, padding: '16px 18px' }}>
                <p className="lbl" style={{ color: PURPLE, margin: 0 }}>Visibility Score</p>
                <p style={{ fontSize: 24, fontWeight: 900, color: NAVY, margin: '6px 0 0' }}>
                  {simulation.currentScore} <span style={{ color: LGRAY }}>→</span> {simulation.projectedScoreMid}
                </p>
                <p style={{ fontSize: 12, color: GRAY, margin: '2px 0 0' }}>{simulation.gradeBeforeLabel} → {simulation.gradeAfterLabel}</p>
              </div>
              <div style={{ flex: 1, minWidth: 150, background: FIX_BG, border: `1px solid ${TINT_BORDER}`, borderRadius: 12, padding: '16px 18px' }}>
                <p className="lbl" style={{ color: PURPLE, margin: 0 }}>Revenue Recovered</p>
                <p style={{ fontSize: 24, fontWeight: 900, color: GREEN, margin: '6px 0 0' }}>
                  {simulation.revenueSymbol}{simulation.revenueRecoveredAnnual.toLocaleString()}
                </p>
                <p style={{ fontSize: 12, color: GRAY, margin: '2px 0 0' }}>per year</p>
              </div>
              <div style={{ flex: 1, minWidth: 150, background: FIX_BG, border: `1px solid ${TINT_BORDER}`, borderRadius: 12, padding: '16px 18px' }}>
                <p className="lbl" style={{ color: PURPLE, margin: 0 }}>Timeline</p>
                <p style={{ fontSize: 24, fontWeight: 900, color: NAVY, margin: '6px 0 0' }}>{simulation.totalWeeks} weeks</p>
                <p style={{ fontSize: 12, color: GRAY, margin: '2px 0 0' }}>to full impact</p>
              </div>
            </div>

            <p className="lbl" style={{ marginBottom: 12 }}>Rollout Timeline</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {simulation.fixProjections.map(f => (
                <div key={f.fixNumber} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: BG, borderRadius: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: PURPLE, minWidth: 84 }}>Week {f.weekStart}–{f.weekEnd}</span>
                  <span style={{ fontSize: 14, color: NAVY, flex: 1 }}>{f.fixTitle}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: GREEN, whiteSpace: 'nowrap' }}>+{f.pointsGained} pts</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No measured scan for this prospect → no projection is shown. */}
        {!simulation && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 16, padding: '20px 24px', marginBottom: 20 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: '0 0 4px' }}>Projection unavailable — no scan for this prospect yet</p>
            <p style={{ fontSize: 13, color: GRAY, margin: 0 }}>Run a Rankall scan for this prospect to generate a projection from their real score, competitor position, and revenue gap.</p>
          </div>
        )}

        <div style={{ textAlign: 'center' }}>
          <button
            onClick={handleReset}
            style={{ background: 'transparent', border: 'none', fontSize: 14, color: MUTED, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}
          >
            Start over — create another proposal
          </button>
        </div>

      </div>
    </div>
  );
}
