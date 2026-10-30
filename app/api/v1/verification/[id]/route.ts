import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// STD-06 (Part A): GET /api/v1/verification/[id] — public verification
// status for a verified outcome. Serves ONLY outcomes that are verified
// AND public; everything else is a 404. Same fail-closed gate as the
// /verified/[id] page and /api/verified/[id] route.

const NO_STORE = { 'Cache-Control': 'no-store' } as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  }

  const admin = getSupabaseAdmin();
  const { data: outcome } = await admin
    .from('verified_outcomes')
    .select('id, business_name, business_industry, fix_type, score_before, score_after, score_improvement, verified_at, confidence_level')
    .eq('id', id)
    .eq('is_verified', true)
    .eq('is_public', true)
    .maybeSingle();

  if (!outcome) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  }

  const o = outcome as {
    business_name: string | null; business_industry: string | null;
    fix_type: string | null; score_before: number | null; score_after: number | null;
    score_improvement: number | null; verified_at: string | null; confidence_level: string | null;
  };
  return NextResponse.json(
    {
      verification_id: id,
      business: o.business_name,
      industry: o.business_industry,
      fix_applied: o.fix_type,
      score_before: o.score_before,
      score_after: o.score_after,
      score_improvement: o.score_improvement,
      verified_at: o.verified_at,
      confidence: o.confidence_level,
      verified_by: 'rankall.io',
    },
    { headers: NO_STORE },
  );
}
