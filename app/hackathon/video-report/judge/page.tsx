// ── Judge Mode: pick a business, watch its video in under 30 seconds ───
// Meta Global AI Developer Hackathon (Oct 26 – Nov 4 2026).
//
// No login, no cold scan, no render wait: each card links to that
// business's delivery page with ?videoUrl= pointing at the durable
// public/judge-videos/ mp4, so the video plays immediately. Every video
// is labeled with its real run date ("previously completed real run").
// This page renders NO new video and spends nothing on HeyGen.
//
// The business names, scores, and platform counts below come from the
// real scan rows (service-role read, same as the delivery page) — the
// helper only maps scanId → video file + run label, never numbers.
//
// Nov 2, 2026 (post-submission judge clarity): a HOW IT WORKS strip above
// the cards — the 30-second story plus the visible Meta chain — and a link
// to Tech Ridge Dental's delivery page, where its stored completed job
// renders the How this video was made steps. Text only: no new renders,
// no HeyGen spend, no card changes.
//
// Nov 2, 2026 (post-freeze exception, founder-approved): wound sentence
// before the strip, hero number made exact (9 of 11), one Tech Ridge
// proof card, chain extended to delivery. Text only: no new renders,
// no HeyGen spend, no card changes.

import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getTrustedDisplayName } from '@/lib/enrichment';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { Metadata } from 'next';
import { JUDGE_DEMOS, preferTrackedName } from '@/lib/video/judgeMode';

export const metadata: Metadata = {
  title: { absolute: 'Judge demos | Rankall' },
  robots: { index: false, follow: true },
};

export const dynamic = 'force-dynamic';

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

export default async function JudgeModePage() {
  if (process.env.HACKATHON_VIDEO_REPORT_ENABLED !== '1') return notFound();

  const hdrs = await headers();
  const host = hdrs.get('host') ?? '';
  const proto = hdrs.get('x-forwarded-proto') ?? 'https';
  const base = host ? `${proto}://${host}` : '';

  const admin = getSupabaseAdmin();

  const cards = [];
  for (const demo of JUDGE_DEMOS) {
    try {
      const { data: row, error } = await admin
        .from('rankall_scans')
        .select('business_name, input, user_business_name, location, industry, overall_score, mentioned_count, enrichment')
        .eq('id', demo.scanId)
        .maybeSingle();
      if (error || !row) continue;
      const enrichment = (row.enrichment ?? null) as { google?: Parameters<typeof getTrustedDisplayName>[3] } | null;
      const business = preferTrackedName(
        getTrustedDisplayName(
          typeof row.input === 'string' ? row.input : null,
          typeof row.location === 'string' ? row.location : null,
          typeof row.user_business_name === 'string' ? row.user_business_name : null,
          enrichment?.google,
        ) ||
          (typeof row.business_name === 'string' && row.business_name) ||
          'Your business',
        typeof row.input === 'string' ? row.input : null,
        typeof row.user_business_name === 'string' ? row.user_business_name : null,
      );
      const city = typeof row.location === 'string' ? row.location : '';
      const industry = typeof row.industry === 'string' && row.industry ? row.industry : 'business';
      const score =
        typeof row.overall_score === 'number' && Number.isFinite(row.overall_score)
          ? Math.round(row.overall_score)
          : 0;
      const { data: platformRows } = await admin
        .from('rankall_platform_results')
        .select('platform, mentioned')
        .eq('scan_id', demo.scanId);
      const platforms = ((platformRows ?? []) as Array<{ platform: string | null; mentioned: boolean | null }>)
        .filter((r) => typeof r.platform === 'string' && r.platform);
      const total = platforms.length > 0 ? platforms.length : null;
      const mentioned =
        platforms.length > 0
          ? platforms.filter((r) => r.mentioned === true).length
          : typeof row.mentioned_count === 'number'
            ? row.mentioned_count
            : null;
      const watchUrl = `/hackathon/video-report/${demo.scanId}?videoUrl=${encodeURIComponent(
        `${base}${demo.videoPath}`,
      )}`;
      cards.push({ demo, business, city, industry, score, total, mentioned, watchUrl });
    } catch (err) {
      console.error('[hackathon/judge] demo load failed:', demo.scanId, err);
    }
  }

  const card: React.CSSProperties = {
    background: WHITE,
    border: `1px solid ${BORDER}`,
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
  };

  // Chain-evidence link target: Tech Ridge Dental's card, whose stored
  // completed job (Spark script) renders How this video was made steps on
  // its delivery page. Omitted silently if the card failed to load.
  const techRidgeCard = cards.find((c) => c.demo.scanId === '637968a3-2952-4793-9073-35918b5f4ff9');

  return (
    <main style={{ minHeight: '100vh', background: BG, color: NAVY, fontFamily: 'sans-serif', padding: '24px 20px 60px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <span style={{ color: BLUE, fontSize: 16, fontWeight: 800, letterSpacing: 0.5 }}>RANKALL.IO</span>
          <span style={{ color: GRAY, fontSize: 13 }}>Judge demos</span>
        </div>

        <h1 style={{ fontSize: 32, fontWeight: 800, margin: '0 0 8px', lineHeight: 1.15 }}>
          Pick a business. Watch its video.
        </h1>
        <p style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.5, margin: '0 0 24px' }}>
          9 of the 11 businesses below score under 45 — that&apos;s the wound Rankall shows, from their own real scans.
        </p>
        <p style={{ fontSize: 18, lineHeight: 1.5, margin: '0 0 24px', color: GRAY }}>
          No login, no waiting on a scan. Each video below is a previously completed real run —
          labeled with its real date, never presented as freshly generated. Tap one and it plays.
        </p>

        <p style={{ fontSize: 18, lineHeight: 1.5, margin: '0 0 24px' }}>
          Customers are already asking AI who to choose. Most businesses cannot see when AI recommends a competitor instead.
        </p>

        {/* HOW IT WORKS — 30-second strip + visible Meta chain (Nov 2, post-submission
            judge clarity; text only, no renders, no spend). */}
        <div style={card}>
          <p style={{ color: BLUE, fontSize: 13, fontWeight: 700, margin: '0 0 12px', letterSpacing: 0.5 }}>
            HOW IT WORKS — IN 30 SECONDS
          </p>
          <p style={{ fontSize: 16, lineHeight: 1.5, margin: '0 0 12px' }}>
            <strong>1. Real scan.</strong> Rankall checks the business across 12 AI platforms, including Meta AI.{' '}
            <strong>2. Director check.</strong> Every number in the video is verified against the real scan before it renders.{' '}
            <strong>3. Video report.</strong> A presenter tells the business where AI recommends it — and where competitors take its customers.
          </p>
          <p style={{ fontSize: 15, lineHeight: 1.5, margin: '0 0 12px', color: GRAY }}>
            How each video is made: real scan → Muse Spark script (Meta&apos;s Model API) → director verifies every number → voice + avatar render → delivery.
          </p>
          {techRidgeCard && (
            <p style={{ fontSize: 15, lineHeight: 1.5, margin: 0 }}>
              <a href={techRidgeCard.watchUrl} style={{ color: BLUE, fontWeight: 700 }}>
                See the checks behind one video
              </a>
              <span style={{ color: GRAY }}> — Tech Ridge Dental&apos;s page shows its How this video was made steps.</span>
            </p>
          )}
        </div>

        {/* PROOF — one checked example (Nov 2, post-freeze exception; text only,
            numbers from Tech Ridge Dental's stored completed job, linked so a
            judge can verify them on its delivery page). */}
        <div style={card}>
          <p style={{ color: BLUE, fontSize: 13, fontWeight: 700, margin: '0 0 12px', letterSpacing: 0.5 }}>
            PROOF — ONE CHECKED EXAMPLE
          </p>
          <p style={{ fontSize: 16, lineHeight: 1.5, margin: '0 0 12px' }}>
            <strong>Director verification: <span style={{ color: GREEN }}>PASS</span></strong>
            <span style={{ color: GRAY }}> · Numbers checked: 13 · Errors found: 0</span>
          </p>
          <p style={{ fontSize: 15, lineHeight: 1.5, margin: '0 0 12px', color: GRAY }}>
            Without Rankall: raw scan numbers.
          </p>
          <p style={{ fontSize: 15, lineHeight: 1.5, margin: '0 0 12px', color: GRAY }}>
            With Rankall: the same numbers director-checked and presented as a video.
          </p>
          {techRidgeCard && (
            <p style={{ fontSize: 15, lineHeight: 1.5, margin: 0 }}>
              <span style={{ color: GRAY }}>Example: Tech Ridge Dental — full steps on </span>
              <a href={techRidgeCard.watchUrl} style={{ color: BLUE, fontWeight: 700 }}>
                its delivery page
              </a>
              <span style={{ color: GRAY }}>.</span>
            </p>
          )}
        </div>

        {cards.length === 0 && (
          <div style={card}>
            <p style={{ fontSize: 16, margin: 0 }}>
              Demo videos are unavailable right now — the scan data could not be loaded. Please try again later.
            </p>
          </div>
        )}

        {cards.map(({ demo, business, city, industry, score, total, mentioned, watchUrl }) => (
          <div key={demo.scanId} style={card}>
            <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>{business}</h2>
            <p style={{ color: GRAY, margin: '0 0 12px', fontSize: 15 }}>
              {city ? `${city} · ` : ''}
              {industry}
            </p>
            <p style={{ margin: '0 0 4px', fontSize: 16 }}>
              Visibility score{' '}
              <strong style={{ color: scoreColor(score), fontSize: 24 }}>{score}</strong>
              <span style={{ color: GRAY }}> / 100</span>
            </p>
            {mentioned != null && total != null && (
              <p style={{ color: GRAY, margin: '0 0 12px', fontSize: 15 }}>
                Appears on {mentioned} of {total} platforms checked.
              </p>
            )}
            <p style={{ color: GRAY, margin: '0 0 16px', fontSize: 13 }}>{demo.runLabel}</p>
            <a
              href={watchUrl}
              style={{
                display: 'block',
                background: BLUE,
                color: '#fff',
                textDecoration: 'none',
                borderRadius: 12,
                padding: '14px 24px',
                textAlign: 'center',
                fontSize: 17,
                fontWeight: 700,
              }}
            >
              Watch the video
            </a>
          </div>
        ))}

        {/* Product identification — prototype note (in-window design note,
            Oct 27). Static text only: it renders no video, starts no scan,
            and changes nothing about instant play above. The demo hero
            stays the low scorer (Dentists of Folsom, 35); the Product tier
            is pipeline proof only, named here, never the hero. */}
        <div style={card}>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 8px' }}>
            Product identification — prototype
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.5, margin: '0 0 8px', color: GRAY }}>
            Muse (Meta AI) doesn&apos;t just recommend businesses — it identifies products.
            Rankall checks whether it identifies YOUR product correctly, misidentifies it,
            or substitutes a competitor&apos;s product — and whether it appears in an ad
            or an organic recommendation. Ads and organic are never mixed.
          </p>
          <p style={{ fontSize: 15, lineHeight: 1.5, margin: '0 0 8px', color: GRAY }}>
            Product-tier pipeline proof: Dyson (score 97, batch run) — proof the pipeline
            covers the Product tier, not the demo hero. A surface with no permitted
            method yet is labeled &ldquo;pending&rdquo;, never scored.
          </p>
          <p style={{ fontSize: 13, lineHeight: 1.5, margin: 0, color: GRAY }}>
            Status: design/prototype in-window (Oct 26 – Nov 4). Full cross-platform
            tracking — Amazon, Shopify, eBay, Marketplace, TikTok, Walmart, and others —
            is post-Nov 4 build-phase work.
          </p>
        </div>
      </div>
    </main>
  );
}
