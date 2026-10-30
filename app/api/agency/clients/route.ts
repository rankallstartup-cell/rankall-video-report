import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
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

// Derive the authenticated user id from the request's Bearer token.
// NEVER trust a client-supplied user_id — that would be a cross-tenant IDOR.
async function getAuthedUserId(req: NextRequest): Promise<string | null> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user } } = await getAnonClient().auth.getUser(token);
  return user?.id ?? null;
}

// GET /api/agency/clients — list the authenticated agency's clients
export async function GET(req: NextRequest) {
  const userId = await getAuthedUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const gate = await agencyPlanGate(userId);
  if (gate) return gate;

  const sb = getAdminClient();
  const { data, error } = await sb
    .from('agency_clients')
    .select('*')
    .eq('agency_user_id', userId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, clients: data });
}

// POST /api/agency/clients — add a client to the authenticated agency
export async function POST(req: NextRequest) {
  const userId = await getAuthedUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const gate = await agencyPlanGate(userId);
  if (gate) return gate;

  const { client_name, client_email, business_name, location, country_code, query } = await req.json();

  const sb = getAdminClient();
  const { data, error } = await sb
    .from('agency_clients')
    .insert({
      agency_user_id: userId,
      client_name,
      client_email,
      business_name,
      location,
      country_code,
      query,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, client: data });
}

// DELETE /api/agency/clients — remove a client owned by the authenticated agency
export async function DELETE(req: NextRequest) {
  const userId = await getAuthedUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const gate = await agencyPlanGate(userId);
  if (gate) return gate;

  const { client_id } = await req.json();
  if (!client_id) return NextResponse.json({ error: 'client_id required' }, { status: 400 });

  const sb = getAdminClient();
  const { error } = await sb
    .from('agency_clients')
    .delete()
    .eq('id', client_id)
    .eq('agency_user_id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
