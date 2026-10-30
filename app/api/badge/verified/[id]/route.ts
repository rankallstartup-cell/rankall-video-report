import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function genericBadge(): NextResponse {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="80" viewBox="0 0 320 80">
  <rect width="320" height="80" rx="12" ry="12" fill="#0F172A"/>
  <rect x="0" y="0" width="4" height="80" rx="2" fill="#2563EB"/>
  <circle cx="36" cy="40" r="18" fill="#059669"/>
  <text x="36" y="47" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="18" fill="#FFFFFF">✓</text>
  <text x="64" y="36" font-family="Arial,sans-serif" font-weight="700" font-size="13" fill="#FFFFFF">Verified by Rankall</text>
  <text x="64" y="56" font-family="Arial,sans-serif" font-weight="500" font-size="11" fill="#64748B">rankall.io</text>
</svg>`;
  return new NextResponse(svg, {
    headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'private, max-age=300' },
  });
}

// GET /api/badge/verified/[id] — embeddable "Verified" badge for a verified
// outcome. Renders real data ONLY for verified + public outcomes (fail closed);
// anything else gets the generic badge with no scores.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('verified_outcomes')
    .select('business_name, score_before, score_after, score_improvement, is_verified, is_public')
    .eq('id', id)
    .maybeSingle();

  const o = data as {
    business_name: string | null; score_before: number | null; score_after: number | null;
    score_improvement: number | null; is_verified: boolean | null; is_public: boolean | null;
  } | null;

  if (!o || o.is_verified !== true || o.is_public !== true) {
    return genericBadge();
  }

  const improvement = o.score_improvement ?? (o.score_after ?? 0) - (o.score_before ?? 0);
  const name = escapeXml((o.business_name || 'Verified business').slice(0, 28));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="80" viewBox="0 0 320 80">
  <defs>
    <linearGradient id="vg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0F172A"/>
      <stop offset="100%" stop-color="#1E293B"/>
    </linearGradient>
  </defs>
  <rect width="320" height="80" rx="12" ry="12" fill="url(#vg)"/>
  <rect x="0" y="0" width="4" height="80" rx="2" fill="#059669"/>
  <circle cx="36" cy="40" r="18" fill="#059669"/>
  <text x="36" y="47" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="18" fill="#FFFFFF">✓</text>
  <text x="64" y="32" font-family="Arial,sans-serif" font-weight="700" font-size="13" fill="#FFFFFF">${name}</text>
  <text x="64" y="54" font-family="Arial,sans-serif" font-weight="800" font-size="15" fill="#059669">+${improvement} pts verified</text>
</svg>`;
  return new NextResponse(svg, {
    headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' },
  });
}
