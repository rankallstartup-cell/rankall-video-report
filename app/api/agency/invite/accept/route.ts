import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

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

// POST /api/agency/invite/accept
// Marks an invite as used and links the authenticated user to the agency.
// Called immediately after sign-up/sign-in on the /join page.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '') || null;

  let clientUserId: string | null = null;
  if (token) {
    const { data: { user } } = await getAnonClient().auth.getUser(token);
    clientUserId = user?.id ?? null;
  }

  const body = await req.json().catch(() => null);
  const inviteToken = body?.token;
  if (!inviteToken) return NextResponse.json({ error: 'token required' }, { status: 400 });

  const sb = getAdminClient();

  // Fetch the invite
  const { data: invite, error: fetchErr } = await sb
    .from('agency_invites')
    .select('id, agency_user_id, client_email, client_name, business_name')
    .eq('token', inviteToken)
    .gt('expires_at', new Date().toISOString())
    .is('used_at', null)
    .single();

  if (fetchErr || !invite) {
    return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 404 });
  }

  // Mark invite used
  await sb
    .from('agency_invites')
    .update({ used_at: new Date().toISOString(), client_user_id: clientUserId })
    .eq('id', invite.id);

  // If we have the user's ID, link them as an agency client
  if (clientUserId && invite.agency_user_id) {
    await sb.from('agency_clients').upsert({
      agency_user_id: invite.agency_user_id,
      client_user_id: clientUserId,
      business_name: invite.business_name || null,
      contact_name: invite.client_name || null,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'agency_user_id,client_user_id', ignoreDuplicates: true });
  }

  return NextResponse.json({ success: true });
}
