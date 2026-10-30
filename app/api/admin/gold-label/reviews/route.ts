import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { isAdminUser } from '@/lib/planConfig';
import {
  computeAgreement,
  goldStatusFor,
  isMissingTableError,
  validateReviewInput,
  type GoldReviewRow,
} from '@/lib/goldLabel';

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

async function loadReviews(sb: ReturnType<typeof admin>, scanId: string) {
  const { data, error } = await sb
    .from('gold_label_reviews')
    .select('scan_id, reviewer, field_name, verdict, corrected_value')
    .eq('scan_id', scanId);
  if (error) throw error;
  return (data ?? []) as GoldReviewRow[];
}

async function loadStatus(sb: ReturnType<typeof admin>, scanId: string) {
  const { data, error } = await sb
    .from('gold_scan_status')
    .select('status, adjudicated_by, adjudicated_at, adjudication_notes')
    .eq('scan_id', scanId)
    .maybeSingle();
  if (error) throw error;
  return data as { status: string; adjudicated_by?: string | null; adjudicated_at?: string | null; adjudication_notes?: string | null } | null;
}

// Keep gold_scan_status in step with the reviews: gold when all fields
// agreed, needs_adjudication on conflict — unless an adjudication already
// recorded gold (adjudication is an override and is never downgraded).
async function refreshStatus(sb: ReturnType<typeof admin>, scanId: string, reviews: GoldReviewRow[]) {
  const existing = await loadStatus(sb, scanId);
  if (existing?.status === 'gold' && existing.adjudicated_by) return;
  const agreement = computeAgreement(reviews);
  const status = goldStatusFor(agreement, existing);
  await sb.from('gold_scan_status').upsert({
    scan_id: scanId,
    status,
    gold_at: status === 'gold' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'scan_id' });
}

// GET /api/admin/gold-label/reviews?scan_id=
// Returns the current reviewer's own rows (never another reviewer's
// verdicts — reviews stay independent), plus reviewer count, per-field
// reviewed counts, agreement, and gold status. Agreement is shown in the
// UI only after the reviewer has submitted their own full set.
export async function GET(req: NextRequest) {
  const { ok, user } = await requireAdmin();
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const scanId = new URL(req.url).searchParams.get('scan_id');
  if (!scanId) return NextResponse.json({ error: 'scan_id is required' }, { status: 400 });

  const sb = admin();
  try {
    const reviews = await loadReviews(sb, scanId);
    const statusRow = await loadStatus(sb, scanId);
    const agreement = computeAgreement(reviews);
    const reviewer = (user?.email ?? '').toLowerCase();
    const ownReviews = reviews.filter((r) => r.reviewer.toLowerCase() === reviewer);
    const reviewedCounts: Record<string, number> = {};
    for (const r of reviews) reviewedCounts[r.field_name] = (reviewedCounts[r.field_name] ?? 0) + 1;
    return NextResponse.json({
      scan_id: scanId,
      own_reviews: ownReviews,
      reviewer_count: agreement.reviewerCount,
      reviewed_counts: reviewedCounts,
      agreement,
      gold_status: goldStatusFor(agreement, statusRow),
      status_row: statusRow,
    });
  } catch (err) {
    if (isMissingTableError(err)) {
      return NextResponse.json({ error: 'migration_pending' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Failed to load reviews' }, { status: 500 });
  }
}

// POST /api/admin/gold-label/reviews
// Body: { scan_id, field_name, verdict: 'agree'|'disagree', corrected_value? }
// Reviewer ALWAYS comes from the server-verified session — never the body,
// so one reviewer can never write (or overwrite) another reviewer's rows.
// One row per (scan_id, reviewer, field_name): re-submitting a field
// updates the reviewer's own row, never anyone else's.
export async function POST(req: NextRequest) {
  const { ok, user } = await requireAdmin();
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const reviewer = (user?.email ?? '').toLowerCase();
  if (!reviewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const input = body as { scan_id?: unknown; field_name?: unknown; verdict?: unknown; corrected_value?: unknown };
  const validation = validateReviewInput(input);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

  const sb = admin();
  try {
    // The scan must have system labels to review. Read the system value for
    // this field now so it is snapshotted alongside the verdict (audit
    // trail: what the reviewer was judging).
    const { data: labelRow, error: labelError } = await sb
      .from('data_labels')
      .select(input.field_name as string)
      .eq('scan_id', input.scan_id as string)
      .maybeSingle();
    if (labelError) throw labelError;
    if (!labelRow) return NextResponse.json({ error: 'No system labels for this scan' }, { status: 404 });
    const raw = (labelRow as unknown as Record<string, unknown>)[input.field_name as string];
    const systemValue = raw == null ? null : Array.isArray(raw) ? JSON.stringify(raw) : String(raw);

    const { data, error } = await sb
      .from('gold_label_reviews')
      .upsert({
        scan_id: input.scan_id as string,
        reviewer,
        field_name: input.field_name as string,
        system_value: systemValue,
        verdict: input.verdict as 'agree' | 'disagree',
        corrected_value: (input.verdict as string) === 'disagree' ? ((input.corrected_value as string).trim()) : null,
        reviewed_at: new Date().toISOString(),
      }, { onConflict: 'scan_id,reviewer,field_name' })
      .select('scan_id, reviewer, field_name, verdict, corrected_value')
      .single();
    if (error) throw error;

    const reviews = await loadReviews(sb, input.scan_id as string);
    await refreshStatus(sb, input.scan_id as string, reviews);
    return NextResponse.json({ review: data });
  } catch (err) {
    if (isMissingTableError(err)) {
      return NextResponse.json({ error: 'migration_pending' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Failed to save review' }, { status: 500 });
  }
}
