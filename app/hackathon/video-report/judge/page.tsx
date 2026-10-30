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
        <p style={{ fontSize: 18, lineHeight: 1.5, margin: '0 0 24px', color: GRAY }}>
          No login, no waiting on a scan. Each video below is a previously completed real run —
          labeled with its real date, never presented as freshly generated. Tap one and it plays.
        </p>

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
