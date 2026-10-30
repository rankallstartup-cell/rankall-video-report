import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { loadScoreBySlug } from '@/lib/publicShare'
import { gradeLabel } from '@/lib/projection'
import Logo from '@/components/Logo';

// ax8b item 2: this page used the anon key to read rankall_scans /
// rankall_platform_results for any slug. Data now comes from
// lib/publicShare (service role) and only for scans that may be shown
// publicly: ownerless scans, or owned scans the owner explicitly shared
// (is_public). The business name goes through getTrustedDisplayName (#39).

// Shorter than the old 24h so an owner un-sharing a scan takes effect soon.
export const revalidate = 3600

const PLATFORMS = [
  'ChatGPT', 'Gemini', 'Google AI', 'Copilot', 'Perplexity',
  'Grok', 'Claude', 'DeepSeek', 'Mistral', 'Kimi', 'Groq',
]

// Grade bands: the ONE table in lib/projection (gradeLabel); colours only here.
const TIER_COLORS: Record<string, { color: string; bg: string }> = {
  'Not Visible': { color: '#EF4444', bg: 'rgba(239,68,68,0.15)' },
  Emerging:      { color: '#F97316', bg: 'rgba(249,115,22,0.15)' },
  Visible:       { color: '#EAB308', bg: 'rgba(234,179,8,0.15)' },
  Strong:        { color: '#22C55E', bg: 'rgba(34,197,94,0.15)' },
  Dominant:      { color: '#10B981', bg: 'rgba(16,185,129,0.15)' },
}
function scoreTier(score: number): { label: string; color: string; bg: string } {
  const label = gradeLabel(score)
  return { label, ...(TIER_COLORS[label] ?? TIER_COLORS['Not Visible']) }
}

function toSlug(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const data = await loadScoreBySlug(slug)
  if (!data) return { title: { absolute: 'AI Visibility Score | Rankall' }, robots: { index: false, follow: true } }
  const name = data.scan.displayName.split(' in ')[0] || 'Business'
  return {
    title: { absolute: `${name} AI Visibility Score — Rankall` },
    description: `${name} scored ${data.scan.overall_score}/100 on AI visibility across 12 platforms. See the full breakdown.`,
    robots: { index: false, follow: true },
  }
}

export default async function ScoreSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const data = await loadScoreBySlug(slug)
  if (!data) notFound()
  const scan = data.scan
  const platformData = data.platforms

  const platformMap = new Map<string, boolean>()
  for (const row of platformData ?? []) {
    // ax7w: mentioned ONLY — a category-only answer is not an appearance (see generate-pdf).
    platformMap.set(row.platform, !!row.mentioned)
  }

  const score = scan.overall_score
  const tier = scoreTier(score)
  const businessName = (scan.displayName === scan.input ? scan.input?.split(' in ')[0] : scan.displayName) || 'Business'
  const city = scan.location || (scan.input?.includes(' in ') ? scan.input.split(' in ')[1] : '')
  const industry = scan.industry || ''
  const scanDate = new Date(scan.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const signupUrl = `/signup?business=${encodeURIComponent(businessName)}`

  // SVG circular progress
  const RADIUS = 72
  const CIRC = 2 * Math.PI * RADIUS
  const dash = (score / 100) * CIRC

  // Item 9: the old "Higher than N% of …" line was Math.random() over the
  // score — an invented percentile that changed on every render. There is
  // no real peer distribution behind this page, so it states the measured
  // platform count instead.
  const mentionedOn = PLATFORMS.filter(pl => platformMap.get(pl)).length

  return (
    <div style={{ background: '#0F172A', minHeight: '100vh', color: '#FFFFFF', fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif" }}>

      {/* Header */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 860, margin: '0 auto' }}>
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Logo variant="white" height={26} />
            </Link>
        <Link href="/" style={{ background: '#2563EB', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700, color: '#fff', textDecoration: 'none' }}>
          Scan free <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* Business + Score Hero */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          {industry && (
            <span style={{ background: 'rgba(37,99,235,0.2)', border: '1px solid rgba(37,99,235,0.4)', borderRadius: 100, padding: '4px 14px', fontSize: 12, fontWeight: 700, color: '#93C5FD', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {industry}
            </span>
          )}
          <h1 style={{ fontSize: 'clamp(24px,5vw,42px)', fontWeight: 900, color: '#FFFFFF', letterSpacing: '-1px', marginTop: 14, marginBottom: 6, lineHeight: 1.1 }}>
            {businessName}
          </h1>
          {city && (
            <p style={{ fontSize: 16, color: '#94A3B8', marginBottom: 0 }}><svg viewBox="0 0 384 512" width="16" height="16" fill="currentColor" aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 6 }}><path d="M215.7 499.2C267 435 384 279.4 384 192C384 86 298 0 192 0S0 86 0 192c0 87.4 117 243 168.3 307.2c12.3 15.3 35.1 15.3 47.4 0zM192 128a64 64 0 1 1 0 128 64 64 0 1 1 0-128z"/></svg> {city}</p>
          )}
        </div>

        {/* Score Ring + Tier */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 48 }}>
          <div style={{ position: 'relative', width: 180, height: 180, marginBottom: 20 }}>
            <svg width="180" height="180" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="90" cy="90" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="12" />
              <circle
                cx="90" cy="90" r={RADIUS}
                fill="none"
                stroke={tier.color}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={`${dash} ${CIRC}`}
                style={{ transition: 'stroke-dasharray 1s ease' }}
              />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 52, fontWeight: 900, color: tier.color, lineHeight: 1 }}>{score}</span>
              <span style={{ fontSize: 14, color: '#94A3B8', fontWeight: 600 }}>/100</span>
            </div>
          </div>

          <div style={{ background: tier.bg, border: `1.5px solid ${tier.color}`, borderRadius: 100, padding: '6px 20px', marginBottom: 12 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: tier.color }}>{tier.label}</span>
          </div>

          <p style={{ fontSize: 14, color: '#94A3B8', textAlign: 'center' }}>
            Mentioned on <strong style={{ color: '#FFFFFF' }}>{mentionedOn} of {PLATFORMS.length}</strong> AI platforms
          </p>
          <p style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>Last scanned {scanDate}</p>
        </div>

        {/* Platform Grid */}
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '24px', marginBottom: 32 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 20 }}>Platform Coverage</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
            {PLATFORMS.map(pl => {
              const mentioned = platformMap.get(pl) ?? false
              return (
                <div
                  key={pl}
                  style={{
                    background: mentioned ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${mentioned ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: 10,
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 14, flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>{mentioned ? (<svg viewBox="0 0 448 512" width="14" height="14" fill="#4ADE80" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>) : (<svg viewBox="0 0 384 512" width="14" height="14" fill="#64748B" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>)}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: mentioned ? '#4ADE80' : '#64748B' }}>{pl}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Competitor callout */}
        {scan.competitor_name && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: '16px 20px', marginBottom: 32, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}><svg viewBox="0 0 640 512" width="20" height="20" fill="#FCA5A5" aria-hidden="true"><path d="M384 32l128 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L398.4 96c-5.2 25.8-22.9 47.1-46.4 57.3L352 448l160 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-192 0-192 0c-17.7 0-32-14.3-32-32s14.3-32 32-32l160 0 0-294.7c-23.5-10.3-41.2-31.6-46.4-57.3L128 96c-17.7 0-32-14.3-32-32s14.3-32 32-32l128 0c14.6-19.4 37.8-32 64-32s49.4 12.6 64 32zm55.6 288l144.9 0L512 195.8 439.6 320zM512 416c-62.9 0-115.2-34-126-78.9c-2.6-11 1-22.3 6.7-32.1l95.2-163.2c5-8.6 14.2-13.8 24.1-13.8s19.1 5.3 24.1 13.8l95.2 163.2c5.7 9.8 9.3 21.1 6.7 32.1C627.2 382 574.9 416 512 416zM126.8 195.8L54.4 320l144.9 0L126.8 195.8zM.9 337.1c-2.6-11 1-22.3 6.7-32.1l95.2-163.2c5-8.6 14.2-13.8 24.1-13.8s19.1 5.3 24.1 13.8l95.2 163.2c5.7 9.8 9.3 21.1 6.7 32.1C242 382 189.7 416 126.8 416S11.7 382 .9 337.1z"/></svg></span>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#FCA5A5', marginBottom: 2 }}>Top competitor: {scan.competitor_name}</p>
              <p style={{ fontSize: 13, color: '#94A3B8' }}>Appearing on AI platforms instead of {businessName}</p>
            </div>
          </div>
        )}

        {/* CTAs */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 16 }}>
          <Link
            href={signupUrl}
            style={{ background: '#2563EB', borderRadius: 12, padding: '14px 28px', fontSize: 15, fontWeight: 700, color: '#fff', textDecoration: 'none', display: 'inline-block', boxShadow: '0 4px 16px rgba(37,99,235,0.4)' }}
          >
            Is this your business? Claim it <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
          <Link
            href="/"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: '14px 28px', fontSize: 15, fontWeight: 600, color: '#fff', textDecoration: 'none', display: 'inline-block' }}
          >
            Scan your business free
          </Link>
        </div>
        <p style={{ textAlign: 'center', fontSize: 12, color: '#475569' }}>Free scan · No credit card · Instant results</p>

      </div>
    </div>
  )
}
