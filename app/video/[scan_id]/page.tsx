import { notFound } from 'next/navigation';
import { loadShareableScanRow } from '@/lib/publicShare';
import { calculateSimulation, type SimulatorFix } from '@/lib/simulator';
import { getTrustedDisplayName } from '@/lib/enrichment';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Scan Audio Walkthrough | Rankall' },
  robots: { index: false, follow: true },
};

const DEFAULT_SIM_FIXES: SimulatorFix[] = [
  { id: 'faq_schema', title: 'FAQ Schema', fix_type: 'faq_schema' },
  { id: 'directory_citations', title: 'Directory Citations', fix_type: 'directory_citations' },
  { id: 'review_velocity', title: 'Review Velocity', fix_type: 'review_velocity' },
  { id: 'content_optimization', title: 'Content Optimization', fix_type: 'content_optimization' },
  { id: 'trust_signals', title: 'Trust Signals', fix_type: 'trust_signals' },
];

const CURRENCY_SYMBOLS: Record<string, string> = {
  GB: '£', IE: '€', AU: '$', CA: '$', US: '$', IN: '₹', AE: 'AED ',
};

const PLATFORMS = [
  'ChatGPT', 'Gemini', 'Perplexity', 'Grok', 'Copilot', 'Claude',
  'DeepSeek', 'Mistral', 'Kimi', 'Groq', 'Google AI',
];

function scoreColor(score: number): string {
  if (score < 40) return '#dc2626';
  if (score <= 60) return '#f59e0b';
  return '#10b981';
}

function fixForIndustry(industry: string): { title: string; desc: string } {
  const key = (industry || '').toLowerCase();
  if (key.includes('restaurant') || key.includes('cafe') || key.includes('food') || key.includes('retail') || key.includes('shop')) {
    return {
      title: 'Google Business Profile optimization',
      desc: 'Your Google Business Profile is one of the main sources AI platforms read about local businesses. Filling in your categories, hours, services and photos completely tells ChatGPT, Gemini and the rest that you are a real, active business worth surfacing.',
    };
  }
  return {
    title: 'FAQ schema markup',
    desc: 'Adding FAQ schema to your website lets AI platforms read your answers directly and quote you when people ask questions about your industry. It is a one-time, 20-minute change that immediately makes your site machine-readable to ChatGPT, Gemini and Perplexity.',
  };
}

export const dynamic = 'force-dynamic';

type VideoScanRow = {
  business_name: string | null; input: string | null; user_business_name: string | null;
  location: string | null; industry: string | null;
  overall_score: number | null; competitor_name: string | null;
  competitor_score: number | null;
  country_code: string | null; mentioned_count: number | null;
  enrichment: unknown;
};

function toVideoScan(r: VideoScanRow) {
  return {
    business_name: r.business_name,
    city: r.location,
    industry: r.industry,
    score: r.overall_score,
    competitor_name: r.competitor_name,
    competitor_score: r.competitor_score,
    revenue_leak: null as number | null,
    country_code: r.country_code,
    mentioned_count: r.mentioned_count,
  };
}

export default async function VideoPage({ params }: { params: Promise<{ scan_id: string }> }) {
  const { scan_id } = await params;

  // Service-role for the scan's own platform/competitor rows (public page,
  // public data — guaranteed readable regardless of RLS).
  const admin = getSupabaseAdmin();

  // RT-69 (b): the scan row used to load through an anon-key client, but
  // the Oct 16 RLS lockdown (20261016000600_report_rls_lockdown.sql) is
  // owner-only (user_id = auth.uid()), so anonymous prospects 404'd on
  // existing scans. Load via loadShareableScanRow (service role + the
  // /r/ share-visibility rule: ownerless scans, or owned scans the owner
  // published). Null still 404s. The b8bf mapping below is unchanged:
  // no revenue_leak column exists and the page has no
  // avg-customer-value / monthly-inquiries inputs to compute
  // revenueGapForScan honestly — so the revenue box stays hidden
  // (revenueLeak 0) rather than inventing a number.
  const row = (await loadShareableScanRow(scan_id)) as VideoScanRow | null;

  if (!row) return notFound();
  const scan = toVideoScan(row);

  const audioUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/outreach-videos/${scan_id}/audio.mp3`
    : null;

  // The audio file only exists when the outreach job generated it. The page
  // used to render a player whenever the env URL was set — even when no
  // audio.mp3 was ever uploaded, i.e. a broken player promising audio that
  // doesn't exist. Check first; a missing file gets an honest note, never
  // a broken player.
  let audioAvailable = false;
  if (audioUrl) {
    try {
      const head = await fetch(audioUrl, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
      audioAvailable = head.ok;
    } catch {
      audioAvailable = false;
    }
  }

  // #39: trusted display name — a stale wrong-business Google name is
  // never shown (same rule as /r/). Falls back to the mapped name.
  const enrichment = (row.enrichment ?? null) as { google?: Parameters<typeof getTrustedDisplayName>[3] } | null;
  const business = getTrustedDisplayName(
    typeof row.input === 'string' ? row.input : null,
    typeof row.location === 'string' ? row.location : null,
    typeof row.user_business_name === 'string' ? row.user_business_name : null,
    enrichment?.google,
  ) || 'Your business';
  const city = scan.city || '';
  const industry = scan.industry || 'business';
  const score = scan.score || 0;
  // Item 4: only MEASURED values. A competitor score/name the scan never
  // recorded is null (section hidden) — never 0 or "Top Competitor".
  const competitor: string | null = typeof row.competitor_name === 'string' && row.competitor_name.trim()
    ? row.competitor_name.trim() : null;
  const competitorScore: number | null = competitor && typeof row.competitor_score === 'number' && Number.isFinite(row.competitor_score)
    ? Math.round(row.competitor_score) : null;
  // No revenue_leak column exists on rankall_scans (the old select
  // assumed one) and the page has no avg-customer-value /
  // monthly-inquiries inputs to compute revenueGapForScan honestly —
  // so the revenue box stays hidden (revenueLeak 0) rather than
  // inventing a number.
  const revenueLeak = 0;

  // Per-platform results the scan stored (the real "where AI recommends
  // you" data). Platform counts are never derived from the score.
  let platformRows: { platform: string; mentioned: boolean }[] = [];
  {
    const { data: rows, error } = await admin
      .from('rankall_platform_results')
      .select('platform, mentioned')
      .eq('scan_id', scan_id);
    if (error) console.error('[video] platform results unavailable:', error.message);
    platformRows = ((rows ?? []) as Array<{ platform: string | null; mentioned: boolean | null }>)
      .filter(r => typeof r.platform === 'string' && r.platform)
      .map(r => ({ platform: r.platform as string, mentioned: r.mentioned === true }));
  }
  const yourPlatforms: number | null = platformRows.length > 0
    ? platformRows.filter(r => r.mentioned).length
    : (typeof row.mentioned_count === 'number' ? row.mentioned_count : null);
  // Competitor platform count: only from a stored competitor scan.
  let compPlatforms: number | null = null;
  if (competitor) {
    const { data: comp } = await admin
      .from('competitor_scans')
      .select('competitor_platforms_count')
      .eq('scan_id', scan_id)
      .order('scanned_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const n = (comp as { competitor_platforms_count?: unknown } | null)?.competitor_platforms_count;
    compPlatforms = typeof n === 'number' && Number.isFinite(n) ? n : null;
  }

  const reportUrl = `/?q=${encodeURIComponent(business + ' ' + city)}`;
  const revenueSymbol = CURRENCY_SYMBOLS[row.country_code as string] || '$';
  const annual = revenueLeak * 12;


  const fix = fixForIndustry(industry);
  const today = new Date().toLocaleDateString();

  const sim = calculateSimulation({
    currentScore: score,
    industry,
    city,
    countryCode: (typeof row.country_code === 'string' ? row.country_code : '') || 'US',
    competitorScore,
    platformsCovered: yourPlatforms ?? 0,
    fixes: DEFAULT_SIM_FIXES,
    revenueGap: revenueLeak,
    revenueSymbol,
  });

  const card: React.CSSProperties = { background: '#1f1f3a', borderRadius: 12, padding: 24, marginBottom: 24 };

  return (
    <main style={{ minHeight: '100vh', background: '#0f0f23', color: '#fff', fontFamily: 'sans-serif', padding: '24px 20px 60px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        {/* 1. Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 40 }}>
          <span style={{ color: '#a78bfa', fontSize: 16, fontWeight: 800, letterSpacing: 0.5 }}>RANKALL.IO</span>
          <span style={{ color: '#9ca3af', fontSize: 13 }}>Your AI Visibility Report</span>
        </div>

        {/* 2. Hero */}
        <h1 style={{ fontSize: 36, fontWeight: 800, margin: '0 0 8px' }}>{business}</h1>
        <p style={{ color: '#9ca3af', margin: '0 0 32px', fontSize: 16 }}>{city} · {industry}</p>

        {/* 3. Score comparison */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 32 }}>
          <div style={{ flex: 1, background: '#1f1f3a', borderRadius: 12, padding: 20, textAlign: 'center' }}>
            <p style={{ color: '#9ca3af', fontSize: 13, margin: '0 0 4px' }}>Your Score</p>
            <p style={{ fontSize: 56, fontWeight: 800, color: scoreColor(score), margin: 0, lineHeight: 1 }}>{score}</p>
            <p style={{ color: '#6b7280', fontSize: 13, margin: '6px 0 0' }}>out of 100</p>
          </div>
          {competitor && competitorScore != null && (<>
          <div style={{ color: '#6b7280', fontSize: 20, fontWeight: 800 }}>VS</div>
          <div style={{ flex: 1, background: '#1f1f3a', borderRadius: 12, padding: 20, textAlign: 'center' }}>
            <p style={{ color: '#9ca3af', fontSize: 13, margin: '0 0 4px' }}>{competitor}</p>
            <p style={{ fontSize: 56, fontWeight: 800, color: '#10b981', margin: 0, lineHeight: 1 }}>{competitorScore}</p>
            <p style={{ color: '#6b7280', fontSize: 13, margin: '6px 0 0' }}>out of 100</p>
          </div>
          </>)}
        </div>

        {/* 4. Revenue gap (stored estimate; hidden when none) */}
        {revenueLeak > 0 && (
        <div style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid #dc2626', borderRadius: 12, padding: 24, marginBottom: 32, textAlign: 'center' }}>
          <p style={{ fontSize: 32, fontWeight: 800, color: '#dc2626', margin: '0 0 8px' }}>
            ~{revenueSymbol}{revenueLeak.toLocaleString()}/month estimated at stake
          </p>
          <p style={{ color: '#9ca3af', fontSize: 15, margin: 0 }}>
            That&apos;s {revenueSymbol}{annual.toLocaleString()} per year
          </p>
        </div>
        )}

        {/* 5. Platform grid — the scan's stored per-platform results only */}
        {(platformRows.length > 0 || yourPlatforms != null) && (
        <div style={card}>
          <p style={{ color: '#a78bfa', fontSize: 13, fontWeight: 700, margin: '0 0 4px', letterSpacing: 0.5 }}>
            WHERE AI RECOMMENDS YOU
          </p>
          <p style={{ color: '#9ca3af', fontSize: 14, margin: '0 0 16px' }}>
            {yourPlatforms != null && <>You appear on {yourPlatforms} of {platformRows.length > 0 ? platformRows.length : PLATFORMS.length} platforms checked.</>}
            {competitor && compPlatforms != null && <> {competitor} appears on {compPlatforms} of {PLATFORMS.length}.</>}
          </p>
          {platformRows.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
            {platformRows.map(r => (
                <div
                  key={r.platform}
                  style={{
                    background: r.mentioned ? '#15152e' : 'rgba(220,38,38,0.12)',
                    border: `1px solid ${r.mentioned ? '#2a2a4a' : '#dc2626'}`,
                    borderRadius: 8,
                    padding: '10px 12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: '#d1d5db' }}>{r.platform}</span>
                  <span style={{ display: 'flex', gap: 6 }}>
                    {r.mentioned
                      ? <span style={{ color: '#10b981', fontWeight: 700 }}><svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg></span>
                      : <span style={{ color: '#dc2626', fontWeight: 700 }}><svg viewBox="0 0 384 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg></span>}
                  </span>
                </div>
            ))}
          </div>
          )}
          {platformRows.length > 0 && (
          <p style={{ color: '#6b7280', fontSize: 12, margin: '14px 0 0' }}>
            <span style={{ color: '#10b981' }}><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg></span> recommends you &nbsp;·&nbsp;
            <span style={{ color: '#dc2626' }}><svg viewBox="0 0 384 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg></span> doesn&apos;t
          </p>
          )}
        </div>
        )}

        {/* 6. Simulator */}
        <div style={{ background: 'linear-gradient(135deg,#1f1f3a,#2a1f4a)', border: '1px solid #7c3aed', borderRadius: 12, padding: 24, marginBottom: 32, textAlign: 'center' }}>
          <p style={{ color: '#a78bfa', fontSize: 13, fontWeight: 600, margin: '0 0 12px', letterSpacing: 0.5 }}>IF YOU FIX THIS:</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, margin: '0 0 8px' }}>
            <span style={{ fontSize: 44, fontWeight: 800, color: '#dc2626' }}>{sim.currentScore}</span>
            <span style={{ fontSize: 32, color: '#9ca3af' }}>→</span>
            <span style={{ fontSize: 44, fontWeight: 800, color: '#10b981' }}>{sim.projectedScoreMid}</span>
          </div>
          <p style={{ color: '#9ca3af', fontSize: 14, margin: '0 0 16px' }}>Estimated projection — not a guarantee</p>
          {sim.revenueRecovered > 0 && (
          <p style={{ color: '#10b981', fontSize: 22, fontWeight: 700, margin: '0 0 20px' }}>
            ~{sim.revenueSymbol}{sim.revenueRecovered.toLocaleString()}/month estimated recovery
          </p>
          )}
          <a
            href={reportUrl}
            style={{
              display: 'inline-block', background: '#7c3aed', color: '#fff',
              textDecoration: 'none', borderRadius: 10, padding: '12px 24px',
              fontSize: 15, fontWeight: 700,
            }}
          >
            See your full improvement plan <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
        </div>

        {/* 7. Audio walkthrough — only when the audio file actually exists */}
        {audioAvailable ? (
          <div style={{ ...card, textAlign: 'center' }}>
            <p style={{ color: '#fff', margin: '0 0 12px', fontSize: 18, fontWeight: 700 }}><svg viewBox="0 0 512 512" width="18" height="18" fill="currentColor" aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 8 }}><path d="M256 80C149.9 80 62.4 159.4 49.6 262c9.4-3.8 19.6-6 30.4-6c26.5 0 48 21.5 48 48l0 128c0 26.5-21.5 48-48 48c-44.2 0-80-35.8-80-80l0-16 0-48 0-48C0 146.6 114.6 32 256 32s256 114.6 256 256l0 48 0 48 0 16c0 44.2-35.8 80-80 80c-26.5 0-48-21.5-48-48l0-128c0-26.5 21.5-48 48-48c10.8 0 21 2.1 30.4 6C449.6 159.4 362.1 80 256 80z"/></svg> Your personalized audio walkthrough</p>
            <audio controls style={{ width: '100%' }} src={audioUrl ?? undefined}>
              Your browser does not support audio.
            </audio>
            <p style={{ color: '#6b7280', fontSize: 13, margin: '12px 0 0' }}>
              About a 1-minute listen — generated specifically for {business}
            </p>
          </div>
        ) : (
          <div style={{ ...card, textAlign: 'center' }}>
            <p style={{ color: '#9ca3af', fontSize: 14, margin: 0, lineHeight: 1.6 }}>
              An audio walkthrough isn&apos;t available for this scan yet — the written report on this page has everything.
            </p>
          </div>
        )}

        {/* 8. Fix #1 preview */}
        <div style={card}>
          <p style={{ color: '#10b981', fontSize: 15, fontWeight: 700, margin: '0 0 8px' }}>
            Your #1 fix (free, 20 minutes):
          </p>
          <p style={{ color: '#d1d5db', fontSize: 15, lineHeight: 1.5, margin: '0 0 16px' }}>
            {fix.desc}
          </p>
          <p
            style={{
              color: '#a78bfa',
              fontSize: 15,
              fontWeight: 600,
              margin: 0,
              filter: 'blur(4px)',
              userSelect: 'none',
            }}
          >
            See your complete fix plan <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
          </p>
        </div>

        {/* 9. CTA */}
        <a
          href={reportUrl}
          style={{
            display: 'block', background: '#7c3aed', color: '#fff',
            textDecoration: 'none', borderRadius: 12, padding: '16px 24px',
            textAlign: 'center', fontSize: 18, fontWeight: 700, marginBottom: 12,
          }}
        >
          Get my complete report free <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
        <a
          href="/leaderboard"
          style={{
            display: 'block', background: 'transparent', color: '#a78bfa',
            border: '1px solid #7c3aed',
            textDecoration: 'none', borderRadius: 12, padding: '14px 24px',
            textAlign: 'center', fontSize: 15, fontWeight: 600, marginBottom: 24,
          }}
        >
          See how other {industry} businesses fixed this <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
        </a>

        {/* 10. Trust line */}
        <p style={{ color: '#6b7280', fontSize: 13, textAlign: 'center' }}>
          Scanned {today} · businesses scanned this week in {city}
        </p>
      </div>

      {/* Track page view */}
      <script dangerouslySetInnerHTML={{ __html: `
        fetch('/api/outreach/track', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({event:'video_page_viewed', scan_id:'${scan_id}'})
        }).catch(()=>{});
      `}} />
    </main>
  );
}
