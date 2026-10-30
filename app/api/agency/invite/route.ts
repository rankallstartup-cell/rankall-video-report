import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { agencyPlanGate } from '@/lib/agencyPlanGate';

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

let _anonClient: SupabaseClient | null = null;
function getAnonClient(): SupabaseClient {
  if (!_anonClient) {
    _anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _anonClient;
}

async function getAuthedUserId(req: NextRequest): Promise<string | null> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await getAnonClient().auth.getUser(token);
  return user?.id ?? null;
}

// POST /api/agency/invite — create an invite link for a client (authenticated agency only)
export async function POST(req: NextRequest) {
  const userId = await getAuthedUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const gate = await agencyPlanGate(userId);
  if (gate) return gate;

  const { client_email, client_name, business_name } = await req.json();
  if (!client_email) return NextResponse.json({ error: 'client_email required' }, { status: 400 });

  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const sb = getAdminClient();
  const { data, error } = await sb
    .from('agency_invites')
    .insert({
      agency_user_id: userId,
      client_email,
      client_name,
      business_name,
      token,
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const inviteUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://rankall.io'}/join?token=${token}`;

  return NextResponse.json({ success: true, invite: data, inviteUrl });
}

// GET /api/agency/invite?token=XXX — validate an invite token (public — used on the join page)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });

  const sb = getAdminClient();
  const { data, error } = await sb
    .from('agency_invites')
    .select('client_email, client_name, business_name, expires_at, used_at')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .is('used_at', null)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 404 });

  return NextResponse.json({ success: true, invite: { client_email: data.client_email, client_name: data.client_name, business_name: data.business_name } });
}
