'use client';

import { useState, useEffect } from 'react';
import { getBrowserClient } from '@/lib/supabase';
import type { SeoCheck, SeoAuditResult } from '@/app/api/seo-audit/route';
import { usePlan } from '@/lib/usePlan'
import { getPlanConfig, isBusinessPlan, normalizePlan } from '@/lib/planConfig';
import UpgradePrompt from '@/components/UpgradePrompt';
import { PlanPageGuard } from '@/components/PlanPageGuard';
import { computeSeoHealth, type SeoHealthResult } from '@/lib/seoHealth';

const supabase = getBrowserClient();

const BG     = '#F8FAFC';
const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#E2E8F0';
const BLUE   = '#1B17FF';
const GREEN  = '#059669';
const RED    = '#DC2626';
const AMBER  = '#D97706';
const PURPLE = '#1B17FF';
const GRAY   = '#64748B';
const LGRAY  = '#94A3B8';

type ImpactLevel = 'Very High' | 'High' | 'Medium' | 'Low' | 'None'

const SEO_IMPACT_STYLE: Record<ImpactLevel, { color: string; bg: string; border: string }> = {
  'Very High': { color: '#1D4ED8', bg: '#ECEBFF', border: '#93C5FD' },
  'High':      { color: '#1B17FF', bg: '#ECEBFF', border: '#C9C6FF' },
  'Medium':    { color: '#D97706', bg: '#FFFBEB', border: '#FCD34D' },
  'Low':       { color: '#64748B', bg: '#F1F5F9', border: '#CBD5E1' },
  'None':      { color: '#64748B', bg: '#F1F5F9', border: '#E2E8F0' },
}

const AI_IMPACT_STYLE: Record<ImpactLevel, { color: string; bg: string; border: string }> = {
  'Very High': { color: '#1B17FF', bg: '#ECEBFF', border: '#C4B5FD' },
  'High':      { color: '#1B17FF', bg: '#ECEBFF', border: '#DCDAFF' },
  'Medium':    { color: '#1B17FF', bg: '#ECEBFF', border: '#E9D5FF' },
  'Low':       { color: '#8D8BFF', bg: '#ECEBFF', border: '#EDE9FE' },
  'None':      { color: '#94A3B8', bg: '#F1F5F9', border: '#E2E8F0' },
}

function ImpactBadge({ label, impact, type }: { label: string; impact: ImpactLevel; type: 'seo' | 'ai' }) {
  const style = type === 'seo' ? SEO_IMPACT_STYLE[impact] : AI_IMPACT_STYLE[impact]
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color: style.color,
      background: style.bg, border: `1px solid ${style.border}`,
      borderRadius: 100, padding: '2px 8px', whiteSpace: 'nowrap',
    }}>
      {label}: {impact}
    </span>
  )
}

function ScoreRing({ score, label, sublabel, size = 'md', color }: {
  score: number | null
  label: string
  sublabel: string
  size?: 'sm' | 'md' | 'lg'
  color: string
}) {
  const dim = size === 'lg' ? 120 : size === 'md' ? 96 : 80
  const r   = (dim / 2) - 8
  const circ = 2 * Math.PI * r
  const dash  = score != null ? (score / 100) * circ : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ position: 'relative', width: dim, height: dim }}>
        <svg width={dim} height={dim} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={dim/2} cy={dim/2} r={r} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="8" />
          <circle
            cx={dim/2} cy={dim/2} r={r}
            fill="none" stroke={score != null ? color : BORDER}
            strokeWidth="8" strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          {score != null
            ? <span style={{ fontSize: size === 'lg' ? 28 : size === 'md' ? 22 : 18, fontWeight: 900, color, lineHeight: 1 }}>{score}</span>
            : <span style={{ fontSize: 13, color: LGRAY }}>—</span>
          }
          <span style={{ fontSize: 9, color: LGRAY, fontWeight: 600 }}>/100</span>
        </div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: size === 'lg' ? 13 : 12, fontWeight: 700, color: NAVY, margin: 0 }}>{label}</p>
        <p style={{ fontSize: 11, color: LGRAY, margin: 0 }}>{sublabel}</p>
      </div>
    </div>
  )
}

export default function SeoHealthPage() {
  const { plan, rawPlan, loading: planLoading } = usePlan()
  // b8a8: session awareness — logged-out visitors used to get the PLAN
  // upgrade gate ("SEO Health requires Local Pro Seo") with no login
  // message at all. Null = not yet known.
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [aiScore, setAiScore]         = useState<number | null>(null)
  const [latestScan, setLatestScan]   = useState<{ id: string; overall_score: number; input: string; industry: string | null; location: string | null; user_business_name: string | null } | null>(null)
  const [url, setUrl]                 = useState('')
  const [auditing, setAuditing]       = useState(false)
  const [auditResult, setAuditResult] = useState<SeoAuditResult | null>(null)
  const [auditError, setAuditError]   = useState<string | null>(null)
  const [generating, setGenerating]   = useState<string | null>(null)
  const [fixResults, setFixResults]   = useState<Record<string, { content: string; instructions: string; impact: string }>>({})
  const [fixErrors, setFixErrors]     = useState<Record<string, string>>({})
  const [copiedId, setCopiedId]       = useState<string | null>(null)
  const [copyErrorId, setCopyErrorId] = useState<string | null>(null)
  const [markedFixed, setMarkedFixed] = useState<Set<string>>(new Set())
  // SEO Health v1: score from the latest scan's STORED trust signals — no new
  // audit, no vendor API. Null = no usable scan data (honest empty state).
  const [scanSeo, setScanSeo] = useState<SeoHealthResult | null>(null)
  const [scanSeoLoaded, setScanSeoLoaded] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const session = data.session
      setSignedIn(!!session)
      if (!session) { setScanSeoLoaded(true); return }
      const { data: scan } = await supabase
        .from('rankall_scans')
        .select('id, overall_score, input, industry, location, user_business_name')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (scan) {
        setAiScore(scan.overall_score)
        setLatestScan(scan)
      }
      // Latest scan that actually carries trust signals (older scans may
      // predate them). The score is computed from stored data only.
      try {
        const { data: seoScan } = await supabase
          .from('rankall_scans')
          .select('input, user_business_name, trust_signals, created_at')
          .eq('user_id', session.user.id)
          .not('trust_signals', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (seoScan?.trust_signals && seoScan.created_at) {
          setScanSeo(computeSeoHealth(seoScan.trust_signals, {
            asOf: seoScan.created_at,
            businessName: seoScan.user_business_name || seoScan.input || '',
          }))
        }
      } catch {
        // Stored-data score is a progressive enhancement — a failure here
        // must never break the page or the URL audit below.
        setScanSeo(null)
      }
      setScanSeoLoaded(true)
    })
  }, [])

  // b8a8: the top cards used ONLY the URL-audit score, so a user whose
  // latest scan already produced an SEO score saw "—/100, not yet
  // audited" at the top and "52/100, no new audit needed" further down —
  // the page contradicted itself. The effective SEO score is the URL
  // audit when one has run, else the scan-derived score; the rings label
  // which source it is.
  const seoScore = auditResult?.seoScore ?? scanSeo?.score ?? null
  const seoFromScan = auditResult == null && scanSeo?.score != null
  const discoveryScore = aiScore != null && seoScore != null
    ? Math.round((aiScore + seoScore) / 2)
    : null

  async function runAudit() {
    if (!url.trim()) return
    setAuditing(true)
    setAuditError(null)
    setAuditResult(null)
    setFixResults({})
    setMarkedFixed(new Set())
    try {
      const res = await fetch('/api/seo-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          // Do NOT pass businessName from a previous scan — let the server extract it from the URL
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setAuditError(data.error || 'Audit failed')
      } else {
        setAuditResult(data as SeoAuditResult)
        if ((data as SeoAuditResult).warning) {
          setAuditError((data as SeoAuditResult).warning ?? null)
        }
      }
    } catch {
      setAuditError('Network error — please try again')
    }
    setAuditing(false)
  }

  async function generateFix(check: SeoCheck) {
    setGenerating(check.id)
    setFixErrors(prev => {
      const next = { ...prev }
      delete next[check.id]
      return next
    })
    try {
      // Always use businessName extracted from the current audit's URL — never from a previous scan.
      // Business type / city come from the user's latest scan when available —
      // sending empty strings starved the fix prompt of context it needs.
      const businessName = auditResult?.businessName || ''
      const res = await fetch('/api/seo-audit/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fix_type: check.fixType,
          business_name: businessName,
          business_type: latestScan?.industry || '',
          city: latestScan?.location || '',
          website_url: auditResult?.url || url,
          current_content: check.value,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        setFixErrors(prev => ({ ...prev, [check.id]: data.error || 'Could not generate this fix. Please try again.' }))
      } else {
        setFixResults(prev => ({
          ...prev,
          [check.id]: {
            content: data.generated_content,
            instructions: data.instructions,
            impact: data.expected_impact,
          },
        }))
      }
    } catch {
      setFixErrors(prev => ({ ...prev, [check.id]: 'Could not generate this fix. Please check your connection and try again.' }))
    }
    setGenerating(null)
  }

  function copyFix(id: string, content: string) {
    // Only show "Copied!" after the write actually succeeds.
    setCopyErrorId(null)
    navigator.clipboard.writeText(content).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    }).catch(() => {
      setCopyErrorId(id)
    })
  }

  const failingChecks = auditResult?.checks.filter(c => c.status === 'fail') ?? []
  const passingChecks = auditResult?.checks.filter(c => c.status === 'pass') ?? []

  // Vital badge color
  function vitalColor(val: string | null, metric: 'lcp' | 'cls' | 'fcp'): string {
    if (!val) return LGRAY
    const n = parseFloat(val)
    if (metric === 'lcp') return n <= 2.5 ? GREEN : n <= 4.0 ? AMBER : RED
    if (metric === 'cls') return n <= 0.1 ? GREEN : n <= 0.25 ? AMBER : RED
    if (metric === 'fcp') return n <= 1.8 ? GREEN : n <= 3.0 ? AMBER : RED
    return LGRAY
  }

  // b8a8: signed-out visitors get a sign-in gate BEFORE the plan gate —
  // telling someone who has not logged in that "SEO Health requires
  // <plan>" skips the first step.
  if (signedIn === false) {
    return (
      <div style={{ background: BG, minHeight: '100vh', padding: '32px 24px', fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif" }}>
        <div style={{ maxWidth: 440, margin: '80px auto', textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: NAVY, margin: '0 0 10px' }}>SEO Health & Discovery Score</h1>
          <p style={{ fontSize: 14, color: GRAY, lineHeight: 1.6, margin: '0 0 20px' }}>
            Sign in to view SEO Health. Your score is computed from your own latest scan — sign in to see it, or run a free scan to get your first score.
          </p>
          <a href="/login?next=/dashboard/seo-health" style={{ display: 'inline-block', background: PURPLE, color: '#fff', borderRadius: 10, padding: '11px 24px', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>Sign in</a>
        </div>
      </div>
    )
  }

  if (!planLoading && !isBusinessPlan(plan)) {
    return (
      <div style={{ background: BG, minHeight: '100vh', padding: '32px 24px', fontFamily: "'Geist',ui-sans-serif,system-ui,sans-serif" }}>
        <UpgradePrompt
          requiredPlan="local_pro_seo"
          feature="SEO Health"
          upgradeParam="seo_autopilot"
        />
      </div>
    )
  }

  return (
    <PlanPageGuard feature="canSeeSEOHealth" requiredPlan="local_pro_seo">
    <div style={{ background: BG, minHeight: '100vh', padding: '32px 24px', fontFamily: "'Geist',ui-sans-serif,system-ui,sans-serif" }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <nav style={{ fontSize: 13, color: '#64748B', marginBottom: 20, display: 'flex', gap: 8, alignItems: 'center' }}>
          <a href="/dashboard" style={{ color: '#1B17FF', textDecoration: 'none', fontWeight: 600 }}>Dashboard</a>
          <span>›</span>
          <span>SEO Health</span>
        </nav>

        {/* Header — b8a8: a hardcoded session-number eyebrow that meant
            nothing to users was removed. */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: NAVY, margin: '0 0 6px' }}>SEO Health & Discovery Score</h1>
          <p style={{ fontSize: 14, color: GRAY, margin: 0 }}>Audit your website, generate fixes instantly, and see your combined AI + SEO Discovery Score.</p>
        </div>

        {/* b8a8: admin-view note (b8af pattern) — when the admin-upgraded
            plan differs from the account's real plan, say so: the page
            looked ungated on a Free account, contradicting the gate. */}
        {normalizePlan(plan) !== normalizePlan(rawPlan) && (
          <div style={{ background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: NAVY, lineHeight: 1.5 }}>
            <strong>Admin view:</strong> this account&apos;s plan is {getPlanConfig(rawPlan).displayName} — SEO Health is gated for {getPlanConfig(rawPlan).displayName} accounts. You see it because admins get full access.
          </div>
        )}

        {/* GSC Connection Card */}
        <div style={{ background: '#eff6ff', border: '1.5px solid #93c5fd', borderRadius: 14, padding: '20px 24px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#1e40af', margin: '0 0 4px' }}><svg viewBox="0 0 512 512" width="14" height="14" fill="#1B17FF" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512z"/></svg> Connect Google Search Console</p>
            <p style={{ fontSize: 13, color: '#3b82f6', margin: 0, lineHeight: 1.5 }}>
              See your actual AI Overview impressions directly from Google.
            </p>
          </div>
          <a
            href="/api/integrations/google-search-console?action=connect"
            style={{ background: '#2563eb', color: '#fff', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            Connect Now — 30 seconds <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
        </div>

        {/* THREE SCORE CARDS */}
        <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 20, padding: '28px 32px', marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <ScoreRing
                score={aiScore}
                label="AI Visibility Score"
                sublabel="platform coverage"
                size="md"
                color={aiScore != null ? (aiScore >= 70 ? GREEN : aiScore >= 50 ? AMBER : RED) : LGRAY}
              />
            </div>

            {/* Discovery Score — center, largest */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, borderLeft: `1px solid ${BORDER}`, borderRight: `1px solid ${BORDER}`, padding: '0 24px' }}>
              <ScoreRing
                score={discoveryScore}
                label="Combined Discovery Score"
                sublabel={discoveryScore == null ? 'run a scan or audit' : seoFromScan ? 'AI + SEO (from scan) — average of the two' : 'AI + SEO combined — average of the two'}
                size="lg"
                color={discoveryScore != null ? (discoveryScore >= 70 ? GREEN : discoveryScore >= 50 ? AMBER : RED) : LGRAY}
              />
              {discoveryScore == null && (
                <p style={{ fontSize: 11, color: LGRAY, textAlign: 'center', maxWidth: 140, margin: 0 }}>
                  Run a scan or an SEO audit to unlock your full score
                </p>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <ScoreRing
                score={seoScore}
                label="SEO Health Score"
                sublabel={seoScore == null ? 'not yet audited' : seoFromScan ? 'from your latest scan' : 'technical + local + content'}
                size="md"
                color={seoScore != null ? (seoScore >= 70 ? GREEN : seoScore >= 50 ? AMBER : RED) : LGRAY}
              />
            </div>
          </div>

          {auditResult && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 24, paddingTop: 20, borderTop: `1px solid ${BORDER}` }}>
              {[
                { label: 'Technical SEO', score: auditResult.technicalScore, max: 40 },
                { label: 'Local SEO', score: auditResult.localScore, max: 35 },
                { label: 'Content', score: auditResult.contentScore, max: 25 },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center', background: BG, borderRadius: 10, padding: '12px' }}>
                  <p style={{ fontSize: 20, fontWeight: 800, color: s.score >= 70 ? GREEN : s.score >= 50 ? AMBER : RED, margin: 0 }}>{s.score}</p>
                  <p style={{ fontSize: 11, fontWeight: 600, color: NAVY, margin: '2px 0 0' }}>{s.label}</p>
                  <p style={{ fontSize: 10, color: LGRAY, margin: 0 }}>{s.max} pts max</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SEO HEALTH FROM YOUR LATEST SCAN (v1) — computed from stored scan
            data only: no new audit, no vendor API. Distinct from the URL
            audit's SEO Health Score below, which re-audits a URL on demand. */}
        {scanSeoLoaded && scanSeo && scanSeo.score != null && (
          <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 20, padding: '28px 32px', marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>From Your Latest Scan</p>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: NAVY, margin: '0 0 4px' }}>SEO Health — {scanSeo.businessName || 'your business'}</h2>
            <p style={{ fontSize: 13, color: GRAY, margin: '0 0 8px' }}>
              From your scan on {new Date(scanSeo.asOf).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} — no new audit needed. {scanSeo.evaluatedCount} checks evaluated.
            </p>
            {/* b8a8: the score's derivation was nowhere on the page (it is
                a weighted pass rate, so it matches neither the simple
                mean of the bucket scores nor the raw pass rate). */}
            <p style={{ fontSize: 12, color: GRAY, margin: '0 0 20px', lineHeight: 1.5 }}>
              How the score is computed: a weighted pass rate across the evaluated checks — pass = 1, partial = ½, fail = 0 — where each check is weighted by its impact points from Rankall&apos;s trust-signal definitions. Checks that were never evaluated are excluded, not scored 0. The score uses the data that scan collected (your website as analyzed during the scan, AI responses, and Google listing data); this page does not re-crawl your site. To audit a specific URL right now, use the Website Audit below.
            </p>

            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 20 }}>
              <ScoreRing
                score={scanSeo.score}
                label="SEO Health (from scan)"
                sublabel="stored scan data"
                size="md"
                color={scanSeo.score >= 70 ? GREEN : scanSeo.score >= 50 ? AMBER : RED}
              />
              <div style={{ flex: 1, minWidth: 260, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
                {scanSeo.buckets.map(b => (
                  <div key={b.name} style={{ background: BG, borderRadius: 10, padding: '12px', textAlign: 'center' }}>
                    <p style={{ fontSize: 20, fontWeight: 800, color: b.score == null ? LGRAY : b.score >= 70 ? GREEN : b.score >= 50 ? AMBER : RED, margin: 0 }}>
                      {b.score == null ? '—' : b.score}
                    </p>
                    <p style={{ fontSize: 11, fontWeight: 600, color: NAVY, margin: '2px 0 0' }}>{b.name}</p>
                    <p style={{ fontSize: 10, color: LGRAY, margin: 0 }}>
                      {b.score == null ? 'not checked' : `${b.evaluated} of ${b.total} checked`}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {scanSeo.checks.filter(c => c.status === 'fail' || c.status === 'partial').length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: '0 0 12px' }}>Needs attention</p>
                {[...scanSeo.checks]
                  .filter(c => c.status === 'fail' || c.status === 'partial')
                  .sort((a, b) => b.weight - a.weight)
                  .map(check => (
                    <div key={check.id} style={{ background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '14px 16px', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 7, marginBottom: 5 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>{check.name}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: check.evidence === 'measured' ? BLUE : AMBER, background: check.evidence === 'measured' ? '#ECEBFF' : '#FFFBEB', border: `1px solid ${check.evidence === 'measured' ? '#C9C6FF' : '#FCD34D'}`, borderRadius: 100, padding: '1px 8px' }}>
                          {check.evidence === 'measured' ? 'Measured' : 'Estimated from AI responses'}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: GRAY, background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 100, padding: '1px 8px' }}>{check.bucket}</span>
                      </div>
                      <p style={{ fontSize: 13, color: GRAY, margin: '0 0 8px', lineHeight: 1.5 }}>{check.detail}</p>
                      {check.fixAction && <p style={{ fontSize: 12, color: NAVY, margin: '0 0 8px', lineHeight: 1.5 }}>{check.fixAction}</p>}
                      {check.fixUrl ? (
                        <a href={check.fixUrl} style={{ fontSize: 12, fontWeight: 700, color: BLUE, textDecoration: 'none' }}>Fix in Fix Engine →</a>
                      ) : check.consequence ? (
                        <p style={{ fontSize: 12, color: GRAY, margin: 0, lineHeight: 1.5 }}>{check.consequence}</p>
                      ) : null}
                    </div>
                  ))}
              </div>
            )}

            {scanSeo.checks.filter(c => c.status === 'pass').length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: '0 0 12px' }}>{scanSeo.checks.filter(c => c.status === 'pass').length} checks passing</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                  {scanSeo.checks.filter(c => c.status === 'pass').map(check => (
                    <div key={check.id} style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 10, padding: '10px 12px' }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: NAVY, margin: '0 0 2px' }}>{check.name}</p>
                      <p style={{ fontSize: 11, color: GRAY, margin: 0, lineHeight: 1.4 }}>{check.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {scanSeo.excludedCount > 0 && (
              <p style={{ fontSize: 11, color: LGRAY, margin: '12px 0 0' }}>
                Community & AI-trust signals aren&apos;t counted here — they measure AI trust, not SEO. See the Trust page for those.
              </p>
            )}
          </div>
        )}

        {/* No usable scan data — honest empty state, never a fake score. */}
        {scanSeoLoaded && (!scanSeo || scanSeo.score == null) && (
          <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '28px 32px', marginBottom: 20, textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 6 }}>No scan yet — run a scan to see your SEO Health</p>
            <p style={{ fontSize: 13, color: GRAY, maxWidth: 460, margin: '0 auto 14px' }}>
              Your SEO Health score is computed from your latest scan&apos;s stored data — no new audit needed. Run a scan and it appears here.
            </p>
            <a href="/dashboard" style={{ fontSize: 13, fontWeight: 700, color: BLUE, textDecoration: 'none' }}>Go to Dashboard →</a>
          </div>
        )}

        {/* URL AUDIT */}
        <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 20, padding: '28px 32px', marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Website Audit</p>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: NAVY, marginBottom: 16 }}>Run your SEO Health audit</h2>

          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runAudit()}
              placeholder="https://yourbusiness.com"
              style={{ flex: 1, border: `1.5px solid ${auditing ? BLUE : BORDER}`, borderRadius: 10, padding: '11px 14px', fontSize: 14, color: NAVY, fontFamily: 'inherit', outline: 'none', background: BG }}
            />
            <button
              onClick={runAudit}
              disabled={auditing || !url.trim()}
              style={{ background: auditing ? GRAY : NAVY, border: 'none', borderRadius: 10, padding: '11px 22px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: auditing ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}
            >
              {auditing ? (
                <>
                  <div style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  Auditing...
                </>
              ) : (<>Run SEO Audit <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>)}
            </button>
          </div>
          {auditError && <p style={{ fontSize: 13, color: RED, marginTop: 10 }}>{auditError}</p>}

          {auditing && (
            <div style={{ marginTop: 20, padding: '16px 20px', background: '#ECEBFF', border: '1px solid #C9C6FF', borderRadius: 12 }}>
              <p style={{ fontSize: 13, color: BLUE, margin: 0, fontWeight: 600 }}>Auditing your website...</p>
              <p style={{ fontSize: 12, color: LGRAY, margin: '4px 0 0' }}>Fetching page content, running PageSpeed analysis, checking structured data...</p>
            </div>
          )}
        </div>

        {/* AUDIT RESULTS */}
        {auditResult && (
          <>
            {/* Core Web Vitals */}
            {(auditResult.pageSpeed.lcp || auditResult.pageSpeed.cls || auditResult.pageSpeed.fcp) && (
              <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '20px 24px', marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Core Web Vitals</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
                  {[
                    { label: 'LCP', value: auditResult.pageSpeed.lcp, metric: 'lcp' as const, desc: 'Largest Contentful Paint' },
                    { label: 'CLS', value: auditResult.pageSpeed.cls, metric: 'cls' as const, desc: 'Cumulative Layout Shift' },
                    { label: 'FCP', value: auditResult.pageSpeed.fcp, metric: 'fcp' as const, desc: 'First Contentful Paint' },
                    { label: 'Mobile', value: auditResult.pageSpeed.mobile != null ? `${auditResult.pageSpeed.mobile}/100` : null, metric: 'lcp' as const, desc: 'PageSpeed mobile' },
                    { label: 'Desktop', value: auditResult.pageSpeed.desktop != null ? `${auditResult.pageSpeed.desktop}/100` : null, metric: 'lcp' as const, desc: 'PageSpeed desktop' },
                  ].filter(v => v.value != null).map(v => {
                    const col = vitalColor(v.value, v.metric)
                    return (
                      <div key={v.label} style={{ background: BG, borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                        <p style={{ fontSize: 18, fontWeight: 800, color: col, margin: 0 }}>{v.value}</p>
                        <p style={{ fontSize: 11, fontWeight: 700, color: NAVY, margin: '2px 0 0' }}>{v.label}</p>
                        <p style={{ fontSize: 10, color: LGRAY, margin: 0 }}>{v.desc}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Failing checks */}
            {failingChecks.length > 0 && (
              <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 20, padding: '24px 28px', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: RED }} />
                  <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: 0 }}>
                    {failingChecks.length} fix{failingChecks.length > 1 ? 'es' : ''} needed
                  </p>
                  <span style={{ fontSize: 11, color: LGRAY }}>ranked by impact</span>
                </div>

                {[...failingChecks]
                  .sort((a, b) => b.maxPoints - a.maxPoints)
                  .map(check => {
                    const fix = fixResults[check.id]
                    const isFixed = markedFixed.has(check.id)
                    const isGenerating = generating === check.id

                    return (
                      <div
                        key={check.id}
                        style={{
                          background: isFixed ? '#ECFDF5' : BG,
                          border: `1.5px solid ${isFixed ? '#A7F3D0' : BORDER}`,
                          borderRadius: 14,
                          padding: '16px 18px',
                          marginBottom: 10,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>{isFixed ? <svg viewBox="0 0 512 512" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg> : <svg viewBox="0 0 512 512" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM175 175c9.4-9.4 24.6-9.4 33.9 0l47 47 47-47c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-47 47 47 47c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-47-47-47 47c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l47-47-47-47c-9.4-9.4-9.4-24.6 0-33.9z"/></svg>}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 7, marginBottom: 5 }}>
                              <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>{check.name}</span>
                              <span style={{ background: '#F0FDF4', border: '1px solid #A7F3D0', borderRadius: 100, padding: '1px 8px', fontSize: 10, fontWeight: 700, color: GREEN }}>
                                +{check.maxPoints}pts
                              </span>
                            </div>
                            <p style={{ fontSize: 13, color: GRAY, margin: '0 0 8px', lineHeight: 1.5 }}>{check.value}</p>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                              <ImpactBadge label="SEO" impact={check.seoImpact} type="seo" />
                              <ImpactBadge label="AI" impact={check.aiImpact} type="ai" />
                            </div>

                            {!isFixed && (
                              <button
                                onClick={() => generateFix(check)}
                                disabled={!!isGenerating}
                                style={{
                                  background: fix ? 'none' : NAVY,
                                  border: fix ? `1.5px solid ${BORDER}` : 'none',
                                  borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700,
                                  color: fix ? NAVY : '#fff', cursor: isGenerating ? 'not-allowed' : 'pointer',
                                  fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6,
                                }}
                              >
                                {isGenerating ? (
                                  <>
                                    <div style={{ width: 10, height: 10, border: '2px solid rgba(0,0,0,0.15)', borderTop: '2px solid currentColor', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                                    Generating...
                                  </>
                                ) : fix ? (<><svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M105.1 202.6c7.7-21.8 20.2-42.3 37.8-59.8c62.5-62.5 163.8-62.5 226.3 0L386.3 160 352 160c-17.7 0-32 14.3-32 32s14.3 32 32 32l111.5 0c0 0 0 0 0 0l.4 0c17.7 0 32-14.3 32-32l0-112c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 35.2L414.4 97.6c-87.5-87.5-229.3-87.5-316.8 0C73.2 122 55.6 150.7 44.8 181.4c-5.9 16.7 2.9 34.9 19.5 40.8s34.9-2.9 40.8-19.5zM39 289.3c-5 1.5-9.8 4.2-13.7 8.2c-4 4-6.7 8.8-8.1 14c-.3 1.2-.6 2.5-.8 3.8c-.3 1.7-.4 3.4-.4 5.1L16 432c0 17.7 14.3 32 32 32s32-14.3 32-32l0-35.1 17.6 17.5c0 0 0 0 0 0c87.5 87.4 229.3 87.4 316.7 0c24.4-24.4 42.1-53.1 52.9-83.8c5.9-16.7-2.9-34.9-19.5-40.8s-34.9 2.9-40.8 19.5c-7.7 21.8-20.2 42.3-37.8 59.8c-62.5 62.5-163.8 62.5-226.3 0l-.1-.1L125.6 352l34.4 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L48.4 288c-1.6 0-3.2 .1-4.8 .3s-3.1 .5-4.6 1z"/></svg>{' '}Regenerate</>) : (<><svg viewBox="0 0 576 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M234.7 42.7L197 56.8c-3 1.1-5 4-5 7.2s2 6.1 5 7.2l37.7 14.1L248.8 123c1.1 3 4 5 7.2 5s6.1-2 7.2-5l14.1-37.7L315 71.2c3-1.1 5-4 5-7.2s-2-6.1-5-7.2L277.3 42.7 263.2 5c-1.1-3-4-5-7.2-5s-6.1 2-7.2 5L234.7 42.7zM46.1 395.4c-18.7 18.7-18.7 49.1 0 67.9l34.6 34.6c18.7 18.7 49.1 18.7 67.9 0L529.9 116.5c18.7-18.7 18.7-49.1 0-67.9L495.3 14.1c-18.7-18.7-49.1-18.7-67.9 0L46.1 395.4zM484.6 82.6l-105 105-23.3-23.3 105-105 23.3 23.3zM7.5 117.2C3 118.9 0 123.2 0 128s3 9.1 7.5 10.8L64 160l21.2 56.5c1.7 4.5 6 7.5 10.8 7.5s9.1-3 10.8-7.5L128 160l56.5-21.2c4.5-1.7 7.5-6 7.5-10.8s-3-9.1-7.5-10.8L128 96 106.8 39.5C105.1 35 100.8 32 96 32s-9.1 3-10.8 7.5L64 96 7.5 117.2zm352 256c-4.5 1.7-7.5 6-7.5 10.8s3 9.1 7.5 10.8L416 416l21.2 56.5c1.7 4.5 6 7.5 10.8 7.5s9.1-3 10.8-7.5L480 416l56.5-21.2c4.5-1.7 7.5-6 7.5-10.8s-3-9.1-7.5-10.8L480 352l-21.2-56.5c-1.7-4.5-6-7.5-10.8-7.5s-9.1 3-10.8 7.5L416 352l-56.5 21.2z"/></svg>{' '}Fix With AI <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>)}
                              </button>
                            )}
                            {fixErrors[check.id] && (
                              <p style={{ fontSize: 12, color: RED, margin: '8px 0 0' }}>{fixErrors[check.id]}</p>
                            )}

                            {fix && !isFixed && (
                              <div style={{ marginTop: 12 }}>
                                {/* Generated content */}
                                <div style={{ background: NAVY, borderRadius: 12, padding: '16px 18px', marginBottom: 10 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: '#93C5FD', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Generated Fix</span>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                      <button
                                        onClick={() => copyFix(check.id, fix.content)}
                                        style={{ background: copiedId === check.id ? '#059669' : BLUE, border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
                                      >
                                        {copiedId === check.id ? (<><svg viewBox="0 0 448 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>{' '}Copied!</>) : (<>Copy <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>)}
                                      </button>
                                      {copyErrorId === check.id && (
                                        <span style={{ fontSize: 11, color: '#FCA5A5', alignSelf: 'center' }}>Copy failed — select the text manually.</span>
                                      )}
                                      <button
                                        onClick={() => setMarkedFixed(prev => new Set([...prev, check.id]))}
                                        style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, padding: '5px 12px', fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
                                      >
                                        <svg viewBox="0 0 448 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> Mark Fixed
                                      </button>
                                    </div>
                                  </div>
                                  <pre style={{ fontSize: 12, color: '#E2E8F0', lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontFamily: 'monospace' }}>
                                    {fix.content}
                                  </pre>
                                </div>

                                {/* Instructions */}
                                <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 10, padding: '12px 16px', marginBottom: 8 }}>
                                  <p style={{ fontSize: 11, fontWeight: 700, color: AMBER, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>How to apply</p>
                                  <pre style={{ fontSize: 12, color: NAVY, lineHeight: 1.8, whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>{fix.instructions}</pre>
                                </div>

                                {/* Expected impact */}
                                <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '10px 14px' }}>
                                  <p style={{ fontSize: 11, fontWeight: 700, color: GREEN, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Expected Impact</p>
                                  <p style={{ fontSize: 12, color: NAVY, margin: 0, lineHeight: 1.6 }}>{fix.impact}</p>
                                </div>
                              </div>
                            )}

                            {isFixed && (
                              <p style={{ fontSize: 12, color: GREEN, fontWeight: 600, marginTop: 6 }}>
                                <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> Marked as fixed — rescan in 7–14 days to see score improvement
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}

            {/* Passing checks */}
            {passingChecks.length > 0 && (
              <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 20, padding: '24px 28px', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: GREEN }} />
                  <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: 0 }}>{passingChecks.length} checks passing</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                  {passingChecks.map(check => (
                    <div
                      key={check.id}
                      style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'flex-start', gap: 8 }}
                    >
                      <span style={{ flexShrink: 0, marginTop: 1 }}><svg viewBox="0 0 512 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg></span>
                      <div>
                        <p style={{ fontSize: 12, fontWeight: 700, color: NAVY, margin: '0 0 2px' }}>{check.name}</p>
                        <p style={{ fontSize: 11, color: GRAY, margin: 0, lineHeight: 1.4 }}>{check.value.slice(0, 80)}{check.value.length > 80 ? '…' : ''}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Empty state */}
        {!auditResult && !auditing && (
          <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '32px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <p style={{ fontSize: 32, marginBottom: 12 }}><svg viewBox="0 0 512 512" width="32" height="32" fill="currentColor" aria-hidden="true"><path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/></svg></p>
            <p style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 6 }}>Enter your website URL above to run your SEO audit</p>
            <p style={{ fontSize: 13, color: GRAY, maxWidth: 420, margin: '0 auto' }}>
              We check title tags, meta descriptions, schema markup, page speed, Google Business data, reviews, and more — then generate the exact code to fix each issue.
            </p>
          </div>
        )}

      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
    </PlanPageGuard>
  )
}
