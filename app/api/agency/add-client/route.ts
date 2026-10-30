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

  // business_name is canonical; accept either business_name or legacy client_name.
  const businessName = ((body.business_name ?? body.client_name) as string | undefined)?.trim()
  const { industry, city, country, country_code, contact_email, notes } = body as Record<string, string>
  const countryCode = (country_code || country || 'US') as string

  if (!businessName) {
    return NextResponse.json({ error: 'business_name is required' }, { status: 400 })
  }
  if (!city?.trim()) {
    return NextResponse.json({ error: 'city is required' }, { status: 400 })
  }

  const sb = getAdminClient()

  // Write BOTH business_name and client_name to the same value so reads work either way.
  const { data, error } = await sb
    .from('agency_clients')
    .insert({
      agency_user_id: userId,
      business_name:  businessName,
      client_name:    businessName,
      industry:       industry || null,
      city:           city.trim(),
      country_code:   countryCode,
      contact_email:  contact_email || null,
      notes:          notes || null,
      status:         'active',
      latest_score:   0,
      score_trend:    0,
      kp_status:      'unknown',
      created_at:     new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // A2: Auto-trigger an AI-visibility scan, then update the row with the result.
  // Best-effort: if the scan fails the client is still created (status stays 'active',
  // score 0) and can be rescanned from the dashboard.
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rankall.io'
    const scanQuery = `${businessName} ${city.trim()}`.trim()
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
      const kpStatus = scan?.knowledgePanel?.claimed
        ? 'verified'
        : scan?.knowledgePanel?.exists
          ? 'unclaimed'
          : 'missing'
      const { data: updated } = await sb
        .from('agency_clients')
        .update({
          latest_score:    scan?.overallScore ?? 0,
          scan_id:         scan?.scanId ?? null,
          last_scanned_at: new Date().toISOString(),
          kp_status:       kpStatus,
        })
        .eq('id', data.id)
        .eq('agency_user_id', userId)
        .select()
        .single()
      if (updated) {
        return NextResponse.json({ success: true, client: updated, scanning: false }, { status: 201 })
      }
    }
  } catch {
    /* non-fatal — return the created row; dashboard can rescan */
  }

  return NextResponse.json({ success: true, client: data, scanning: true }, { status: 201 })
}
