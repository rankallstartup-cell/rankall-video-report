'use client';

import { useState, useEffect } from 'react';
import { useAdminGuard } from '@/lib/useAdminGuard';
import { useCountry } from '@/hooks/useCountry';
import { scanRevenueEstimate, revenueEstimateBasis } from '@/lib/revenueModel';
import { getBrowserClient } from '@/lib/supabase';
import { usePlan } from '@/lib/usePlan';
import { PLAN_CONFIG, type PlanType } from '@/lib/planConfig';

// b89r: plan labels come from the canonical PLAN_CONFIG display
// names ("Local Pro + SEO", "Agency + SEO") — the switcher used to
// title-case the raw keys, rendering "Local Pro Seo".
function planLabel(p: string): string {
  return PLAN_CONFIG[p as PlanType]?.displayName ?? p.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── b35q tokens (same set as the redesigned dashboard) ──
const BG     = '#F6F6FB';
const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#E7E7F0';
const BLUE   = '#1B17FF';
const GREEN  = '#12A150';
const AMBER  = '#D97706';
const GRAY   = '#55556A';
const LGRAY  = '#94A3B8';
const RED    = '#B4232A';
// Plan banner keeps its semantic amber/warning palette (unchanged from staging).
const WARN_BG     = '#FFFBEB';
const WARN_BORDER = '#FDE68A';
const WARN_TEXT   = '#92400E';
const WARN_PILL_BG     = '#FEF3C7';
const WARN_PILL_BORDER = '#F59E0B';
const WARN_PILL_TEXT   = '#B45309';

interface ScanResult {
  scanId: string | null
  businessName: string
  city: string
  industry: string
  score: number
  competitor: string | null
  // How many of the 12 platforms named this competitor. We do NOT score the
  // competitor — no measured competitor score exists — so the brief shows
  // mention share, never a fabricated competitor score or gap.
  competitorMentions: number
  topFixes: string[]
  platformResults: Array<{ platform: string; mentioned: boolean; competitor: string | null }>
  // Canonical revenue model inputs (lib/revenueModel): the measured mention
  // count over the platforms that responded, the scan's industry + country.
  mentionedCount: number | null
  respondedPlatforms: number
  industryKey: string | null
  countryCode: string
}

interface TalkingPoint {
  point: string
  whyItMatters: string
  whatToSay: string
}

function scoreColor(score: number) {
  if (score >= 70) return GREEN
  if (score >= 40) return AMBER
  return RED
}

export default function DemoPrepPage() {
  const { checking, isAdmin } = useAdminGuard()
  const country = useCountry()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [talkingPoints, setTalkingPoints] = useState<TalkingPoint[]>([])
  const [tpLoading, setTpLoading] = useState(false)
  const [tpError, setTpError] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const { rawPlan, userId } = usePlan()
  const [currentPlan, setCurrentPlan] = useState<string>('free')
  const [planSwitching, setPlanSwitching] = useState(false)
  const [planMsg, setPlanMsg] = useState('')

  useEffect(() => {
    setCurrentPlan(rawPlan)
  }, [rawPlan])

  if (checking) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: BG, fontFamily: 'var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif' }}>
        <p style={{ color: LGRAY, fontSize: 14 }}>Checking access...</p>
      </div>
    )
  }
  if (!isAdmin) return null

  async function handlePrepare() {
    if (!input.trim()) return
    setLoading(true)
    setError('')
    setScan(null)
    setTalkingPoints([])
    setTpError('')
    setLoadingMsg('Scanning 12 platforms...')

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: input.trim() }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Scan failed')

      const intent = typeof data.intent === 'object' ? data.intent : {}
      const businessName = intent.business ?? input.trim()
      const city = intent.city ?? ''
      const industry = intent.industry ?? ''

      const competitor = data.competitor ?? null
      const platformResults: ScanResult['platformResults'] = (data.analysis ?? []).map((a: { platform: string; mentioned: boolean; competitor: string | null }) => ({
        platform: a.platform,
        mentioned: a.mentioned,
        competitor: a.competitor,
      }))

      // Competitor mention share — a real count, not a score. The old code
      // added a fabricated +20 to turn this into a fake competitor score.
      const compMentions = platformResults.filter(p => p.competitor === competitor).length

      const topFixes = (data.trustSignals?.fixes ?? [])
        .slice(0, 3)
        .map((f: { title?: string; fix_title?: string }) => f.title ?? f.fix_title ?? '')
        .filter(Boolean)

      const result: ScanResult = {
        scanId: data.scanId,
        businessName,
        city,
        industry,
        score: data.overallScore ?? 0,
        competitor,
        competitorMentions: competitor ? compMentions : 0,
        topFixes,
        platformResults,
        mentionedCount: typeof data.mentionedCount === 'number' ? data.mentionedCount : null,
        respondedPlatforms: typeof data.platformsCompleted === 'number'
          ? data.platformsCompleted
          : (Array.isArray(data.results) ? data.results.filter((r: { response?: string | null }) => r.response).length : 0),
        industryKey: typeof data.industry === 'string' ? data.industry : null,
        countryCode: typeof data.country_code === 'string' && data.country_code ? data.country_code : country.code,
      }
      setScan(result)

      // Generate talking points
      setTpLoading(true)
      setLoadingMsg('Generating talking points...')
      await generateTalkingPoints(result)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
      setTpLoading(false)
      setLoadingMsg('')
    }
  }

  async function generateTalkingPoints(result: ScanResult) {
    // Server-side generation: the Anthropic key must never reach the browser.
    // (The old code called api.anthropic.com directly with
    // NEXT_PUBLIC_ANTHROPIC_API_KEY, exposing the key in the client bundle.)
    setTpError(null)
    try {
      setTpError('')
      const res = await fetch('/api/demo-prep/talking-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: result.businessName,
          city: result.city,
          industry: result.industry,
          score: result.score,
          competitor: result.competitor,
          competitorMentions: result.competitorMentions,
          topFixes: result.topFixes,
          mentionedPlatforms: result.platformResults.filter(p => p.mentioned).map(p => p.platform),
          notMentionedPlatforms: result.platformResults.filter(p => !p.mentioned).map(p => p.platform),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Talking points generation failed')
      if (!Array.isArray(data.talkingPoints)) throw new Error('Talking points generation returned an unexpected format')
      setTalkingPoints(data.talkingPoints)
    } catch (e) {
      // Surfaced in the Talking Points card — never silently swallowed.
      setTpError(e instanceof Error ? e.message : 'Talking points generation failed')
    } finally {
      setTpLoading(false)
    }
  }

  function buildBriefText(): string {
    if (!scan) return ''
    const lines: string[] = [
      `DEMO BRIEF — ${scan.businessName}`,
      `City: ${scan.city} | Industry: ${scan.industry}`,
      `AI Visibility Score: ${scan.score}/100`,
      scan.competitor ? `Competitor: ${scan.competitor} (mentioned on ${scan.competitorMentions}/${scan.platformResults.length} platforms)` : '',
      '',
      'TOP FIXES:',
      ...scan.topFixes.map((f, i) => `${i + 1}. ${f}`),
      '',
      'TALKING POINTS:',
      ...talkingPoints.map((tp, i) =>
        `${i + 1}. ${tp.point}\n   Why it matters: ${tp.whyItMatters}\n   Say: ${tp.whatToSay}`
      ),
    ]
    return lines.filter(l => l !== undefined).join('\n')
  }

  async function copyBrief() {
    await navigator.clipboard.writeText(buildBriefText())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function quickSwitchPlan(plan: string) {
    if (!userId || planSwitching) return
    setPlanSwitching(true)
    setPlanMsg('')
    try {
      const res = await fetch('/api/admin/switch-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, userId }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setPlanMsg(`Error: ${data.error ?? 'Failed'}`)
        return
      }
      setCurrentPlan(plan)
      setPlanMsg(`Switched to ${plan}`)
      setTimeout(() => setPlanMsg(''), 3000)
    } catch (e) {
      setPlanMsg(`Error: ${String(e)}`)
    } finally {
      setPlanSwitching(false)
    }
  }

  const QUICK_PLANS = ['free', 'local_pro', 'personal_pro', 'local_pro_seo', 'agency', 'agency_seo', 'enterprise', 'government']

  // Canonical revenue model (lib/revenueModel → lib/scoring
  // revenueGapForScanBreakdown), the same number the report page shows. The
  // old score-based formula ((100 - score)/100 × avg value × 10) disagreed
  // with every other surface. Unmeasured mention count → no number.
  const revenueEstimate = scan
    ? scanRevenueEstimate({
        mentionedCount: scan.mentionedCount,
        totalPlatforms: scan.respondedPlatforms,
        industry: scan.industryKey,
        countryCode: scan.countryCode,
      })
    : null
  const revenueLeak = revenueEstimate ? `${revenueEstimate.symbol}${revenueEstimate.gap.toLocaleString()}` : null
  const revenueBasis = revenueEstimate ? revenueEstimateBasis(revenueEstimate) : null

  return (
    <div style={{ background: BG, minHeight: '100vh', padding: '28px 24px 80px', fontFamily: 'var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif' }}>
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .dash-card { animation: fadeInUp 0.5s ease both; transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .dash-card:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(27,23,255,0.15); }
        .mono{font-family:var(--font-geist-mono),ui-monospace,Menlo,monospace}
        .lbl{font-family:var(--font-geist-mono),monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#5F5F78}
        .card{background:#fff;border:1px solid #E7E7F0;border-radius:16px;padding:22px;min-width:0}
        .h3{margin:0;font-size:17px;font-weight:700;letter-spacing:-0.01em}
        .sub{margin:0;font-size:13px;color:#55556A}
        .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 18px;border-radius:12px;font-family:inherit;font-weight:600;font-size:14px;border:0;cursor:pointer;white-space:nowrap;text-decoration:none}
        .btn-blue{background:#1B17FF;color:#fff}.btn-blue:hover{background:#1310C4;color:#fff}
        .btn-line{background:#fff;color:#0A0A14;border:1px solid #D9D9E6}.btn-line:hover{border-color:#0A0A14;color:#0A0A14}
        .pagehead{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}
        @media (max-width:639px){
          .pagehead{flex-direction:column;align-items:stretch}
          .card{padding:18px}
        }
        @media (prefers-reduced-motion:reduce){*{animation:none!important}}
      `}</style>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>

        {/* Header */}
        <header className="pagehead" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <span className="lbl" style={{ color: BLUE }}>Admin Tool</span>
            <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.035em', color: NAVY, margin: 0 }}>Demo Prep</h1>
            <p style={{ fontSize: 14, color: GRAY, margin: 0 }}>Run a scan and get a complete brief + talking points before a call.</p>
          </div>
        </header>

        {/* Plan badge + quick-switch (semantic amber/warning palette, unchanged) */}
        <div className="dash-card" style={{ background: WARN_BG, border: `1px solid ${WARN_BORDER}`, borderRadius: 16, padding: '18px 20px', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Active Plan:</span>
            <span style={{ background: '#FEF3C7', border: '1.5px solid #F59E0B', borderRadius: 100, padding: '3px 14px', fontSize: 12, fontWeight: 800, color: '#B45309' }}>
              {planLabel(currentPlan)}
            </span>
            <span style={{ fontSize: 11, color: WARN_TEXT, marginLeft: 4 }}>Switch to:</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {QUICK_PLANS.filter(p => p !== currentPlan).map(p => (
                <button
                  key={p}
                  onClick={() => quickSwitchPlan(p)}
                  disabled={planSwitching}
                  style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '5px 12px', fontSize: 11, fontWeight: 700, color: '#374151', cursor: planSwitching ? 'not-allowed' : 'pointer', opacity: planSwitching ? 0.5 : 1, fontFamily: 'inherit' }}
                  onMouseEnter={e => { if (!planSwitching) e.currentTarget.style.borderColor = WARN_PILL_BORDER; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; }}
                >
                  {planLabel(p)}
                </button>
              ))}
            </div>
          </div>
          <p style={{ fontSize: 11, color: '#92400E', marginTop: 10, marginBottom: 0 }}>
            Admin test control — switches your own account&apos;s plan so you can preview each tier. Admins only: this page redirects everyone else to the dashboard with a restricted message, and the switch API rejects non-admin callers.
          </p>
          {planMsg && (
            <p style={{ fontSize: 12, color: planMsg.startsWith('Error') ? RED : GREEN, fontWeight: 600, marginTop: 8, marginBottom: 0 }}>{planMsg}</p>
          )}
        </div>

        {/* Input */}
        <div className="card dash-card" style={{ marginBottom: 24 }}>
          <label className="lbl" style={{ display: 'block', marginBottom: 8 }}>
            Business name or URL
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !loading && handlePrepare()}
              placeholder="e.g. Carol Stream Smiles dental Chicago"
              style={{ flex: 1, background: BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px', fontSize: 14, color: NAVY, outline: 'none', fontFamily: 'inherit' }}
            />
            <button
              onClick={handlePrepare}
              disabled={loading || !input.trim()}
              className="btn btn-blue"
              style={{ background: loading ? GRAY : BLUE, opacity: loading ? 0.7 : 1, padding: '0 22px' }}
            >
              {loading ? loadingMsg : 'Prepare Demo Brief'}
            </button>
          </div>
          {error && <p style={{ fontSize: 13, color: RED, marginTop: 10, marginBottom: 0 }}>{error}</p>}
        </div>

        {scan && (
          <>
            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
              <button
                onClick={copyBrief}
                className="btn"
                style={{ background: copied ? GREEN : NAVY, color: '#fff', padding: '0 20px', fontSize: 13, fontWeight: 700 }}
              >
                {copied ? (<><svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>{' '}Copied!</>) : 'Copy Brief'}
              </button>
              <a
                href="/agency/demo"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-line"
                style={{ padding: '0 20px', fontSize: 13, fontWeight: 700 }}
              >
                <svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M128 0c17.7 0 32 14.3 32 32l0 32 128 0 0-32c0-17.7 14.3-32 32-32s32 14.3 32 32l0 32 48 0c26.5 0 48 21.5 48 48l0 48L0 160l0-48C0 85.5 21.5 64 48 64l48 0 0-32c0-17.7 14.3-32 32-32zM0 192l448 0 0 272c0 26.5-21.5 48-48 48L48 512c-26.5 0-48-21.5-48-48L0 192zm64 80l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0c-8.8 0-16 7.2-16 16zm128 0l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0c-8.8 0-16 7.2-16 16zm144-16c-8.8 0-16 7.2-16 16l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0zM64 400l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0c-8.8 0-16 7.2-16 16zm144-16c-8.8 0-16 7.2-16 16l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0zm112 16l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0c-8.8 0-16 7.2-16 16z"/></svg> Open Cal.com
              </a>
              {scan.scanId && (
                <a
                  href={`/report/${scan.scanId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-line"
                  style={{ color: BLUE, padding: '0 20px', fontSize: 13, fontWeight: 700 }}
                >
                  <svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M320 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l82.7 0L201.4 265.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L448 109.3l0 82.7c0 17.7 14.3 32 32 32s32-14.3 32-32l0-160c0-17.7-14.3-32-32-32L320 0zM80 32C35.8 32 0 67.8 0 112L0 432c0 44.2 35.8 80 80 80l320 0c44.2 0 80-35.8 80-80l0-112c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 112c0 8.8-7.2 16-16 16L80 448c-8.8 0-16-7.2-16-16l0-320c0-8.8 7.2-16 16-16l112 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L80 32z"/></svg> Open Full Report
                </a>
              )}
            </div>

            {/* DEMO BRIEF card */}
            <div className="card dash-card" style={{ marginBottom: 16 }}>
              <p className="lbl" style={{ marginBottom: 16 }}>Demo Brief</p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 20 }}>
                <div style={{ background: BG, borderRadius: 12, padding: '14px 16px' }}>
                  <p className="lbl" style={{ marginBottom: 4 }}>Business</p>
                  <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: 0 }}>{scan.businessName}</p>
                </div>
                {scan.city && (
                  <div style={{ background: BG, borderRadius: 12, padding: '14px 16px' }}>
                    <p className="lbl" style={{ marginBottom: 4 }}>City</p>
                    <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: 0 }}>{scan.city}</p>
                  </div>
                )}
                {scan.industry && (
                  <div style={{ background: BG, borderRadius: 12, padding: '14px 16px' }}>
                    <p className="lbl" style={{ marginBottom: 4 }}>Industry</p>
                    <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: 0 }}>{scan.industry}</p>
                  </div>
                )}
                <div style={{ background: '#ECEBFF', borderRadius: 12, padding: '14px 16px' }}>
                  <p className="lbl" style={{ marginBottom: 4 }}>AI Score</p>
                  <p style={{ fontSize: 22, fontWeight: 900, color: scoreColor(scan.score), margin: 0 }}>{scan.score}<span style={{ fontSize: 12, color: LGRAY }}>/100</span></p>
                </div>
                {scan.competitor && (
                  <div style={{ background: '#FFF7ED', borderRadius: 12, padding: '14px 16px' }}>
                    <p className="lbl" style={{ marginBottom: 4 }}>Top Competitor</p>
                    <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, margin: '0 0 2px' }}>{scan.competitor}</p>
                    <p style={{ fontSize: 12, color: RED, margin: 0 }}>Mentioned on {scan.competitorMentions}/{scan.platformResults.length} platforms</p>
                  </div>
                )}
                {revenueLeak && (
                  <div style={{ background: '#FFF1F2', borderRadius: 12, padding: '14px 16px' }}>
                    <p className="lbl" style={{ marginBottom: 4 }}>Estimated Revenue Gap</p>
                    <p style={{ fontSize: 18, fontWeight: 900, color: RED, margin: 0 }}>{revenueLeak}<span style={{ fontSize: 11, color: LGRAY }}>/mo</span></p>
                    <p style={{ fontSize: 10, color: LGRAY, margin: '4px 0 0', lineHeight: 1.4 }}>{revenueBasis}. Same model as the report.</p>
                  </div>
                )}
              </div>

              {scan.topFixes.length > 0 && (
                <>
                  <p style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 10 }}>Top 3 Fixes</p>
                  <ol style={{ paddingLeft: 18, margin: 0 }}>
                    {scan.topFixes.map((fix, i) => (
                      <li key={i} style={{ fontSize: 14, color: GRAY, marginBottom: 6 }}>{fix}</li>
                    ))}
                  </ol>
                </>
              )}
            </div>

            {/* TALKING POINTS card */}
            <div className="card dash-card" style={{ marginBottom: 16 }}>
              <p className="lbl" style={{ marginBottom: 16 }}>Talking Points</p>
              {tpLoading ? (
                <p style={{ fontSize: 14, color: LGRAY, margin: 0 }}>Generating talking points with Opus 4.8...</p>
              ) : tpError ? (
                <p style={{ fontSize: 14, color: RED, margin: 0 }}>{tpError}</p>
              ) : talkingPoints.length === 0 ? (
                <p style={{ fontSize: 14, color: LGRAY, margin: 0 }}>No talking points generated.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {talkingPoints.map((tp, i) => (
                    <div key={i} style={{ background: BG, borderRadius: 12, padding: '16px 18px', borderLeft: `3px solid ${BLUE}` }}>
                      <p style={{ fontSize: 15, fontWeight: 700, color: NAVY, margin: '0 0 6px' }}>{i + 1}. {tp.point}</p>
                      <p style={{ fontSize: 13, color: RED, fontWeight: 600, margin: '0 0 4px' }}>Why it matters: <span style={{ color: GRAY, fontWeight: 400 }}>{tp.whyItMatters}</span></p>
                      <p style={{ fontSize: 13, color: BLUE, fontWeight: 600, margin: 0 }}>Say: <span style={{ color: GRAY, fontWeight: 400 }}>{tp.whatToSay}</span></p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* PLATFORM BREAKDOWN card */}
            <div className="card dash-card">
              <p className="lbl" style={{ marginBottom: 16 }}>Platform Breakdown</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                {scan.platformResults.map(p => (
                  <div
                    key={p.platform}
                    style={{ background: p.mentioned ? '#E3F6EC' : '#FDECEC', border: `1px solid ${p.mentioned ? '#A7F3D0' : '#FECDD3'}`, borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{p.platform}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: p.mentioned ? GREEN : RED }}>{p.mentioned ? (<><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>{' '}You</>) : (<><svg viewBox="0 0 384 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>{' '}Not you</>)}</span>
                      {p.competitor && !p.mentioned && (
                        <span style={{ fontSize: 10, color: LGRAY }}>{p.competitor}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
