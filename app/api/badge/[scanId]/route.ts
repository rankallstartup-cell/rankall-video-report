import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getTrustedDisplayName } from '@/lib/enrichment';
import { canServeBadge, isScanId } from '@/lib/reportPayload';
import { badgeScore, badgeGrade } from '@/lib/badgeScore';

export const dynamic = 'force-dynamic';

function scoreColor(s: number): string {
  if (s >= 70) return '#059669';
  if (s >= 40) return '#D97706';
  return '#DC2626';
}

function scoreBg(s: number): string {
  if (s >= 70) return '#ECFDF5';
  if (s >= 40) return '#FFFBEB';
  return '#FEF2F2';
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ scanId: string }> }
) {
  const { scanId } = await params;

  const supabase = getSupabaseAdmin();
  type BadgeScan = {
    overall_score: number | null; trust_signals: unknown; user_business_name: string | null;
    input: string | null; location: string | null; enrichment: unknown;
    user_id: string | null; is_public?: boolean | null;
  };
  let scan = null as BadgeScan | null;
  if (isScanId(scanId)) {
    // select('*') so a missing is_public column (migration not applied)
    // reads as undefined -> not public -> generic badge (fail closed).
    const { data } = await supabase.from('rankall_scans').select('*').eq('id', scanId).maybeSingle();
    scan = (data as BadgeScan | null) ?? null;
  }

  // ax8b item 2: service-role read, so this route enforces access itself.
  // The badge is for embedding on the OWNER's site: real name + score only
  // for an owned scan the owner published (is_public, set when they copy
  // the embed code) or the owner previewing it while signed in. Ownerless
  // scans and private owned scans get a generic badge with no name/score.
  let viewerId: string | null = null;
  if (scan?.user_id && scan.is_public !== true) {
    try {
      const authed = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } },
      );
      const { data: { user } } = await authed.auth.getUser();
      viewerId = user?.id ?? null;
    } catch { /* anonymous */ }
  }
  if (!scan || !canServeBadge(scan.user_id, scan.is_public, viewerId)) {
    const generic = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="80" viewBox="0 0 320 80">
  <defs>
    <linearGradient id="navyGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0F172A"/>
      <stop offset="100%" stop-color="#1E293B"/>
    </linearGradient>
  </defs>
  <rect width="320" height="80" rx="12" ry="12" fill="url(#navyGrad)"/>
  <rect x="0" y="0" width="4" height="80" rx="2" fill="#2563EB"/>
  <circle cx="36" cy="40" r="18" fill="#2563EB"/>
  <text x="36" y="46" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="16" fill="#FFFFFF">R</text>
  <text x="64" y="36" font-family="Arial,sans-serif" font-weight="700" font-size="13" fill="#FFFFFF">AI Visibility</text>
  <text x="64" y="56" font-family="Arial,sans-serif" font-weight="500" font-size="11" fill="#64748B">Private report — Rankall.io</text>
</svg>`;
    return new NextResponse(generic, {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'private, max-age=300' },
    });
  }

  // b89f: the badge says "AI Visibility Score" — it must carry the
  // visibility score, never the Trust overall (see lib/badgeScore).
  const score = badgeScore(scan);
  // #39: never show a stale wrong-business stored Google name.
  const trustedName = getTrustedDisplayName(
    scan.input, scan.location, scan.user_business_name,
    (scan.enrichment as { google?: Parameters<typeof getTrustedDisplayName>[3] } | null)?.google,
  );
  const name  = (trustedName === scan.input ? scan.input?.split(' in ')[0] : trustedName) || 'Your Business';
  const color = scoreColor(score);
  const bg    = scoreBg(score);
  const label = badgeGrade(score);
  const shortName = name.length > 22 ? name.slice(0, 20) + '…' : name;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="80" viewBox="0 0 320 80">
  <defs>
    <linearGradient id="navyGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0F172A"/>
      <stop offset="100%" stop-color="#1E293B"/>
    </linearGradient>
    <clipPath id="rounded">
      <rect width="320" height="80" rx="12" ry="12"/>
    </clipPath>
  </defs>

  <!-- Background -->
  <rect width="320" height="80" rx="12" ry="12" fill="url(#navyGrad)"/>

  <!-- Left accent bar -->
  <rect x="0" y="0" width="4" height="80" rx="2" fill="#2563EB"/>

  <!-- Logo circle -->
  <circle cx="36" cy="40" r="18" fill="#2563EB"/>
  <text x="36" y="46" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="16" fill="#FFFFFF">R</text>

  <!-- Business name -->
  <text x="64" y="28" font-family="Arial,sans-serif" font-weight="700" font-size="12" fill="#94A3B8">${escapeXml(shortName)}</text>

  <!-- Label -->
  <text x="64" y="46" font-family="Arial,sans-serif" font-weight="600" font-size="11" fill="#64748B">AI Visibility Score</text>

  <!-- Score number -->
  <text x="64" y="68" font-family="Arial,sans-serif" font-weight="900" font-size="22" fill="#FFFFFF">${score}</text>
  <text x="${64 + (score >= 100 ? 40 : score >= 10 ? 33 : 22)}" y="68" font-family="Arial,sans-serif" font-weight="500" font-size="13" fill="#64748B">/100</text>

  <!-- Score pill (right side) — widened: canonical grades include "Not Visible" -->
  <rect x="206" y="22" width="98" height="36" rx="18" fill="${bg}" opacity="0.15"/>
  <rect x="206" y="22" width="98" height="36" rx="18" fill="none" stroke="${color}" stroke-width="1.5"/>
  <text x="255" y="45" text-anchor="middle" font-family="Arial,sans-serif" font-weight="800" font-size="12" fill="${color}">${label}</text>

  <!-- Footer text -->
  <text x="160" y="76" text-anchor="middle" font-family="Arial,sans-serif" font-weight="500" font-size="9" fill="#334155">Verified by Rankall.io</text>
</svg>`;

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': scan.is_public === true ? 'public, max-age=3600' : 'private, no-store',
    },
  });
}
