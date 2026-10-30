import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdmin } from '@/lib/supabase';
import { fixTypeLabel } from '@/lib/fixIntelligence';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // ax72: a proof card is a VERIFIED claim — it may only be generated
    // from a verified_outcomes row the caller owns. The old route took
    // businessName/beforeScore/afterScore with no auth, so anyone could
    // forge a card stamping '✓ Scores verified' on arbitrary numbers.
    // Client-supplied scores are no longer accepted at all.
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { verifiedOutcomeId } = await req.json();
    if (!verifiedOutcomeId) {
      return NextResponse.json({ error: 'verifiedOutcomeId required' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data: outcome } = await admin
      .from('verified_outcomes')
      .select('*')
      .eq('id', verifiedOutcomeId)
      .single();
    if (!outcome || (outcome as { user_id: string }).user_id !== user.id) {
      return NextResponse.json({ error: 'Outcome not found' }, { status: 404 });
    }
    if (!(outcome as { is_verified: boolean }).is_verified) {
      return NextResponse.json({ error: 'This improvement has not been verified yet — the proof card is available once the verification rescan confirms it.' }, { status: 403 });
    }

    const o = outcome as {
      business_name?: string | null;
      score_before?: number | null;
      score_after?: number | null;
      fix_type?: string | null;
      created_at?: string | null;
      verified_at?: string | null;
    };
    const businessName = o.business_name || 'Your Business';
    const beforeScore = Number(o.score_before ?? 0);
    const afterScore = Number(o.score_after ?? 0);
    const beforeDate = o.created_at ?? null;
    const afterDate = o.verified_at ?? null;
    // The fix on the card is the verified outcome's fix — never a
    // self-reported label (the old 'VERIFIED FIX').
    const fixLabel = fixTypeLabel(o.fix_type ?? '');
    // No new-platform names: the outcome row has platform COUNTS, not
    // names — naming platforms would be guessing.

    const delta = afterScore - beforeScore;
    const formattedBefore = beforeDate
      ? new Date(beforeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '';
    const formattedAfter = afterDate
      ? new Date(afterDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '';

    const platformsText = '';


    // Build 1200×628 SVG proof card
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="628" viewBox="0 0 1200 628">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0F172A"/>
      <stop offset="100%" stop-color="#1E293B"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#F59E0B"/>
      <stop offset="100%" stop-color="#FBBF24"/>
    </linearGradient>
    <linearGradient id="blue" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#2563EB"/>
      <stop offset="100%" stop-color="#3B82F6"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="1200" height="628" fill="url(#bg)"/>

  <!-- Subtle grid lines -->
  <line x1="0" y1="200" x2="1200" y2="200" stroke="#FFFFFF" stroke-opacity="0.03" stroke-width="1"/>
  <line x1="0" y1="400" x2="1200" y2="400" stroke="#FFFFFF" stroke-opacity="0.03" stroke-width="1"/>
  <line x1="400" y1="0" x2="400" y2="628" stroke="#FFFFFF" stroke-opacity="0.03" stroke-width="1"/>
  <line x1="800" y1="0" x2="800" y2="628" stroke="#FFFFFF" stroke-opacity="0.03" stroke-width="1"/>

  <!-- Top accent bar -->
  <rect x="0" y="0" width="1200" height="5" fill="url(#gold)"/>

  <!-- Left accent stripe -->
  <rect x="60" y="80" width="4" height="468" rx="2" fill="url(#gold)" opacity="0.6"/>

  <!-- Header: Logo + brand -->
  <rect x="88" y="52" width="36" height="36" rx="8" fill="#2563EB"/>
  <text x="106" y="75" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="18" fill="white">R</text>
  <text x="136" y="75" font-family="Arial,sans-serif" font-weight="800" font-size="20" fill="white">rankall</text>
  <text x="207" y="75" font-family="Arial,sans-serif" font-weight="800" font-size="20" fill="#2563EB">.io</text>

  <!-- Verified badge top right: only the scores are verified from scans.
       Nothing here proves the listed fix caused the change. -->
  <rect x="980" y="48" width="172" height="36" rx="18" fill="#059669" fill-opacity="0.15" stroke="#059669" stroke-width="1.5"/>
  <text x="1066" y="70" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="13" fill="#34D399">✓ Scores verified</text>

  <!-- Business name -->
  <text x="88" y="158" font-family="Arial,sans-serif" font-weight="900" font-size="42" fill="white">${escapeXml(businessName || 'Your Business')}</text>

  <!-- Headline -->
  <text x="88" y="210" font-family="Arial,sans-serif" font-weight="600" font-size="22" fill="#94A3B8">AI Visibility Score improved</text>

  <!-- Score comparison: BEFORE → AFTER -->
  <!-- Before box -->
  <rect x="88" y="244" width="200" height="140" rx="16" fill="#1E293B" stroke="#334155" stroke-width="1.5"/>
  <text x="188" y="298" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="62" fill="#64748B">${beforeScore}</text>
  <text x="188" y="330" text-anchor="middle" font-family="Arial,sans-serif" font-weight="600" font-size="14" fill="#475569">Before</text>
  <text x="188" y="372" text-anchor="middle" font-family="Arial,sans-serif" font-weight="500" font-size="12" fill="#334155">${formattedBefore}</text>

  <!-- Arrow -->
  <text x="328" y="325" text-anchor="middle" font-family="Arial,sans-serif" font-size="52" fill="#2563EB">→</text>

  <!-- After box -->
  <rect x="368" y="244" width="200" height="140" rx="16" fill="#1E293B" stroke="#F59E0B" stroke-width="2"/>
  <text x="468" y="298" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="62" fill="#F59E0B" filter="url(#glow)">${afterScore}</text>
  <text x="468" y="330" text-anchor="middle" font-family="Arial,sans-serif" font-weight="600" font-size="14" fill="#FCD34D">After</text>
  <text x="468" y="372" text-anchor="middle" font-family="Arial,sans-serif" font-weight="500" font-size="12" fill="#92400E">${formattedAfter}</text>

  <!-- Delta badge -->
  <rect x="592" y="270" width="172" height="60" rx="30" fill="#F59E0B" fill-opacity="0.15" stroke="#F59E0B" stroke-width="1.5"/>
  <text x="678" y="307" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="28" fill="#F59E0B">+${delta} pts</text>

  <!-- What caused this: user-declared, not verified causation -->
  <rect x="88" y="414" width="480" height="64" rx="12" fill="#1E293B" stroke="#334155" stroke-width="1"/>
  <text x="108" y="440" font-family="Arial,sans-serif" font-weight="600" font-size="12" fill="#64748B">VERIFIED FIX</text>
  <text x="108" y="463" font-family="Arial,sans-serif" font-weight="700" font-size="16" fill="#E2E8F0">${escapeXml(fixLabel)}</text>

  <!-- New platforms -->
  ${platformsText ? `
  <text x="88" y="510" font-family="Arial,sans-serif" font-weight="600" font-size="13" fill="#64748B">NOW APPEARING ON</text>
  <text x="88" y="536" font-family="Arial,sans-serif" font-weight="700" font-size="16" fill="#60A5FA">${escapeXml(platformsText)}</text>
  ` : ''}

  <!-- Right panel: big stat -->
  <rect x="800" y="140" width="320" height="320" rx="24" fill="#1E293B" stroke="#334155" stroke-width="1.5"/>
  <text x="960" y="210" text-anchor="middle" font-family="Arial,sans-serif" font-weight="600" font-size="14" fill="#64748B">AI VISIBILITY SCORE</text>
  <text x="960" y="310" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="110" fill="#F59E0B">${afterScore}</text>
  <text x="960" y="348" text-anchor="middle" font-family="Arial,sans-serif" font-weight="600" font-size="16" fill="#94A3B8">out of 100</text>
  <rect x="870" y="374" width="180" height="44" rx="22" fill="#F59E0B" fill-opacity="0.15" stroke="#F59E0B" stroke-width="1.5"/>
  <text x="960" y="401" text-anchor="middle" font-family="Arial,sans-serif" font-weight="800" font-size="18" fill="#F59E0B">+${delta} improvement</text>

  <!-- Footer -->
  <text x="600" y="598" text-anchor="middle" font-family="Arial,sans-serif" font-weight="500" font-size="13" fill="#334155">rankall.io · AI Visibility Intelligence · Generated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</text>
</svg>`;

    const base64 = Buffer.from(svg).toString('base64');
    const dataUrl = `data:image/svg+xml;base64,${base64}`;

    return NextResponse.json({ success: true, svg, dataUrl });
  } catch (err) {
    console.error('Proof card error:', err);
    return NextResponse.json({ error: 'Failed to generate proof card' }, { status: 500 });
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
