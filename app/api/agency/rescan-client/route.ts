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

export async function POST(req: NextRequest) {
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

  // IDOR protection: verify client belongs to the authenticated agency user
  const { data: client, error: fetchError } = await sb
    .from('agency_clients')
    .select('id, business_name, client_name, city, country_code, latest_score')
    .eq('id', client_id)
    .eq('agency_user_id', userId)
    .single()

  if (fetchError || !client) {
    return NextResponse.json({ error: 'Client not found or access denied' }, { status: 404 })
  }

  const businessName = (client.business_name || client.client_name || '').trim()
  const city = (client.city || '').trim()
  const countryCode = client.country_code || 'US'
  const prevScore = client.latest_score ?? 0

  // Run a fresh AI-visibility scan and update the row with the result.
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rankall.io'
    const scanQuery = `${businessName} ${city}`.trim()
    // P0a: forward the agency user's token — /api/scan derives the userId from
    // the validated session and rejects a mismatched body userId.
    const incomingAuth = req.headers.get('authorization')
    const scanRes = await fetch(`${baseUrl}/api/scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(incomingAuth ? { Authorization: incomingAuth } : {}),
      },
      body: JSON.stringify({ input: scanQuery, userId, country_code: countryCode }),
    })

    if (scanRes.ok) {
      const scan = await scanRes.json()
      const newScore = scan?.overallScore ?? prevScore
      const kpStatus = scan?.knowledgePanel?.claimed
        ? 'verified'
        : scan?.knowledgePanel?.exists
          ? 'unclaimed'
          : 'missing'
      const { error: updateError } = await sb
        .from('agency_clients')
        .update({
          latest_score:    newScore,
          score_trend:     newScore - prevScore,
          scan_id:         scan?.scanId ?? null,
          kp_status:       kpStatus,
          last_scanned_at: new Date().toISOString(),
        })
        .eq('id', client_id)
        .eq('agency_user_id', userId)
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }
  } catch {
    /* fall through to timestamp-only update */
  }

  // Scan unavailable — at least bump the timestamp.
  const { error: updateError } = await sb
    .from('agency_clients')
    .update({ last_scanned_at: new Date().toISOString() })
    .eq('id', client_id)
    .eq('agency_user_id', userId)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
