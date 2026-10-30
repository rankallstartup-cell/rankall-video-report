// app/api/admin/outreach/prospect-seed/route.ts
// Admin-only seed path for the nightly prospect pipeline (outreach #5).
// Accepts a CSV-shaped JSON list of prospects and inserts them into
// outreach_targets with status 'queued', where the nightly cron picks them
// up. Dedupes by email, then by business_name + city — never creates a
// prospect that is already in the queue.
//
// POST { prospects: [{ business_name, email?, phone?, city?, state?,
//   country_code?, industry?, owner_name? }] }
// Returns { inserted, skipped: [{ business_name, email, reason }] }.
// Max 200 prospects per request.

import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/apiAuth';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const MAX_PER_REQUEST = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanStr(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const prospects = body?.prospects;
  if (!Array.isArray(prospects) || prospects.length === 0) {
    return NextResponse.json({ error: 'prospects array required' }, { status: 400 });
  }
  if (prospects.length > MAX_PER_REQUEST) {
    return NextResponse.json({ error: `max ${MAX_PER_REQUEST} prospects per request` }, { status: 400 });
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );

  let inserted = 0;
  const skipped: Array<{ business_name: string | null; email: string | null; reason: string }> = [];

  for (const p of prospects) {
    const businessName = cleanStr(p?.business_name, 200);
    const emailRaw = cleanStr(p?.email, 320);
    const email = emailRaw ? emailRaw.toLowerCase() : null;
    const city = cleanStr(p?.city, 200);
    const state = cleanStr(p?.state, 100);
    const fullCity = [city, state].filter(Boolean).join(', ') || null;

    if (!businessName) {
      skipped.push({ business_name: null, email, reason: 'missing business_name' });
      continue;
    }
    if (email && !EMAIL_RE.test(email)) {
      skipped.push({ business_name: businessName, email, reason: 'invalid email' });
      continue;
    }

    // Dedupe: same email already in the queue, or same business + city.
    if (email) {
      const { data: byEmail } = await sb
        .from('outreach_targets')
        .select('id')
        .ilike('email', email)
        .limit(1)
        .maybeSingle();
      if (byEmail) {
        skipped.push({ business_name: businessName, email, reason: 'duplicate_email' });
        continue;
      }
    } else if (fullCity) {
      const { data: byNameCity } = await sb
        .from('outreach_targets')
        .select('id')
        .ilike('business_name', businessName)
        .ilike('city', fullCity)
        .limit(1)
        .maybeSingle();
      if (byNameCity) {
        skipped.push({ business_name: businessName, email, reason: 'duplicate_business_city' });
        continue;
      }
    }

    const { error } = await sb.from('outreach_targets').insert({
      business_name: businessName,
      owner_name: cleanStr(p?.owner_name, 200),
      email,
      phone: cleanStr(p?.phone, 50),
      city: fullCity,
      country_code: (cleanStr(p?.country_code, 2) ?? 'US').toUpperCase(),
      industry: cleanStr(p?.industry, 200),
      scan_id: null,
      status: 'queued',
    });
    if (error) {
      skipped.push({ business_name: businessName, email, reason: `insert failed: ${error.message}` });
      continue;
    }
    inserted++;
  }

  return NextResponse.json({ ok: true, inserted, skipped });
}
