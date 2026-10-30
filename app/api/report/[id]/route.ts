import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabaseAdmin } from '@/lib/supabase';
import { resolvePlanServer } from '@/lib/resolvePlanServer';
import { isBusinessPlan } from '@/lib/planConfig';
import { buildReportPayload, canViewReport, isScanId } from '@/lib/reportPayload';
import { trackFunnelEvent, readSourceCookie } from '@/lib/funnel';

export const dynamic = 'force-dynamic';

// b0fm + ax8b: server-side report data. The report page used to read
// rankall_scans / rankall_platform_results in the browser with the anon
// key (select('*')), so locked trust-signal details and full AI responses
// reached every visitor. This route loads with the service role and
// returns the payload already filtered for the SESSION viewer — see
// lib/reportPayload.ts for the tiers and access rule.

const NO_STORE = { 'Cache-Control': 'private, no-store' };

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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isScanId(id)) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });

  try {
    const admin = getSupabaseAdmin();
    const viewerId = await sessionUserId(req);

    const { data: scanRow, error: scanError } = await admin
      .from('rankall_scans')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (scanError) {
      console.error('[api/report] scan load error:', scanError);
      return NextResponse.json({ error: 'Load failed' }, { status: 500, headers: NO_STORE });
    }
    if (!scanRow) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });

    // Owned scans: owner only. A stranger gets the same 404 as a missing
    // id, so the route can't be used to probe which ids exist.
    const ownerId = (scanRow as { user_id?: string | null }).user_id ?? null;
    if (!canViewReport(ownerId, viewerId)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
    }

    // CONV-00: funnel instrumentation (fire-and-forget, never throws).
    trackFunnelEvent({
      event: 'report_viewed',
      userId: viewerId,
      scanId: id,
      ...readSourceCookie(req),
    });

    // Same rule as the page's isPaid (admin || business plan). Fail closed
    // to 'member' — the tier every signed-in user gets anyway.
    let isPaidOrAdmin = false;
    if (viewerId) {
      try {
        const { plan, isAdmin } = await resolvePlanServer(viewerId);
        isPaidOrAdmin = isAdmin || isBusinessPlan(plan);
      } catch { /* member tier */ }
    }

    // ax70 / item 8: a platform-rows failure is reported, never collapsed
    // into "no AI platforms responded".
    const { data: resultRows, error: resultsErr } = await admin
      .from('rankall_platform_results')
      .select('*')
      .eq('scan_id', id)
      .order('created_at', { ascending: true });
    if (resultsErr) console.error('[api/report] platform results load error:', resultsErr);

    let shareSlug: string | null = null;
    try {
      const { data: link } = await admin
        .from('rankall_report_links')
        .select('slug')
        .eq('scan_id', id)
        .maybeSingle();
      shareSlug = (link as { slug?: string } | null)?.slug ?? null;
    } catch { /* best-effort */ }

    const payload = buildReportPayload({
      scanRow: scanRow as Record<string, unknown>,
      resultRows: resultsErr ? null : ((resultRows ?? []) as Array<Record<string, unknown>>),
      resultsError: !!resultsErr,
      shareSlug,
      viewerId,
      isPaidOrAdmin,
    });
    return NextResponse.json(payload, { headers: NO_STORE });
  } catch (err) {
    console.error('[api/report] unexpected error:', err);
    return NextResponse.json({ error: 'Load failed' }, { status: 500, headers: NO_STORE });
  }
}

// POST { action: 'share' | 'unshare' } — the OWNER explicitly publishes
// (or un-publishes) this scan for the public share surfaces: /r/[id], its
// OG image, /score/[slug] and the embeddable badge. Owner derived from the
// session; the id is ownership-checked before the service-role write.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isScanId(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let action: unknown = null;
  try { action = (await req.json())?.action; } catch { /* invalid body */ }
  if (action !== 'share' && action !== 'unshare') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const viewerId = await sessionUserId(req);
  if (!viewerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const admin = getSupabaseAdmin();
    const { data: scanRow } = await admin
      .from('rankall_scans')
      .select('user_id')
      .eq('id', id)
      .maybeSingle();
    const ownerId = (scanRow as { user_id?: string | null } | null)?.user_id ?? null;
    if (!scanRow || !ownerId || ownerId !== viewerId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const { error } = await admin
      .from('rankall_scans')
      .update({ is_public: action === 'share' })
      .eq('id', id)
      .eq('user_id', viewerId);
    if (error) {
      // Most likely the 20261016000600_report_rls_lockdown migration (is_public
      // column) isn't applied yet. Fail closed: the scan stays private.
      console.error('[api/report] share update failed:', error);
      return NextResponse.json({ error: 'Sharing is unavailable right now' }, { status: 503 });
    }
    // CONV-01: funnel instrumentation — the owner shared this report
    // (fire-and-forget, never throws).
    if (action === 'share') {
      trackFunnelEvent({
        event: 'report_shared',
        userId: viewerId,
        scanId: id,
        ...readSourceCookie(req),
      });
    }
    return NextResponse.json({ ok: true, isPublic: action === 'share' });
  } catch (err) {
    console.error('[api/report] share error:', err);
    return NextResponse.json({ error: 'Sharing is unavailable right now' }, { status: 503 });
  }
}
