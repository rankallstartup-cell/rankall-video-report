import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { isAdminUser } from '@/lib/planConfig';
import { sampleGoldScans, type GoldSampleCandidate } from '@/lib/goldLabel';

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

// GET /api/admin/gold-label/sample?seed=&size=
// Returns the deterministic gold-set sample: 150 scans by default,
// stratified by industry + intent_type. Same seed + same data = same set,
// so both reviewers work from the same list.
export async function GET(req: NextRequest) {
  const { ok } = await requireAdmin();
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const seed = Number(searchParams.get('seed') ?? 20261017) || 20261017;
  const size = Math.min(500, Math.max(1, Number(searchParams.get('size') ?? 150) || 150));

  const sb = admin();
  const { data: labels, error: labelsError } = await sb
    .from('data_labels')
    .select('scan_id, business_name, industry, intent_type, query_type, business_type, competitor_category, ai_recommendation_confidence, city, state, country')
    .limit(2000);
  if (labelsError) return NextResponse.json({ error: labelsError.message }, { status: 500 });

  const { data: scans, error: scansError } = await sb
    .from('rankall_scans')
    .select('id, input, data_quality_status')
    .limit(2000);
  if (scansError) return NextResponse.json({ error: scansError.message }, { status: 500 });

  const scanById = new Map((scans ?? []).map((s: Record<string, unknown>) => [s.id as string, s]));
  const candidates: GoldSampleCandidate[] = (labels ?? []).map((l: Record<string, unknown>) => {
    const scan = scanById.get(l.scan_id as string) as Record<string, unknown> | undefined;
    return {
      scan_id: l.scan_id as string,
      industry: (l.industry as string) ?? '',
      intent_type: (l.intent_type as string) ?? '',
      business_name: (l.business_name as string) ?? '',
      input: (scan?.input as string) ?? '',
      data_quality_status: (scan?.data_quality_status as string) ?? null,
    };
  });

  const sample = sampleGoldScans(candidates, { size, seed });
  const labelById = new Map((labels ?? []).map((l: Record<string, unknown>) => [l.scan_id as string, l]));
  return NextResponse.json({
    seed,
    size,
    total_candidates: candidates.length,
    sample: sample.map((c) => ({
      scan_id: c.scan_id,
      ...(labelById.get(c.scan_id) ?? {}),
    })),
  });
}
