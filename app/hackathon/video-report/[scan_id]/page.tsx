// ── Hackathon delivery page: your video report ──────────────────────────
// Meta Global AI Developer Hackathon (Oct 26 – Nov 4 2026).
// GET /hackathon/video-report/<scan_id>?videoUrl=<rendered mp4 URL>
//
// Wound-first, one action: the business's own 60-second video at the top,
// their numbers underneath, ONE signup CTA ("Claim your free report").
// No other exit links — the header wordmark is plain text on purpose.
//
// Segment-agnostic by design: the layout never assumes a business type.
// The subject (local business, personal brand, product, agency portfolio,
// enterprise brand) comes entirely from the scan row — name, industry,
// score, platform mentions, recorded competitor — so the same page serves
// every demo case. Nothing here is dentist-specific.
//
// Delivery contract (Days 4–5 integration):
// - ?videoUrl=<https URL of the finished mp4> plays immediately (the
//   email flow: the notify endpoint links here with the finished video).
// - Without it, the page starts a pipeline run via POST
//   /api/hackathon/video-report { scanId } and polls job status until the
//   video is ready (see video-player.tsx). The honest "preparing" state
//   stays up throughout; failed/stalled jobs show a real failure state
//   with a retry — never a broken player, never a fake video.
// - The signup CTA carries ?src=video-report, an inert marker for the
//   scan → video → signup loop (the signup page ignores unknown params
//   today; tying signups back to scans is a follow-up, not claimed here).
// - Secondary link ONLY: "View the full business page" under the CTA,
//   pointing at that business's existing staging business page (dg7k,
//   LINK ONLY — no new business-page building). It renders only when the
//   scan maps to a public businesses row (latest_scan_id); otherwise it
//   is omitted, never guessed. It is labeled pre-existing wherever it
//   appears: the page already existed, the video is what's new.
//
// Honesty rules (same as the free report tier and /video):
// - Only stored values: score, mentions, competitor name/score, platform
//   rows. A missing competitor is omitted, never replaced with a generic.
// - No revenue figures: rankall_scans has no revenue column, so no revenue
//   box is rendered at all rather than an invented number.
// - Gated by HACKATHON_VIDEO_REPORT_ENABLED=1, same flag as the API route;
//   404s when the flag is off.

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getTrustedDisplayName } from '@/lib/enrichment';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getJobStore } from '@/lib/video/jobStore';
import { buildHowItWasMade, getJudgeDemo, preferTrackedName } from '@/lib/video/judgeMode';
import type { Metadata } from 'next';
import VideoReportPlayer from './video-player';

export const metadata: Metadata = {
  title: { absolute: 'Your AI Visibility Video | Rankall' },
  robots: { index: false, follow: true },
};

export const dynamic = 'force-dynamic';

// Light theme, current site tokens.
const BG = '#F6F6FB';
const WHITE = '#FFFFFF';
const NAVY = '#0A0A14';
const GRAY = '#55556A';
const BORDER = '#E7E7F0';
const BLUE = '#1B17FF';
const RED = '#B4232A';
const GREEN = '#059669';

function scoreColor(score: number): string {
  if (score < 40) return RED;
  if (score <= 60) return '#B45309';
  return GREEN;
}

function isHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export default async function VideoReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ scan_id: string }>;
  searchParams: Promise<{ videoUrl?: string | string[] }>;
}) {
  // Same feature flag as POST /api/hackathon/video-report.
  if (process.env.HACKATHON_VIDEO_REPORT_ENABLED !== '1') return notFound();

  const { scan_id } = await params;
  const sp = await searchParams;
  const rawVideo = Array.isArray(sp.videoUrl) ? sp.videoUrl[0] : sp.videoUrl;
  const videoUrl = isHttpUrl(rawVideo) ? rawVideo : null;

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  // Service-role for the scan's own platform/competitor rows (public page,
  // public data — guaranteed readable regardless of RLS).
  const admin = getSupabaseAdmin();

  // Real rankall_scans columns only (no city/score/revenue_leak columns).
  const { data: row } = await supabase
    .from('rankall_scans')
    .select('business_name, input, user_business_name, location, industry, overall_score, competitor_name, competitor_score, mentioned_count, enrichment, created_at')
    .eq('id', scan_id)
    .maybeSingle();

  if (!row) return notFound();

  const enrichment = (row.enrichment ?? null) as { google?: Parameters<typeof getTrustedDisplayName>[3] } | null;
  const business = preferTrackedName(
    getTrustedDisplayName(
      typeof row.input === 'string' ? row.input : null,
      typeof row.location === 'string' ? row.location : null,
      typeof row.user_business_name === 'string' ? row.user_business_name : null,
      enrichment?.google,
    ) || (typeof row.business_name === 'string' && row.business_name) || 'Your business',
    typeof row.input === 'string' ? row.input : null,
    typeof row.user_business_name === 'string' ? row.user_business_name : null,
  );
  const city = typeof row.location === 'string' ? row.location : '';
  const industry = typeof row.industry === 'string' && row.industry ? row.industry : 'business';
  const score = typeof row.overall_score === 'number' && Number.isFinite(row.overall_score)
    ? Math.round(row.overall_score) : 0;
  // Only MEASURED competitor values. Unrecorded = section hidden, never 0.
  const competitor: string | null = typeof row.competitor_name === 'string' && row.competitor_name.trim()
    ? row.competitor_name.trim() : null;
  const competitorScore: number | null = competitor && typeof row.competitor_score === 'number' && Number.isFinite(row.competitor_score)
    ? Math.round(row.competitor_score) : null;
  const scannedOn = typeof row.created_at === 'string' && row.created_at
    ? new Date(row.created_at).toLocaleDateString() : null;

  // Per-platform results the scan stored (the real "where AI recommends
  // you" data). Platform counts are never derived from the score.
  let platformRows: { platform: string; mentioned: boolean }[] = [];
  {
    const { data: rows, error } = await admin
      .from('rankall_platform_results')
      .select('platform, mentioned')
      .eq('scan_id', scan_id);
    if (error) console.error('[hackathon/video-report] platform results unavailable:', error.message);
    platformRows = ((rows ?? []) as Array<{ platform: string | null; mentioned: boolean | null }>)
      .filter(r => typeof r.platform === 'string' && r.platform)
      .map(r => ({ platform: r.platform as string, mentioned: r.mentioned === true }));
  }
  const totalPlatforms = platformRows.length > 0 ? platformRows.length : null;
  const yourPlatforms: number | null = platformRows.length > 0
    ? platformRows.filter(r => r.mentioned).length
    : (typeof row.mentioned_count === 'number' ? row.mentioned_count : null);
  const missed = yourPlatforms != null && totalPlatforms != null
    ? Math.max(totalPlatforms - yourPlatforms, 0) : null;

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

  // Business page link (Day 4, LINK ONLY): the scan's public businesses
  // row, if any, gives the slug for the existing staging business page
  // (dg7k). No row → no link, never a guessed slug. The hackathon branch
  // predates dg7k, so this must be the staging URL, not a relative path.
  let businessSlug: string | null = null;
  {
    const { data: biz } = await supabase
      .from('businesses')
      .select('slug')
      .eq('latest_scan_id', scan_id)
      .eq('is_public', true)
      .maybeSingle();
    const slug = (biz as { slug?: unknown } | null)?.slug;
    businessSlug = typeof slug === 'string' && slug ? slug : null;
  }
  const businessPageUrl = businessSlug
    ? `https://rankall-staging.vercel.app/business/${encodeURIComponent(businessSlug)}`
    : null;

  // How-this-video-was-made evidence (Judge Mode): the latest completed
  // job for this scan, if any. No job → no section, never an invented
  // chain. The Meta step appears only when this scan's platform rows
  // actually include Meta AI (pre-Meta scans omit it honestly).
  let howItWasMade: ReturnType<typeof buildHowItWasMade> = null;
  try {
    const jobs = await getJobStore().list();
    const completed = jobs.find((j) => j.scanId === scan_id && j.status === 'complete' && j.result);
    if (completed?.result) {
      howItWasMade = buildHowItWasMade(
        {
          scriptSource: completed.result.scriptSource,
          avatarId: completed.result.avatarId,
          stages: completed.result.stages,
        },
        platformRows.some((r) => r.platform === 'Meta AI'),
      );
    }
  } catch {
    // Store unavailable → section omitted, page still renders.
  }
  // Pre-generated run label: only when the playing video IS this scan's
  // judge demo file (matched by path, not by host, so it works on any
  // deployment). A live-generated video gets no label.
  const judgeDemo = getJudgeDemo(scan_id);
  const runLabel =
    judgeDemo && videoUrl && videoUrl.endsWith(judgeDemo.videoPath) ? judgeDemo.runLabel : null;

  // Wound line, mirroring the video script's hook — quantified from stored
  // data only. When the scan mentioned everywhere, the wound is the score.
  const wound = missed != null && missed > 0 && totalPlatforms != null
    ? `AI recommends you on ${yourPlatforms} of ${totalPlatforms} platforms — on the other ${missed}, customers hear someone else.`
    : `Your visibility score is ${score} out of 100 — even where AI mentions you, competitors are still taking customers.`;

  const card: React.CSSProperties = { background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24, marginBottom: 24 };

  return (
    <main style={{ minHeight: '100vh', background: BG, color: NAVY, fontFamily: 'sans-serif', padding: '24px 20px 60px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        {/* Header — plain text, not a link: the page has exactly one CTA. */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <span style={{ color: BLUE, fontSize: 16, fontWeight: 800, letterSpacing: 0.5 }}>RANKALL.IO</span>
          <span style={{ color: GRAY, fontSize: 13 }}>Your AI Visibility Video</span>
        </div>

        {/* Wound-first headline */}
        <h1 style={{ fontSize: 32, fontWeight: 800, margin: '0 0 8px', lineHeight: 1.15 }}>{business}</h1>
        <p style={{ color: GRAY, margin: '0 0 12px', fontSize: 16 }}>{city ? `${city} · ` : ''}{industry}</p>
        <p style={{ fontSize: 18, lineHeight: 1.5, margin: '0 0 24px' }}>{wound}</p>

        {/* 1. Video player — at the top, before the numbers. The player
            owns starting/polling the render; the server render only
            passes the scan id + any ?videoUrl= already on the URL. */}
        <div id="video-player" style={{ marginBottom: 24 }}>
          <div style={{ ...card, marginBottom: 0, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: 24 }}>
              <VideoReportPlayer scanId={scan_id} initialVideoUrl={videoUrl} />
            </div>
          </div>
          <p style={{ color: GRAY, fontSize: 13, margin: '10px 0 0', textAlign: 'center' }}>
            Your personalized 60-second video report — made from your own scan, not a template.
          </p>
          {runLabel && (
            <p style={{ color: GRAY, fontSize: 13, margin: '6px 0 0', textAlign: 'center' }}>
              {runLabel}
            </p>
          )}
        </div>

        {/* 2. Numbers underneath */}
        <div id="numbers">
          <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', marginBottom: 24 }}>
            <div style={{ ...card, flex: 1, marginBottom: 0, textAlign: 'center' }}>
              <p style={{ color: GRAY, fontSize: 13, margin: '0 0 4px' }}>Your visibility score</p>
              <p style={{ fontSize: 56, fontWeight: 800, color: scoreColor(score), margin: 0, lineHeight: 1 }}>{score}</p>
              <p style={{ color: GRAY, fontSize: 13, margin: '6px 0 0' }}>out of 100</p>
            </div>
            {competitor && competitorScore != null && (
              <div style={{ ...card, flex: 1, marginBottom: 0, textAlign: 'center' }}>
                <p style={{ color: GRAY, fontSize: 13, margin: '0 0 4px' }}>{competitor}</p>
                <p style={{ fontSize: 56, fontWeight: 800, color: scoreColor(competitorScore), margin: 0, lineHeight: 1 }}>{competitorScore}</p>
                <p style={{ color: GRAY, fontSize: 13, margin: '6px 0 0' }}>out of 100</p>
              </div>
            )}
          </div>

          {(platformRows.length > 0 || yourPlatforms != null) && (
            <div style={card}>
              <p style={{ color: BLUE, fontSize: 13, fontWeight: 700, margin: '0 0 4px', letterSpacing: 0.5 }}>
                WHERE AI RECOMMENDS YOU
              </p>
              <p style={{ color: GRAY, fontSize: 14, margin: '0 0 16px' }}>
                {yourPlatforms != null && totalPlatforms != null && <>You appear on {yourPlatforms} of {totalPlatforms} platforms checked.</>}
                {yourPlatforms != null && totalPlatforms == null && <>You appear on {yourPlatforms} platforms.</>}
                {competitor && compPlatforms != null && totalPlatforms != null && <> {competitor} appears on {compPlatforms} of {totalPlatforms}.</>}
              </p>
              {platformRows.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                  {platformRows.map(r => (
                    <div
                      key={r.platform}
                      style={{
                        background: r.mentioned ? WHITE : 'rgba(180,35,42,0.06)',
                        border: `1px solid ${r.mentioned ? BORDER : RED}`,
                        borderRadius: 8,
                        padding: '10px 12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: 13,
                      }}
                    >
                      <span style={{ color: NAVY }}>{r.platform}</span>
                      <span style={{ color: r.mentioned ? GREEN : RED, fontWeight: 700 }}>
                        {r.mentioned ? '✓' : '✕'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* How this video was made (Judge Mode evidence): only from the
            stored completed job — no job, no section, never invented. */}
        {howItWasMade && (
          <div style={card}>
            <p style={{ color: BLUE, fontSize: 13, fontWeight: 700, margin: '0 0 12px', letterSpacing: 0.5 }}>
              HOW THIS VIDEO WAS MADE
            </p>
            {howItWasMade.map((step) => (
              <div key={step.name} style={{ marginBottom: 12 }}>
                <p style={{ fontWeight: 700, margin: '0 0 2px', fontSize: 15 }}>{step.name}</p>
                <p style={{ color: GRAY, margin: 0, fontSize: 14, lineHeight: 1.5 }}>{step.detail}</p>
              </div>
            ))}
          </div>
        )}

        {/* 3. The ONE signup CTA (?src= marks the video-report loop;
            the signup page ignores unknown params today). */}
        <a
          id="signup-cta"
          href="/signup?src=video-report"
          style={{
            display: 'block', background: BLUE, color: '#fff',
            textDecoration: 'none', borderRadius: 12, padding: '16px 24px',
            textAlign: 'center', fontSize: 18, fontWeight: 700, marginBottom: 12,
          }}
        >
          Claim your free report
        </a>

        {/* Secondary link ONLY (Day 4, LINK ONLY): the business's existing
            staging business page, labeled pre-existing — the page already
            existed, the video is what's new. Omitted when unresolvable. */}
        {businessPageUrl && (
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <a
              id="business-page-link"
              href={businessPageUrl}
              target="_blank"
              rel="noreferrer"
              style={{ color: BLUE, fontSize: 15, fontWeight: 700, textDecoration: 'underline' }}
            >
              View the full business page
            </a>
            <p style={{ color: GRAY, fontSize: 13, margin: '6px 0 0' }}>
              Pre-existing: this business page already existed — the video is what&apos;s new.
            </p>
          </div>
        )}

        {scannedOn && (
          <p style={{ color: GRAY, fontSize: 13, textAlign: 'center', margin: 0 }}>
            Scanned {scannedOn} · Your full report shows every platform and the exact fixes, in order.
          </p>
        )}
      </div>
    </main>
  );
}
