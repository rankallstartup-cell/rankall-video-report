import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { agencyPlanGate } from '@/lib/agencyPlanGate';

export const dynamic = 'force-dynamic'

let _adminClient: SupabaseClient | null = null
function getAdminClient(): SupabaseClient {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
  }
  return _adminClient
}

let _anonClient: SupabaseClient | null = null
function getAnonClient(): SupabaseClient {
  if (!_anonClient) {
    _anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _anonClient
}

async function getAuthedUserId(req: NextRequest): Promise<string | null> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await getAnonClient().auth.getUser(token)
  return user?.id ?? null
}

export async function DELETE(req: NextRequest) {
  const userId = await getAuthedUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const gate = await agencyPlanGate(userId);
  if (gate) return gate;

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { client_id } = body as { client_id?: string }
  if (!client_id) return NextResponse.json({ error: 'client_id is required' }, { status: 400 })

  const sb = getAdminClient()

  // IDOR protection: delete only if the row belongs to the authenticated agency user
  const { error } = await sb
    .from('agency_clients')
    .delete()
    .eq('id', client_id)
    .eq('agency_user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
