import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSessionUser } from '@/lib/apiAuth';
import { isAdminUser } from '@/lib/planConfig';

// CONV-05: founder-led closing workflow. Lists claimed-but-not-trialed
// profiles with auto-generated wound summaries for Nandish to personalize.
// Tracks outreach status so nothing double-sends.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

interface Candidate {
  user_id: string;
  email: string;
  business_name: string | null;
  scan_id: string | null;
  score: number | null;
  competitor_name: string | null;
  competitor_score: number | null;
  wound_summary: string;
  outreach_status: string | null;
}

/** Build the wound summary from the scan data — for Nandish to personalize. */
function buildWoundSummary(c: {
  business_name: string | null;
  score: number | null;
  competitor_name: string | null;
  competitor_score: number | null;
}): string {
  const name = c.business_name || 'their business';
  const parts: string[] = [];
  if (c.score != null) {
    parts.push(`AI visibility score: ${c.score}/100`);
  }
  if (c.competitor_name && c.competitor_score != null && c.score != null) {
    const gap = c.competitor_score - c.score;
    if (gap > 0) {
      parts.push(`invisible on platforms where ${c.competitor_name} shows up (${gap} pts behind)`);
    }
  }
  if (parts.length === 0) return `I looked at the report for ${name} — here's what AI says.`;
  return `I looked at your report for ${name} — ${parts.join('; ')}.`;
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !isAdminUser(user.email)) {
    return NextResponse.json({ error: 'Access denied — admin only.' }, { status: 403 });
  }

  const db = admin();

  // Candidates: users with a profile + at least one scan, on Free (no
  // subscription row, never trialed), not already in founder_outreach.
  // We approximate "claimed" as: has a profiles row with a business name.
  const { data: profiles, error: pErr } = await db
    .from('profiles')
    .select('id, email, business_name')
    .not('business_name', 'is', null)
    .limit(500);
  if (pErr) {
    return NextResponse.json({ candidates: [], note: 'profiles query failed' });
  }

  const { data: subs } = await db.from('subscriptions').select('user_id').limit(5000);
  const subscribed = new Set((subs ?? []).map((s: { user_id: string }) => s.user_id));

  const { data: contacted } = await db.from('founder_outreach').select('user_id, status');
  const contactedMap = new Map((contacted ?? []).map((c: { user_id: string; status: string }) => [c.user_id, c.status]));

  const candidates: Candidate[] = [];
  for (const p of (profiles ?? []) as Array<{ id: string; email: string; business_name: string | null }>) {
    if (subscribed.has(p.id)) continue; // has/had a subscription — not a target
    if (contactedMap.has(p.id)) continue; // already in the workflow

    // Latest scan for wound summary.
    const { data: scans } = await db
      .from('rankall_scans')
      .select('id, overall_score, competitor_name, competitor_score')
      .eq('user_id', p.id)
      .order('created_at', { ascending: false })
      .limit(1);
    const scan = (scans ?? [])[0] as
      | { id: string; overall_score: number | null; competitor_name: string | null; competitor_score: number | null }
      | undefined;
    if (!scan) continue; // no scan — nothing to personalize with

    const wound = buildWoundSummary({
      business_name: p.business_name,
      score: scan.overall_score,
      competitor_name: scan.competitor_name,
      competitor_score: scan.competitor_score,
    });

    candidates.push({
      user_id: p.id,
      email: p.email,
      business_name: p.business_name,
      scan_id: scan.id,
      score: scan.overall_score,
      competitor_name: scan.competitor_name,
      competitor_score: scan.competitor_score,
      wound_summary: wound,
      outreach_status: null,
    });
    if (candidates.length >= 50) break; // first 50 — the acceptance target
  }

  // Stats for the dashboard.
  const { count: sent } = await db.from('founder_outreach').select('id', { count: 'exact', head: true }).eq('status', 'sent');
  const { count: converted } = await db.from('founder_outreach').select('id', { count: 'exact', head: true }).eq('status', 'converted');

  return NextResponse.json({
    candidates,
    stats: { sent: sent ?? 0, converted: converted ?? 0 },
    sunset_note: 'Sunset when warm-lead volume exceeds founder bandwidth — hand off to RET/alina sequences.',
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user || !isAdminUser(user.email)) {
    return NextResponse.json({ error: 'Access denied — admin only.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { user_id, email, business_name, scan_id, wound_summary, status, notes } = body as {
    user_id?: string; email?: string; business_name?: string | null;
    scan_id?: string | null; wound_summary?: string | null;
    status?: string; notes?: string | null;
  };
  if (!user_id || !email || !['sent', 'replied', 'converted', 'skipped'].includes(status ?? '')) {
    return NextResponse.json({ error: 'user_id, email and a valid status are required' }, { status: 400 });
  }

  const db = admin();
  const { error } = await db.from('founder_outreach').upsert({
    user_id,
    email,
    business_name: business_name ?? null,
    scan_id: scan_id ?? null,
    wound_summary: wound_summary ?? null,
    status,
    sent_at: status === 'sent' ? new Date().toISOString() : null,
    notes: notes ?? null,
  }, { onConflict: 'user_id' });

  if (error) {
    return NextResponse.json({ error: 'save failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
