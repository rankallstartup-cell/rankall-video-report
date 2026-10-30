import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { isAdminUser } from '@/lib/planConfig';
import { validateScore, validateBusinessName, type DataQualityStatus } from '@/lib/dataQuality';

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

// worst-of ranking so we can combine two validation results.
const STATUS_RANK: Record<DataQualityStatus, number> = {
  clean: 0,
  needs_review: 1,
  quarantined: 2,
  blocked: 3,
};

export async function POST() {
  const { ok } = await requireAdmin();
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const sb = admin();
  let scansChecked = 0;
  let scansFlagged = 0;
  let outcomesChecked = 0;
  let outcomesFlagged = 0;

  // ── rankall_scans ──────────────────────────────────────────────────────────
  try {
    const { data: scans } = await sb
      .from('rankall_scans')
      .select('id, overall_score, recommendation_share, input, user_business_name')
      .order('created_at', { ascending: false })
      .limit(500);

    for (const scan of scans ?? []) {
      scansChecked++;
      const scoreRes = validateScore(scan.overall_score, scan.recommendation_share);
      const nameRes = validateBusinessName(scan.user_business_name || scan.input);
      const worst = STATUS_RANK[scoreRes.status] >= STATUS_RANK[nameRes.status] ? scoreRes : nameRes;
      if (worst.status !== 'clean') scansFlagged++;
      try {
        await sb
          .from('rankall_scans')
          .update({ data_quality_status: worst.status, data_quality_score: worst.qualityScore })
          .eq('id', scan.id);
      } catch {
        // columns may not exist yet — never throw.
      }
    }
  } catch {
    // table read failed — leave counts as-is.
  }

  // ── verified_outcomes ────────────────────────────────────────────────────────
  try {
    const { data: outcomes } = await sb
      .from('verified_outcomes')
      .select('id, score_after, after_score, is_verified')
      .order('created_at', { ascending: false })
      .limit(500);

    for (const outcome of outcomes ?? []) {
      outcomesChecked++;
      const score = outcome.score_after ?? outcome.after_score;
      const res = validateScore(score);
      if (res.status !== 'clean') outcomesFlagged++;
      try {
        await sb
          .from('verified_outcomes')
          .update({
            data_quality_status: res.status,
            is_intelligence_graph_eligible: res.status === 'clean',
          })
          .eq('id', outcome.id);
      } catch {
        // columns may not exist yet — never throw.
      }
    }
  } catch {
    // table read failed — leave counts as-is.
  }

  return NextResponse.json({ ok: true, scansChecked, scansFlagged, outcomesChecked, outcomesFlagged });
}
