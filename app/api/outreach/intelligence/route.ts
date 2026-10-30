import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getAdminUser, isCronRequest } from '@/lib/apiAuth';

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

// CRON_SECRET bearer (fails closed when unset — the old string compare
// accepted "Bearer undefined") or an admin session via isAdminUser (the
// single admin allowlist in lib/planConfig; no local copies).
async function checkAdminAuth(req: NextRequest): Promise<boolean> {
  if (isCronRequest(req)) return true;
  return !!(await getAdminUser(req));
}

// GET /api/outreach/intelligence — list hot leads for admin
export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50') || 50, 1), 500);
  const status = searchParams.get('status') || null;

  const sb = getAdminClient();
  let query = sb
    .from('outreach_intelligence')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, leads: data });
}

// POST /api/outreach/intelligence — upsert intelligence record
export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { scan_id, business_name, email, score, country_code, status, notes } = body;

  const sb = getAdminClient();
  const { data, error } = await sb
    .from('outreach_intelligence')
    .upsert({
      scan_id,
      business_name,
      email,
      score,
      country_code,
      status: status || 'new',
      notes,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'scan_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, lead: data });
}

