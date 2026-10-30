import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { isAdminUser } from '@/lib/planConfig';
import { isGoldReviewField, isMissingTableError } from '@/lib/goldLabel';

export const dynamic = 'force-dynamic';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function requireAdmin() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return { ok: isAdminUser(user?.email), user };
}

// POST /api/admin/gold-label/adjudicate
// Body: { scan_id, notes, final_values: { field_name: finalValue } }
// Used when the two reviewers conflicted: a named admin resolves each
// conflicted field by hand. The adjudication is recorded EXPLICITLY in
// gold_scan_status (adjudicated_by / adjudicated_at / notes / final_values)
// and the adjudicator's final per-field judgments are stored as their own
// review rows — so the gold verdict is fully traceable to a person, a
// time, and a reason. Adjudication is an override: it stands even though
// the reviewers conflicted. System labels in data_labels are untouched.
export async function POST(req: NextRequest) {
  const { ok, user } = await requireAdmin();
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const adjudicator = (user?.email ?? '').toLowerCase();
  if (!adjudicator) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const input = body as { scan_id?: unknown; notes?: unknown; final_values?: unknown };
  if (typeof input.scan_id !== 'string' || !input.scan_id.trim()) {
    return NextResponse.json({ error: 'scan_id is required' }, { status: 400 });
  }
  if (typeof input.notes !== 'string' || !input.notes.trim()) {
    return NextResponse.json({ error: 'notes are required — say how the conflict was resolved' }, { status: 400 });
  }
  if (typeof input.final_values !== 'object' || input.final_values === null || Array.isArray(input.final_values)) {
    return NextResponse.json({ error: 'final_values must be an object of field_name -> final value' }, { status: 400 });
  }
  const finalValues = input.final_values as Record<string, unknown>;
  for (const [field, value] of Object.entries(finalValues)) {
    if (!isGoldReviewField(field)) {
      return NextResponse.json({ error: `final_values has an unknown field: ${field}` }, { status: 400 });
    }
    if (typeof value !== 'string' || !value.trim()) {
      return NextResponse.json({ error: `final_values[${field}] must be a non-empty string` }, { status: 400 });
    }
  }

  const sb = admin();
  try {
    const { data: existing, error: existingError } = await sb
      .from('gold_label_reviews')
      .select('scan_id')
      .eq('scan_id', input.scan_id as string)
      .limit(1);
    if (existingError) throw existingError;
    if (!existing || existing.length === 0) {
      return NextResponse.json({ error: 'No reviews exist for this scan — adjudication needs at least one review' }, { status: 400 });
    }

    // Adjudicator's own per-field rows (audit trail) + explicit status row.
    const { data: labelRow } = await sb
      .from('data_labels')
      .select('*')
      .eq('scan_id', input.scan_id as string)
      .maybeSingle();
    const label = (labelRow ?? {}) as Record<string, unknown>;
    for (const [field, value] of Object.entries(finalValues)) {
      const final = (value as string).trim();
      const raw = label[field];
      const systemValue = raw == null ? null : Array.isArray(raw) ? JSON.stringify(raw) : String(raw);
      const { error } = await sb.from('gold_label_reviews').upsert({
        scan_id: input.scan_id as string,
        reviewer: adjudicator,
        field_name: field,
        system_value: systemValue,
        verdict: systemValue === final ? 'agree' : 'disagree',
        corrected_value: systemValue === final ? null : final,
        reviewed_at: new Date().toISOString(),
      }, { onConflict: 'scan_id,reviewer,field_name' });
      if (error) throw error;
    }

    const { error: statusError } = await sb.from('gold_scan_status').upsert({
      scan_id: input.scan_id as string,
      status: 'gold',
      gold_at: new Date().toISOString(),
      adjudicated_by: adjudicator,
      adjudicated_at: new Date().toISOString(),
      adjudication_notes: (input.notes as string).trim(),
      final_values: finalValues,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'scan_id' });
    if (statusError) throw statusError;

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isMissingTableError(err)) {
      return NextResponse.json({ error: 'migration_pending' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Failed to record adjudication' }, { status: 500 });
  }
}
