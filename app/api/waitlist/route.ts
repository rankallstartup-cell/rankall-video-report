import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { isHoneypotTripped, clientIp, allowByDbLimit } from '@/lib/publicFormGuard';

// b8bh: /waitlist used to insert straight from the browser into
// waitlist_signups — a table that never existed, so every join failed
// with a generic "Something went wrong". All joins now go through
// this route: validation + honeypot + per-IP rate limit, insert via
// the service role, specific errors, idempotent re-joins.

export const dynamic = 'force-dynamic';

const PLAN_TYPES = new Set([
  'product_pro', 'publisher_pro', 'enterprise', 'government',
  'global_brand', 'local_pro_seo', 'agency_seo', 'general',
]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DB_LIMIT = 10;
const DB_WINDOW_MS = 60 * 60 * 1000; // per IP per hour

function planType(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const base = raw.endsWith(':annual') ? raw.slice(0, -':annual'.length) : raw;
  const interval = raw.endsWith(':annual') ? ':annual' : '';
  if (!PLAN_TYPES.has(base)) return null;
  return base + interval;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // Honeypot: bots that fill the hidden field get a silent fake success.
  if (isHoneypotTripped(body)) {
    return NextResponse.json({ success: true, already: false });
  }

  const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';
  const businessName = typeof body.business_name === 'string' ? body.business_name.trim() : '';
  const plan = planType(body.plan_type);

  if (!email || email.length > 320 || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email.' }, { status: 400 });
  }
  if (businessName.length > 200) {
    return NextResponse.json({ error: 'Business name must be 200 characters or fewer.' }, { status: 400 });
  }
  if (!plan) {
    return NextResponse.json({ error: 'Please choose a plan.' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const ip = clientIp(req.headers);
  const allowed = await allowByDbLimit(admin, 'waitlist', ip, DB_LIMIT, DB_WINDOW_MS);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many signups from this connection. Please try again later.' }, { status: 429 });
  }

  const { error } = await admin.from('waitlist_signups').insert({
    email,
    business_name: businessName || null,
    plan_type: plan,
  });
  if (error) {
    // Unique (email, plan_type): already on this plan's list — success,
    // not an error. Never leak whether an address is on another list.
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ success: true, already: true });
    }
    console.error('[waitlist] insert failed:', (error as { message?: string }).message ?? error);
    return NextResponse.json(
      { error: "We couldn't save your signup — please try again." },
      { status: 500 },
    );
  }
  return NextResponse.json({ success: true, already: false });
}
