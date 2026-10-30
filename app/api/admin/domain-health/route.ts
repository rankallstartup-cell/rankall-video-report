import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { isAdminUser } from '@/lib/planConfig';

// ax77: verify the caller's REAL session — the old code trusted a
// client-supplied ?callerEmail= query param, so anyone could pass
// ?callerEmail=nandish@rankall.io and pass as admin.
async function requireAdmin(): Promise<boolean> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return isAdminUser(user?.email);
}

export const dynamic = 'force-dynamic';

let _adminClient: SupabaseClient | null = null;
function createAdminClient(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }
  return _adminClient;
}

export async function GET(req: NextRequest) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('outreach_domain_health')
      .select('*')
      .order('domain', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ domains: data ?? [] });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { action, domain } = await req.json();
    if (!domain || (action !== 'pause' && action !== 'resume')) {
      return NextResponse.json({ error: 'Invalid action or domain' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const update = action === 'pause'
      ? { status: 'paused', paused_at: new Date().toISOString(), pause_reason: 'Manually paused by admin', updated_at: new Date().toISOString() }
      : { status: 'active', paused_at: null, pause_reason: null, updated_at: new Date().toISOString() };

    const { error } = await supabase.from('outreach_domain_health').update(update).eq('domain', domain);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
