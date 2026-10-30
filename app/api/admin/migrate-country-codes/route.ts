import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { inferCountryFromText } from '@/lib/countryConfig';
import { getAdminUser, isCronRequest } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BATCH_SIZE = 100;

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
const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_t, p) { return (getAdminClient() as any)[p]; },
});

// One-time migration: backfill country_code for scans saved before per-scan
// country detection existed. Infers the country from each scan's location/input
// text (the same inference the scan route + report page use), defaulting to US
// when no confident signal is present. Run repeatedly until remaining = 0.
//
// Auth: CRON_SECRET bearer token (cron, no session) or an admin session.
export async function POST(req: NextRequest) {
  try {
    // 1. Auth — CRON_SECRET bearer (fails closed when unset) OR a real
    // admin SESSION. body.callerEmail is ignored: it was attacker-supplied,
    // so it never proved anything.
    if (!isCronRequest(req) && !(await getAdminUser(req))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 3. Fetch one batch of scans missing a country_code
    const { data: scans, error: fetchErr } = await (supabaseAdmin as any)
      .from('rankall_scans')
      .select('id, location, input')
      .is('country_code', null)
      .limit(BATCH_SIZE);

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    if (!scans || scans.length === 0) {
      return NextResponse.json({ updated: 0, remaining: 0, done: true });
    }

    // 4. Infer + update each scan
    let updated = 0;
    for (const scan of scans) {
      const inferred = inferCountryFromText(scan.location || '', scan.input || '') || 'US';
      const { error: updErr } = await (supabaseAdmin as any)
        .from('rankall_scans')
        .update({ country_code: inferred })
        .eq('id', scan.id);
      if (!updErr) updated++;
    }

    // 5. Count remaining nulls so the caller knows whether to run again
    const { count: remaining } = await (supabaseAdmin as any)
      .from('rankall_scans')
      .select('id', { count: 'exact', head: true })
      .is('country_code', null);

    return NextResponse.json({
      updated,
      remaining: remaining ?? 0,
      done: (remaining ?? 0) === 0,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
