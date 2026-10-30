import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { canAccessScan, getSessionUser } from '@/lib/apiAuth';
import { canServePublicShare, isScanId } from '@/lib/reportPayload';
import { scanInfoAccess, scanInfoPayload } from '@/lib/scanInfoAccess';

export const dynamic = 'force-dynamic';

let _adminClient: SupabaseClient | null = null;
function getAdminClient(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }
  return _adminClient;
}

const NO_STORE = { 'Cache-Control': 'private, no-store' };

// GET /api/scan-info?scan_id=XXX — scan metadata. Same access rule as the
// report route: the owner (or admin, or the agency whose client row points
// at this scan) gets the full fields; an ownerless (outreach/homepage) scan
// or one the owner published (is_public) gets the free public fields only;
// anyone else gets the same 404 as a missing id. It used to return name /
// score / competitor / location for ANY scan id to anyone.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const scan_id = searchParams.get('scan_id');
  if (!scan_id) return NextResponse.json({ error: 'scan_id required' }, { status: 400 });
  if (!isScanId(scan_id)) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });

  const sb = getAdminClient();
  const { data, error } = await sb
    .from('rankall_scans')
    .select('*')
    .eq('id', scan_id)
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  const row = data as Record<string, unknown>;

  const viewer = await getSessionUser(req);
  let agencyLinked = false;
  const ownerId = (row.user_id as string | null | undefined) ?? null;
  if (viewer && !canAccessScan({ user_id: ownerId }, viewer)) {
    const { data: link, error: linkErr } = await sb
      .from('agency_clients')
      .select('id')
      .eq('agency_user_id', viewer.id)
      .eq('latest_scan_id', scan_id)
      .limit(1)
      .maybeSingle();
    agencyLinked = !linkErr && !!link;
  }

  const access = scanInfoAccess({
    ownerOrAdmin: canAccessScan({ user_id: ownerId }, viewer),
    agencyLinked,
    publicShare: canServePublicShare(ownerId, row.is_public),
  });
  if (access === 'none') return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  return NextResponse.json(scanInfoPayload(row, access), { headers: NO_STORE });
}
