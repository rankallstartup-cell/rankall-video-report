import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAdminOrInternalActor } from '@/lib/apiAuth';
import { checkRateLimitDb } from '@/lib/rateLimit';
import { isScanShareable, isValidScanId } from '@/lib/outreachFailureShapes';

export const dynamic = 'force-dynamic';

// Fix #10: the dashboard CSV export needs to know which scan ids are
// shareable BEFORE it writes report_url, so it never links to a private
// report. The check runs server-side (service role) with the same rule
// as fix #1: ownerless → shareable, owned → only if is_public.
// Fail-closed: unknown ids, lookup errors, and owned-private scans all
// come back false, and the export writes an empty report_url for them.
const OUTREACH_RATE_LIMIT = { limit: 100, windowMs: 24 * 60 * 60 * 1000 };
const MAX_IDS = 200;

export async function POST(req: NextRequest) {
  const actor = await getAdminOrInternalActor(req);
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rl = await checkRateLimitDb('outreach:report-eligibility', actor, OUTREACH_RATE_LIMIT);
  if (!rl.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  try {
    const { scanIds } = await req.json();
    if (!Array.isArray(scanIds)) {
      return NextResponse.json({ error: 'scanIds must be an array' }, { status: 400 });
    }
    const ids = [...new Set(scanIds.filter((id): id is string => typeof id === 'string'))]
      .filter(isValidScanId)
      .slice(0, MAX_IDS);

    const shareable: Record<string, boolean> = {};
    for (const id of ids) shareable[id] = false;
    if (ids.length === 0) return NextResponse.json({ shareable });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { data, error } = await supabase
      .from('rankall_scans')
      .select('id, user_id, is_public')
      .in('id', ids);
    if (error) {
      console.error('[report-eligibility] lookup failed:', error.message);
      return NextResponse.json({ error: 'eligibility_lookup_failed' }, { status: 500 });
    }
    for (const row of (data ?? []) as Array<{ id: string; user_id: string | null; is_public: unknown }>) {
      shareable[row.id] = isScanShareable(row.user_id, row.is_public);
    }
    return NextResponse.json({ shareable });
  } catch (err: any) {
    console.error('[report-eligibility] error:', err?.message);
    return NextResponse.json({ error: 'Failed to check report eligibility' }, { status: 500 });
  }
}
