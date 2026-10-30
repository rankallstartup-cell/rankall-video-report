'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getBrowserClient } from '@/lib/supabase'
import { usePlan } from '@/lib/usePlan'
import { PlanPageGuard } from '@/components/PlanPageGuard'
import { calculateSimulation, type SimulatorFix, type SimulatorOutput } from '@/lib/simulator'
import { scanRevenueEstimate } from '@/lib/revenueModel'
import { gradeLabel } from '@/lib/projection'


const DEFAULT_FIXES: SimulatorFix[] = [
  { id: 'faq_schema',           title: 'Add FAQ schema markup',     fix_type: 'faq_schema' },
  { id: 'directory_citations',  title: 'Build directory citations', fix_type: 'directory_citations' },
  { id: 'review_velocity',      title: 'Increase review velocity',  fix_type: 'review_velocity' },
  { id: 'content_optimization', title: 'Optimize website content',  fix_type: 'content_optimization' },
  { id: 'trust_signals',        title: 'Strengthen trust signals',  fix_type: 'trust_signals' },
]

// ── b35r: b35q design tokens (Overview v2 mockup) on staging logic ──
const BG     = '#F6F6FB'
const W      = '#FFFFFF'
const NAVY   = '#0A0A14'
const BORDER = '#E7E7F0'
const BLUE   = '#1B17FF'
const PURPLE = '#7C3AED' // agency accent — projections + Client View (unchanged value)
const GREEN  = '#12A150'
const GREEN_DARK = '#0B6B37'
const GREEN_BG = '#E3F6EC'
const AMBER  = '#D97706'
const RED    = '#B4232A'
const RED_X  = '#D92D20'
const RED_BG = '#FDECEC'
const GRAY   = '#55556A'
const LGRAY  = '#94A3B8'
const MUTED  = '#5F5F78'
const MONO   = 'var(--font-geist-mono),ui-monospace,Menlo,monospace'
const TINT_BORDER = '#DCDAFF'
const FIX_BG = '#F4F3FF'

type KPStatus = 'verified' | 'unclaimed' | string

interface AgencyClient {
  id: string
  business_name: string | null
  client_name: string | null
  industry: string | null
  city: string | null
  latest_score: number | null
  score_trend: number | null
  kp_status: KPStatus | null
  last_scanned_at: string | null
  scan_id: string | null
  contact_email: string | null
}

type FilterType = 'all' | 'at-risk' | 'improved' | 'attention'

// Grade bands: the ONE table in lib/projection (gradeLabel); colours only here.
const BADGE_COLORS: Record<string, { bg: string; color: string }> = {
  Dominant: { bg: '#D1FAE5', color: '#065F46' },
  Strong: { bg: '#DCFCE7', color: '#166534' },
  Visible: { bg: '#DBEAFE', color: '#1E40AF' },
  Emerging: { bg: '#FEF3C7', color: '#92400E' },
  'Not Visible': { bg: '#FEE2E2', color: '#991B1B' },
}
function scoreBadge(score: number | null) {
  if (score === null) return { bg: '#F1F5F9', color: LGRAY, label: 'N/A' }
  const label = gradeLabel(score)
  return { ...(BADGE_COLORS[label] ?? BADGE_COLORS['Not Visible']), label }
}

function trendArrow(trend: number | null) {
  if (trend === null) return { arrow: '→', color: LGRAY }
  if (trend > 2)  return { arrow: '↑', color: GREEN }
  if (trend < -2) return { arrow: '↓', color: RED_X }
  return { arrow: '→', color: LGRAY }
}

function kpLabel(status: KPStatus | null) {
  if (status === 'verified')  return (<><svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg> Verified</>)
  if (status === 'unclaimed') return (<><svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg> Unclaimed</>)
  return (<><svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM175 175c9.4-9.4 24.6-9.4 33.9 0l47 47 47-47c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-47 47 47 47c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-47-47-47 47c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l47-47-47-47c-9.4-9.4-9.4-24.6 0-33.9z"/></svg> Missing</>)
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const INDUSTRIES = ['dentist', 'lawyer', 'hvac', 'restaurant', 'medical', 'real_estate', 'gym', 'salon', 'plumber', 'electrician', 'auto_repair', 'other']
const COUNTRIES  = ['US', 'GB', 'AU', 'CA', 'IN', 'AE']

// business_name is canonical; fall back to legacy client_name.
function displayName(c: AgencyClient): string {
  return c.business_name || c.client_name || 'Unnamed Client'
}

export default function AgencyDashboard() {
  const [clients, setClients]               = useState<AgencyClient[]>([])
  const [loading, setLoading]               = useState(true)
  const [filter, setFilter]                 = useState<FilterType>('all')
  const [sort, setSort]                     = useState<string>('name')
  const [search, setSearch]                 = useState('')
  const [showAddModal, setShowAddModal]     = useState(false)
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set())
  const [showContextSwitcher, setShowContextSwitcher] = useState(false)
  const [scanning, setScanning]             = useState<Set<string>>(new Set())
  const [removing, setRemoving]             = useState<Set<string>>(new Set())
  const [projections, setProjections]       = useState<Record<string, SimulatorOutput>>({})
  // Clients whose recovery figure comes from a measured scan (mention count).
  // Others show '—' rather than a revenue number built from defaults.
  const [revenueMeasured, setRevenueMeasured] = useState<Set<string>>(new Set())
  const [actionError, setActionError]       = useState('')
  // b89a: sign-in + Agency-plan gates (neither existed; the proxy
  // redirect is the primary logged-out gate).
  const { plan, rawPlan, loading: planLoading } = usePlan()
  const [signedIn, setSignedIn] = useState<boolean | null>(null)

  // Agency Client View (Phase 4.1): per-fix client-facing explanations.
  const [explainClient, setExplainClient] = useState<AgencyClient | null>(null)
  type ExplainData = { explainToClient: string; clientSummary: string; implementationOwner: string; estimatedEffort: string; estimatedVisibilityImpact: string; loading?: boolean }
  const [explainData, setExplainData] = useState<Record<string, ExplainData>>({})
  const [ownerOverride, setOwnerOverride] = useState<Record<string, string>>({})
  const [copiedFix, setCopiedFix] = useState<string | null>(null)

  function openClientView(c: AgencyClient) {
    setExplainData({})
    setOwnerOverride({})
    setExplainClient(c)
  }

  async function loadExplain(client: AgencyClient, fixType: string) {
    setExplainData(prev => ({ ...prev, [fixType]: { ...(prev[fixType] ?? { explainToClient: '', clientSummary: '', implementationOwner: '', estimatedEffort: '', estimatedVisibilityImpact: '' }), loading: true } }))
    try {
      const res = await fetch('/api/agency/explain-fix', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixType, businessName: displayName(client), industry: client.industry, city: client.city }),
      })
      const d = await res.json()
      if (res.ok) {
        setExplainData(prev => ({ ...prev, [fixType]: { explainToClient: d.explainToClient, clientSummary: d.clientSummary, implementationOwner: d.implementationOwner, estimatedEffort: d.estimatedEffort, estimatedVisibilityImpact: d.estimatedVisibilityImpact } }))
        setOwnerOverride(prev => ({ ...prev, [fixType]: prev[fixType] ?? d.implementationOwner }))
      } else {
        setExplainData(prev => ({ ...prev, [fixType]: { ...prev[fixType], loading: false } }))
      }
    } catch {
      setExplainData(prev => ({ ...prev, [fixType]: { ...prev[fixType], loading: false } }))
    }
  }

  // Add client form state
  const [addForm, setAddForm] = useState({
    businessName: '', industry: 'dentist', city: '', state: '',
    country: 'US', contactEmail: '', notes: '',
  })
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError]     = useState('')

  async function fetchClients() {
    const supabase = getBrowserClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSignedIn(false); setLoading(false); return }
    setSignedIn(true)

    const { data, error } = await supabase
      .from('agency_clients')
      .select('id, business_name, client_name, industry, city, latest_score, score_trend, kp_status, last_scanned_at, scan_id, contact_email')
      .eq('agency_user_id', user.id)
      .order('created_at', { ascending: false })

    if (!error && data) setClients(data as AgencyClient[])
    setLoading(false)
  }

  useEffect(() => {
    fetchClients()
  }, [])

  // Stats
  const totalClients    = clients.length
  const avgScore        = clients.length ? Math.round(clients.reduce((s, c) => s + (c.latest_score ?? 0), 0) / clients.length) : 0
  const improvedCount   = clients.filter(c => (c.score_trend ?? 0) > 0).length
  const needAttention   = clients.filter(c => (c.latest_score ?? 100) < 50).length

  // Filter + search + sort
  const filtered = clients
    .filter(c => {
      if (filter === 'at-risk')   return (c.latest_score ?? 100) < 40
      if (filter === 'improved')  return (c.score_trend ?? 0) > 2
      if (filter === 'attention') return (c.latest_score ?? 100) < 50
      return true
    })
    .filter(c => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        displayName(c).toLowerCase().includes(q) ||
        c.city?.toLowerCase().includes(q) ||
        c.industry?.toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      if (sort === 'score-desc') return (b.latest_score ?? 0) - (a.latest_score ?? 0)
      if (sort === 'score-asc')  return (a.latest_score ?? 0) - (b.latest_score ?? 0)
      if (sort === 'trend')      return (b.score_trend ?? 0) - (a.score_trend ?? 0)
      if (sort === 'scanned')    return (b.last_scanned_at ?? '').localeCompare(a.last_scanned_at ?? '')
      if (sort === 'opportunity') {
        const opp = (c: AgencyClient) => {
          const p = projections[c.id]
          return p ? p.projectedScoreMid - p.currentScore : -1
        }
        return opp(b) - opp(a)
      }
      return displayName(a).localeCompare(displayName(b))
    })

  function toggleSelect(id: string) {
    setSelectedClients(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedClients.size === filtered.length) {
      setSelectedClients(new Set())
    } else {
      setSelectedClients(new Set(filtered.map(c => c.id)))
    }
  }

  async function handleScanNow(clientId: string) {
    setScanning(prev => new Set(prev).add(clientId))
    try {
      const supabase = getBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('/api/agency/rescan-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ client_id: clientId }),
      })
      await fetchClients()
    } finally {
      setScanning(prev => { const next = new Set(prev); next.delete(clientId); return next })
    }
  }

  async function handleRemove(clientId: string) {
    if (!confirm('Remove this client from your agency account?')) return
    setRemoving(prev => new Set(prev).add(clientId))
    try {
      const supabase = getBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/agency/remove-client', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ client_id: clientId }),
      })
      // b01u: only drop the row when the server actually removed it — the
      // old code ignored res.ok, so a failed delete vanished from the list
      // and reappeared on reload.
      if (!res.ok) {
        const json = await res.json().catch(() => ({} as { error?: string }))
        setActionError(json.error || 'Could not remove this client. Please try again.')
        return
      }
      setActionError('')
      setClients(prev => prev.filter(c => c.id !== clientId))
      setSelectedClients(prev => { const next = new Set(prev); next.delete(clientId); return next })
    } finally {
      setRemoving(prev => { const next = new Set(prev); next.delete(clientId); return next })
    }
  }

  async function handleBulkRescan() {
    for (const id of selectedClients) await handleScanNow(id)
  }

  // ax80: projections from REAL data only. The old version fed every client
  // a hardcoded competitor score (62), 3 platforms, a $3,500 gap and a
  // fallback score of 35. Now: clients without a measured score get no
  // projection; the revenue gap comes from the client scan's real mention
  // count via the one revenue model (lib/revenueModel), in its currency.
  async function runProjections() {
    const scanIds = clients.map(c => c.scan_id).filter((id): id is string => !!id)
    const scanById = new Map<string, { mentioned_count: number | null; country_code: string | null; industry: string | null }>()
    if (scanIds.length > 0) {
      try {
        const { data } = await getBrowserClient()
          .from('rankall_scans')
          .select('id, mentioned_count, country_code, industry')
          .in('id', scanIds)
        for (const r of (data ?? []) as Array<{ id: string; mentioned_count: number | null; country_code: string | null; industry: string | null }>) {
          scanById.set(r.id, r)
        }
      } catch { /* projections still run; revenue shows '—' */ }
    }
    const next: Record<string, SimulatorOutput> = {}
    const measured = new Set<string>()
    for (const c of clients) {
      if (typeof c.latest_score !== 'number') continue
      const scan = c.scan_id ? scanById.get(c.scan_id) : undefined
      const mentioned = typeof scan?.mentioned_count === 'number' ? scan.mentioned_count : null
      const estimate = scanRevenueEstimate({
        mentionedCount: mentioned,
        totalPlatforms: 12,
        industry: scan?.industry ?? c.industry,
        countryCode: scan?.country_code ?? 'US',
      })
      if (estimate) measured.add(c.id)
      next[c.id] = calculateSimulation({
        currentScore: c.latest_score,
        industry: c.industry ?? 'other',
        city: c.city ?? '',
        countryCode: scan?.country_code ?? 'US',
        competitorScore: null,
        platformsCovered: mentioned ?? 0,
        fixes: DEFAULT_FIXES,
        revenueGap: estimate?.gap ?? 0,
        revenueSymbol: estimate?.symbol ?? '$',
      })
    }
    setProjections(next)
    setRevenueMeasured(measured)
  }

  // b01u: Export Reports linked to a non-existent /api/agency/export-reports.
  // Minimal real export: a CSV of the selected clients' measured data,
  // built client-side from the rows already loaded.
  function exportSelectedCsv() {
    const esc = (v: unknown) => {
      const t = v == null ? '' : String(v)
      return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
    }
    const rows = clients.filter(c => selectedClients.has(c.id))
    const header = ['Business', 'Industry', 'City', 'AI visibility score', 'Score trend', 'Knowledge panel', 'Last scanned', 'Report URL']
    const lines = rows.map(c => [
      displayName(c), c.industry, c.city, c.latest_score, c.score_trend, c.kp_status, c.last_scanned_at,
      c.scan_id ? `${window.location.origin}/report/${c.scan_id}` : '',
    ].map(esc).join(','))
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rankall-clients-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const hasProjections = Object.keys(projections).length > 0

  async function handleAddClient(e: React.FormEvent) {
    e.preventDefault()
    if (!addForm.businessName.trim()) { setAddError('Business name is required'); return }
    if (!addForm.city.trim()) { setAddError('City is required'); return }
    setAddLoading(true); setAddError('')
    try {
      const supabase = getBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/agency/add-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          business_name: addForm.businessName,
          industry:      addForm.industry,
          city:          addForm.city,
          state:         addForm.state,
          country_code:  addForm.country,
          contact_email: addForm.contactEmail,
          notes:         addForm.notes,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setAddError(json.error || 'Failed to add client'); return }
      setShowAddModal(false)
      setAddForm({ businessName: '', industry: 'dentist', city: '', state: '', country: 'US', contactEmail: '', notes: '' })
      await fetchClients()
    } catch {
      setAddError('Network error — please try again')
    } finally {
      setAddLoading(false)
    }
  }

  const statCard = (label: string, value: string | number, sub?: string) => (
    <div className="card dash-card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="lbl">{label}</span>
      <span style={{ fontSize: 'clamp(24px,2.4vw,30px)', fontWeight: 700, color: NAVY }}>{value}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  )

  if (planLoading || signedIn === null) {
    return <div style={{ padding: 40, color: GRAY, fontFamily: 'system-ui, sans-serif' }}>Loading…</div>
  }
  if (signedIn === false) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>Sign in to view your Agency Dashboard.</p>
        <p style={{ fontSize: 13, color: GRAY, margin: '0 0 16px' }}>Manage all your client accounts from one place.</p>
        <Link href="/login?next=/dashboard/agency" style={{ color: BLUE, fontWeight: 700, fontSize: 14 }}>Sign in</Link>
      </div>
    )
  }

  return (
    <PlanPageGuard feature="canSeeAgency" requiredPlan="agency">
    <div style={{ minHeight: '100vh', background: BG, padding: '32px 32px 64px' }}>{/* TOP BAR */}
      <header className="pagehead">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, letterSpacing: '-0.035em' }}>Agency Dashboard</h1>
          <span style={{ fontSize: 14, color: GRAY }}>Manage all your client accounts from one place</span>
        </div>
        <div className="toolbar">
          {/* Context Switcher */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowContextSwitcher(v => !v)}
              className="btn btn-line"
            >
              Agency View <svg viewBox="0 0 320 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M137.4 374.6c12.5 12.5 32.8 12.5 45.3 0l128-128c9.2-9.2 11.9-22.9 6.9-34.9s-16.6-19.8-29.6-19.8L32 192c-12.9 0-24.6 7.8-29.6 19.8s-2.2 25.7 6.9 34.9l128 128z"/></svg>
            </button>
            {showContextSwitcher && (
              <div style={{ position: 'absolute', right: 0, top: '110%', background: W, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '6px 0', zIndex: 20, minWidth: 160, boxShadow: '0 8px 32px rgba(27,23,255,0.15)' }}>
                <Link href="/dashboard" style={{ display: 'block', padding: '9px 16px', fontSize: 13, color: GRAY, textDecoration: 'none', fontWeight: 500 }}>My Dashboard</Link>
                <div style={{ padding: '9px 16px', fontSize: 13, color: BLUE, fontWeight: 700, background: FIX_BG }}>Agency View</div>
              </div>
            )}
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn btn-blue"
          >
            + Add Client
          </button>
        </div>
      </header>

      {/* STATS ROW */}
      <section className="g4">
        {statCard('Total Clients', totalClients)}
        {statCard('Avg Score', `${avgScore}`, '/100')}
        {statCard('Improved This Week', improvedCount, 'score trend > 0')}
        {statCard('Need Attention', needAttention, 'score < 50')}
      </section>

      {/* FILTER / SORT / SEARCH BAR */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['all', 'at-risk', 'improved', 'attention'] as FilterType[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? BLUE : W,
              color: filter === f ? W : GRAY,
              border: `1px solid ${filter === f ? BLUE : BORDER}`,
              borderRadius: 12, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {f === 'all' ? 'All Clients' : f === 'at-risk' ? 'At Risk' : f === 'improved' ? 'Improved' : 'Need Attention'}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <button
            onClick={runProjections}
            style={{ background: PURPLE, color: W, border: 'none', borderRadius: 12, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {hasProjections ? 'Refresh Projections' : 'Run Projections for All Clients'}
          </button>
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            style={{ background: W, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '7px 12px', fontSize: 12, color: NAVY, cursor: 'pointer' }}
          >
            <option value="name">Sort: Name</option>
            <option value="score-desc">Sort: Score ↓</option>
            <option value="score-asc">Sort: Score ↑</option>
            <option value="trend">Sort: Trend</option>
            <option value="scanned">Sort: Last Scanned</option>
            {hasProjections && <option value="opportunity">Sort: Biggest Opportunity</option>}
          </select>
          <input
            type="search"
            placeholder="Search clients…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ background: W, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '7px 14px', fontSize: 13, color: NAVY, width: 200 }}
          />
        </div>
      </div>

      {actionError && (
        <div role="alert" style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: RED, borderRadius: 14, padding: '12px 16px', fontSize: 13, fontWeight: 600 }}>
          {actionError}
        </div>
      )}

      {/* BULK ACTIONS */}
      {selectedClients.size > 0 && (
        <div style={{ background: NAVY, borderRadius: 14, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: W }}>{selectedClients.size} selected</span>
          <button onClick={handleBulkRescan} style={{ background: BLUE, color: W, border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            Rescan Selected
          </button>
          <button
            onClick={exportSelectedCsv}
            style={{ background: GREEN, color: W, border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            Export CSV
          </button>
          {/* b01u: the weekly-summary button was REMOVED — its API route
              never existed, so the button 404'd silently (fire-and-forget).
              The admin all-users route is NOT a substitute: it is admin-only
              and ignores client_ids. A real per-client summary needs a
              dedicated route; weekly-email work lives in the Marketing track. */}
          <button
            onClick={() => setSelectedClients(new Set())}
            style={{ background: 'none', color: LGRAY, border: 'none', fontSize: 12, cursor: 'pointer', marginLeft: 'auto' }}
          >
            Clear
          </button>
        </div>
      )}

      {/* CLIENT TABLE */}
      <div className="dash-card" style={{ background: W, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: LGRAY, fontSize: 14 }}>Loading clients…</div>
        ) : clients.length === 0 ? (
          <div style={{ padding: 56, textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>
            <p style={{ fontSize: 22, fontWeight: 700, color: NAVY, margin: '0 0 18px', letterSpacing: '-0.01em' }}>Welcome to Agency Dashboard <svg viewBox="0 0 512 512" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 208c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-176c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 272c0 1.5 0 3.1 .1 4.6L67.6 283c-16-15.2-41.3-14.6-56.6 1.4s-14.6 41.3 1.4 56.6L124.8 448c43.1 41.1 100.4 64 160 64l19.2 0c97.2 0 176-78.8 176-176l0-208c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 112c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-176c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 176c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-208z"/></svg></p>
            <div style={{ textAlign: 'left', display: 'inline-block', margin: '0 auto 24px' }}>
              <p style={{ fontSize: 14, color: NAVY, margin: '0 0 10px', fontWeight: 600 }}>Step 1: Add your first client</p>
              <p style={{ fontSize: 14, color: NAVY, margin: '0 0 10px', fontWeight: 600 }}>Step 2: Their AI visibility scans automatically</p>
              <p style={{ fontSize: 14, color: NAVY, margin: '0 0 10px', fontWeight: 600 }}>Step 3: Generate their PDF report</p>
              <p style={{ fontSize: 14, color: NAVY, margin: 0, fontWeight: 600 }}>Step 4: Send them their results</p>
            </div>
            <div>
                <button onClick={() => setShowAddModal(true)} className="btn btn-blue">
                + Add Your First Client <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 64, textAlign: 'center' }}>
            <p style={{ fontSize: 32, margin: '0 0 12px' }}><svg viewBox="0 0 512 512" width="32" height="32" fill="currentColor" aria-hidden="true"><path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/></svg></p>
            <p style={{ fontSize: 16, fontWeight: 700, color: NAVY, margin: '0 0 6px' }}>No clients match your filters</p>
            <p style={{ fontSize: 13, color: GRAY, margin: 0 }}>Try adjusting your search or filter.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORDER}`, background: BG }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', width: 40 }}>
                    <input
                      type="checkbox"
                      checked={selectedClients.size === filtered.length && filtered.length > 0}
                      onChange={toggleSelectAll}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                  {[
                    'Business Name', 'Industry', 'City', 'Score', 'Trend', 'KP Status', 'Last Scanned',
                    ...(hasProjections ? ['Projected', 'Recovery'] : []),
                    'Actions',
                  ].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => {
                  const badge  = scoreBadge(c.latest_score)
                  const trend  = trendArrow(c.score_trend)
                  const isScanning = scanning.has(c.id)
                  const isRemoving = removing.has(c.id)
                  return (
                    <tr
                      key={c.id}
                      style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${BORDER}` : 'none', background: selectedClients.has(c.id) ? FIX_BG : W, transition: 'background 0.1s' }}
                    >
                      <td style={{ padding: '14px 16px' }}>
                        <input type="checkbox" checked={selectedClients.has(c.id)} onChange={() => toggleSelect(c.id)} style={{ cursor: 'pointer' }} />
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: 0 }}>{displayName(c)}</p>
                        {c.contact_email && <p style={{ fontSize: 11, color: LGRAY, margin: '2px 0 0' }}>{c.contact_email}</p>}
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: GRAY, textTransform: 'capitalize' }}>
                        {c.industry?.replace('_', ' ') || '—'}
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: GRAY }}>
                        {c.city || '—'}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ background: badge.bg, color: badge.color, borderRadius: 100, padding: '3px 10px', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          {c.latest_score !== null ? c.latest_score : '—'}
                          <span style={{ fontSize: 10, opacity: 0.8 }}>{badge.label}</span>
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: 18, color: trend.color, fontWeight: 700 }}>
                        {trend.arrow}
                        {c.score_trend !== null && c.score_trend !== 0 && (
                          <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 2 }}>
                            {c.score_trend > 0 ? '+' : ''}{c.score_trend}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: 13 }}>{kpLabel(c.kp_status)}</td>
                      <td style={{ padding: '14px 16px', fontSize: 12, color: LGRAY, whiteSpace: 'nowrap' }}>
                        {formatDate(c.last_scanned_at)}
                      </td>
                      {hasProjections && (() => {
                        const p = projections[c.id]
                        const gain = p ? p.projectedScoreMid - p.currentScore : 0
                        return (
                          <>
                            <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                              {p ? (
                                <span style={{ fontSize: 13, fontWeight: 800, color: PURPLE }}>
                                  {p.projectedScoreMid}
                                  <span style={{ fontSize: 11, fontWeight: 700, color: GREEN, marginLeft: 5 }}>+{gain}</span>
                                </span>
                              ) : '—'}
                            </td>
                            <td style={{ padding: '14px 16px', fontSize: 13, fontWeight: 700, color: GREEN, whiteSpace: 'nowrap' }}>
                              {p && revenueMeasured.has(c.id) ? `est. ${p.revenueSymbol}${p.revenueRecoveredAnnual.toLocaleString()}/yr` : '—'}
                            </td>
                          </>
                        )
                      })()}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }}>
                          <button
                            onClick={() => handleScanNow(c.id)}
                            disabled={isScanning}
                            style={{ background: BLUE, color: W, border: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 700, cursor: isScanning ? 'wait' : 'pointer', opacity: isScanning ? 0.6 : 1, whiteSpace: 'nowrap' }}
                          >
                            {isScanning ? 'Scanning…' : 'Scan Now'}
                          </button>
                          {c.scan_id ? (
                            <Link
                              href={`/report/${c.scan_id}`}
                              style={{ background: W, color: NAVY, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}
                            >
                              View Report
                            </Link>
                          ) : (
                            <button disabled style={{ background: BG, color: LGRAY, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 600, cursor: 'not-allowed', whiteSpace: 'nowrap' }}>
                              View Report
                            </button>
                          )}
                          {c.scan_id ? (
                            <button
                              onClick={() => window.open(`/reports/${c.scan_id}?print=1`, '_blank')}
                              style={{ background: W, color: NAVY, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                            >
                              PDF
                            </button>
                          ) : null}
                          <button
                            onClick={() => openClientView(c)}
                            style={{ background: FIX_BG, color: PURPLE, border: `1px solid ${TINT_BORDER}`, borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                          >
                            Client View
                          </button>
                          <button
                            onClick={() => handleRemove(c.id)}
                            disabled={isRemoving}
                            style={{ background: RED_BG, color: RED, border: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 700, cursor: isRemoving ? 'wait' : 'pointer', opacity: isRemoving ? 0.6 : 1, whiteSpace: 'nowrap' }}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ADD CLIENT MODAL */}
      {showAddModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setShowAddModal(false) }}
        >
          <div style={{ background: W, borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', padding: 32, boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: NAVY, margin: 0 }}>Add New Client</h2>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: LGRAY }}><svg viewBox="0 0 384 512" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg></button>
            </div>

            <form onSubmit={handleAddClient}>
              {addError && (
                <div style={{ background: RED_BG, border: '1px solid #FECACA', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: RED, marginBottom: 16 }}>
                  {addError}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>Business Name *</span>
                  <input
                    type="text"
                    required
                    value={addForm.businessName}
                    onChange={e => setAddForm(f => ({ ...f, businessName: e.target.value }))}
                    placeholder="e.g. Smith Family Dental"
                    style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px 14px', fontSize: 14, color: NAVY, background: BG, outline: 'none' }}
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>Industry</span>
                  <select
                    value={addForm.industry}
                    onChange={e => setAddForm(f => ({ ...f, industry: e.target.value }))}
                    style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px 14px', fontSize: 14, color: NAVY, background: BG }}
                  >
                    {INDUSTRIES.map(i => (
                      <option key={i} value={i}>{i.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
                    ))}
                  </select>
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>City *</span>
                    <input
                      type="text"
                      required
                      value={addForm.city}
                      onChange={e => setAddForm(f => ({ ...f, city: e.target.value }))}
                      placeholder="e.g. Austin"
                      style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px 14px', fontSize: 14, color: NAVY, background: BG }}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>State / Region</span>
                    <input
                      type="text"
                      value={addForm.state}
                      onChange={e => setAddForm(f => ({ ...f, state: e.target.value }))}
                      placeholder="e.g. TX"
                      style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px 14px', fontSize: 14, color: NAVY, background: BG }}
                    />
                  </label>
                </div>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>Country</span>
                  <select
                    value={addForm.country}
                    onChange={e => setAddForm(f => ({ ...f, country: e.target.value }))}
                    style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px 14px', fontSize: 14, color: NAVY, background: BG }}
                  >
                    {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>Contact Email</span>
                  <input
                    type="email"
                    value={addForm.contactEmail}
                    onChange={e => setAddForm(f => ({ ...f, contactEmail: e.target.value }))}
                    placeholder="client@example.com"
                    style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px 14px', fontSize: 14, color: NAVY, background: BG }}
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>Notes</span>
                  <textarea
                    value={addForm.notes}
                    onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Any notes about this client…"
                    rows={3}
                    style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px 14px', fontSize: 14, color: NAVY, background: BG, resize: 'vertical', fontFamily: 'inherit' }}
                  />
                </label>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn btn-line" style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="btn btn-blue" style={{ flex: 2, opacity: addLoading ? 0.7 : 1 }}
                >
                  {addLoading ? 'Adding…' : 'Add Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AGENCY CLIENT VIEW (Phase 4.1) — per-fix client-facing explanations */}
      {explainClient && (
        <div
          onClick={() => setExplainClient(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, overflowY: 'auto' }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: W, borderRadius: 16, maxWidth: 640, width: '100%', margin: '40px 0', padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 12 }}>
              <div>
                <p className="lbl" style={{ color: PURPLE, margin: 0 }}>Client View</p>
                <h2 style={{ fontSize: 20, fontWeight: 700, color: NAVY, margin: '4px 0 0', letterSpacing: '-0.01em' }}>{displayName(explainClient)}</h2>
              </div>
              <button onClick={() => setExplainClient(null)} style={{ background: 'none', border: 'none', fontSize: 22, color: LGRAY, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <p className="sub" style={{ margin: '0 0 20px' }}>Business-language explanations to share with your client. Internal scores and reasoning are never shown here.</p>

            {DEFAULT_FIXES.map(fix => {
              const d = explainData[fix.fix_type]
              const owner = ownerOverride[fix.fix_type] ?? d?.implementationOwner ?? 'Agency or client'
              return (
                <div key={fix.id} style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: 0 }}>{fix.title}</p>
                    <button
                      onClick={() => loadExplain(explainClient, fix.fix_type)}
                      disabled={d?.loading}
                      style={{ background: FIX_BG, color: PURPLE, border: `1px solid ${TINT_BORDER}`, borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: d?.loading ? 'wait' : 'pointer' }}
                    >
                      {d?.loading ? 'Generating…' : d ? 'Regenerate' : 'Generate explanation'}
                    </button>
                  </div>

                  {d && !d.loading && d.explainToClient && (
                    <div style={{ marginTop: 12 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>Explain to client</p>
                      <p style={{ fontSize: 13, color: NAVY, lineHeight: 1.6, margin: '0 0 12px' }}>{d.explainToClient}</p>

                      <p style={{ fontSize: 11, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>Client summary</p>
                      <p style={{ fontSize: 13, color: NAVY, lineHeight: 1.6, margin: '0 0 12px', fontStyle: 'italic' }}>{d.clientSummary}</p>

                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                        <label style={{ fontSize: 12, color: GRAY }}>
                          Implementation owner:{' '}
                          <select
                            value={owner}
                            onChange={e => setOwnerOverride(prev => ({ ...prev, [fix.fix_type]: e.target.value }))}
                            style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: `1px solid ${BORDER}`, color: NAVY }}
                          >
                            <option>Agency (technical)</option>
                            <option>Agency or client</option>
                            <option>Client</option>
                          </select>
                        </label>
                        <span style={{ fontSize: 12, color: GRAY }}>Effort: <strong style={{ color: NAVY }}>{d.estimatedEffort}</strong></span>
                        <span style={{ fontSize: 12, color: GRAY }}>Impact: <strong style={{ color: GREEN }}>{d.estimatedVisibilityImpact}</strong></span>
                      </div>

                      <button
                        onClick={() => { navigator.clipboard.writeText(d.clientSummary); setCopiedFix(fix.fix_type); setTimeout(() => setCopiedFix(null), 2000); }}
                        style={{ background: copiedFix === fix.fix_type ? GREEN : BLUE, color: W, border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                      >
                        {copiedFix === fix.fix_type ? (<><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>{' '}Copied</>) : 'Copy Client Summary'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <Link href="/dashboard/agency/proposal" className="tl" style={{ color: PURPLE, textDecoration: 'none' }}>Open Proposal Builder <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
            </div>
          </div>
        </div>
      )}
    </div>
    </PlanPageGuard>
  )
}
