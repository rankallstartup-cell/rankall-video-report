// ⚠️ DEPRECATED — the canonical Apollo webhook is now `app/api/webhooks/apollo/route.ts`.
// That one is the single source of truth: it dedupes, triggers a scan, generates the
// video, saves to `outreach_targets`, and enrols the prospect into the Day-1 cold
// sequence (outreach_sequence_log → /api/cron/outreach-sequence).
// This route (which seeds `outreach_intelligence` in batch) is retained only so any
// existing Apollo config pointed here keeps working — point new configs at
// /api/webhooks/apollo instead. Do not add new functionality here.
import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { inferCountryFromText } from '@/lib/countryConfig';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

// POST /api/outreach/apollo-webhook
// Receives lead records pushed from Apollo.io (or a Zapier/Make bridge) and
// seeds them into outreach_intelligence so they can be scanned + contacted.
//
// Auth: shared secret in the `x-apollo-secret` header (set in Apollo webhook config)
// matched against APOLLO_WEBHOOK_SECRET. Apollo cannot send a bearer token, hence
// the custom header.
//
// Body (flexible — accepts a single record or { people: [...] }):
//   { first_name, last_name, email, organization_name, city, state, country,
//     industry, phone, website_url }
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-apollo-secret');
  if (!process.env.APOLLO_WEBHOOK_SECRET || secret !== process.env.APOLLO_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  // Normalise to an array of people
  const people: any[] = Array.isArray(payload)
    ? payload
    : payload.people || payload.contacts || [payload];

  const sb = getAdminClient();
  const results: { email: string | null; status: string }[] = [];

  for (const p of people) {
    const email = p.email || p.contact_email || null;
    const businessName = p.organization_name || p.company || p.organization?.name || null;
    if (!email && !businessName) {
      results.push({ email: null, status: 'skipped_no_identity' });
      continue;
    }

    const locationText = [p.city, p.state, p.country].filter(Boolean).join(', ');
    const countryCode =
      inferCountryFromText(locationText, businessName || '') ||
      (typeof p.country === 'string' && p.country.length === 2 ? p.country.toUpperCase() : null) ||
      'US';

    try {
      // Dedupe by email — don't re-insert a lead we already track
      if (email) {
        const { data: existing } = await sb
          .from('outreach_intelligence')
          .select('id')
          .eq('email', email)
          .maybeSingle();
        if (existing) {
          results.push({ email, status: 'duplicate' });
          continue;
        }
      }

      await sb.from('outreach_intelligence').insert({
        business_name: businessName,
        email,
        country_code: countryCode,
        status: 'new',
        notes: JSON.stringify({
          source: 'apollo',
          first_name: p.first_name || null,
          last_name: p.last_name || null,
          phone: p.phone || p.sanitized_phone || null,
          website: p.website_url || p.organization?.website_url || null,
          industry: p.industry || null,
          location: locationText || null,
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      results.push({ email, status: 'inserted' });
    } catch (e) {
      console.error('apollo-webhook insert error:', e);
      results.push({ email, status: 'error' });
    }
  }

  const inserted = results.filter(r => r.status === 'inserted').length;
  return NextResponse.json({ success: true, received: people.length, inserted, results });
}
