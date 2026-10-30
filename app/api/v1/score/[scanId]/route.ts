import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdmin } from '@/lib/supabase';
import { isScanId } from '@/lib/reportPayload';

export const dynamic = 'force-dynamic';

// STD-06 (Part A): public read-only API v1 — no API keys, no new tables.
// Serves ONLY scans the owner has published (is_public), or the owner's own
// scans when signed in. Anything else gets the same 404 as a missing id,
// so the endpoint can't be used to probe for private scans.
//
// Simple in-memory per-IP rate limit (no DB). Resets on redeploy — fine
// for v1; keyed quotas come with the api_keys table (Part B).

const NO_STORE = { 'Cache-Control': 'no-store' } as const;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now >= entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

async function sessionUserId(req: NextRequest): Promise<string | null> {
  try {
    const authed = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } },
    );
    const { data: { user } } = await authed.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

// GET /api/v1/score/[scanId] — the scan's AI visibility score + platform
// breakdown + citation summary. Public scans only (or owner).
export async function GET(req: NextRequest, { params }: { params: Promise<{ scanId: string }> }) {
  const { scanId } = await params;
  if (!isScanId(scanId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Slow down and try again in a minute.' },
      { status: 429, headers: { ...NO_STORE, 'Retry-After': '60' } },
    );
  }

  const admin = getSupabaseAdmin();
  const viewerId = await sessionUserId(req);

  const { data: scan } = await admin
    .from('rankall_scans')
    .select('id, user_id, user_business_name, input, overall_score, industry, city, is_public, created_at')
    .eq('id', scanId)
    .maybeSingle();
  if (!scan) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  }
  const row = scan as {
    user_id: string | null; user_business_name: string | null; input: string | null;
    overall_score: number | null; industry: string | null; city: string | null;
    is_public: boolean | null; created_at: string | null;
  };
  const isOwner = !!viewerId && !!row.user_id && viewerId === row.user_id;
  if (row.is_public !== true && !isOwner) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  }

  const { data: platformRows } = await admin
    .from('rankall_platform_results')
    .select('platform, mentioned, sentiment')
    .eq('scan_id', scanId);

  const platforms = ((platformRows as Array<Record<string, unknown>> | null) ?? []).map(r => ({
    platform: r.platform,
    mentioned: !!r.mentioned,
    sentiment: r.sentiment ?? null,
  }));
  const mentioned = platforms.filter(p => p.mentioned).length;

  return NextResponse.json(
    {
      scan_id: scanId,
      business: row.user_business_name || row.input?.split(' in ')[0] || null,
      industry: row.industry,
      city: row.city,
      ai_visibility_score: row.overall_score,
      platforms_responded: platforms.length,
      platforms_mentioned: mentioned,
      platforms,
      scanned_at: row.created_at,
      source: 'rankall.io',
    },
    { headers: NO_STORE },
  );
}
