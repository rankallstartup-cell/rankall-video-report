import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { recordFixApplied } from '@/lib/verifiedOutcomes';
import { getFixMetadata } from '@/lib/fixQuality';
import { canonicalFixImpact } from '@/lib/fixIntelligence';
import { normaliseVerifyDays } from '@/lib/rescanSchedule';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Phase 4.1: THE canonical "Mark Applied" endpoint. Converges the previously
// disconnected pipelines so the Apply → Verify loop actually works:
//   1. fix_predictions(status='applied')  → feeds the daily trigger-rescans cron
//   2. recordFixApplied()                 → creates the canonical verified_outcomes
//                                            row (before-snapshot, is_verified=false)
//   3. fix_applications                   → human-readable audit record
// The verification rescan (on the date the user picked — 7 days by default)
// later calls verifyOutcome() on the row from step 2.

export async function POST(req: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { scan_id, fix_type, fix_title, confidence, generated_fix_id } = body;
  // ax81: one impact number per fix — derived from fix_type, never the
  // client-supplied value (which came from legacy stored rows).
  const predicted_impact = canonicalFixImpact(typeof fix_type === 'string' ? fix_type : null);
  // ax72: the delay the user picked (MarkFixApplied: 7/30/60/90) is honoured;
  // flows without a picker get the 7-day default.
  const rescan_days = normaliseVerifyDays(body.rescan_days);
  if (!scan_id || !fix_type) {
    return NextResponse.json({ error: 'scan_id and fix_type required' }, { status: 400 });
  }

  // The scan id comes from the body — confirm the caller owns it before any
  // service-role write below (recordFixApplied, scheduled_rescans).
  const admin = getSupabaseAdmin();
  const { data: ownedScan } = await admin
    .from('rankall_scans').select('id, user_id').eq('id', scan_id).maybeSingle();
  if (!ownedScan || (ownedScan as { user_id: string | null }).user_id !== user.id) {
    return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
  }

  const now = new Date();
  const scheduledRescanAt = new Date(now.getTime() + rescan_days * 24 * 60 * 60 * 1000).toISOString();
  const estimatedImpact = (getFixMetadata(fix_type).estimatedImpact as string) || '';

  // 1. fix_predictions — the table the daily trigger-rescans cron reads.
  try {
    const { error: fpErr } = await supabase.from('fix_predictions').insert({
      scan_id,
      fix_type,
      fix_title: fix_title ?? null,
      predicted_impact,
      confidence: typeof confidence === 'number' ? confidence : null,
      status: 'applied',
      applied_at: now.toISOString(),
    });
    // supabase returns { error } — it does not throw — so check it.
    if (fpErr) console.error('[fixes/apply] fix_predictions insert failed:', fpErr.message);
  } catch { /* non-fatal — the outcome row below is the source of truth for verification */ }

  // 2. Canonical verified_outcomes row (before-snapshot). Verified later by the cron.
  let outcomeId: string | null = null;
  try {
    outcomeId = await recordFixApplied(user.id, scan_id, fix_type, estimatedImpact, generated_fix_id ?? null);
  } catch { /* scan may be missing; verification simply won't run for this fix */ }

  // 3. Audit record + the per-fix verification schedule row.
  try {
    const { error: faErr } = await supabase.from('fix_applications').insert({
      user_id: user.id, scan_id, fix_type, scheduled_rescan_at: scheduledRescanAt,
    });
    if (faErr) console.error('[fixes/apply] fix_applications insert failed:', faErr.message);
  } catch (e) { console.error('[fixes/apply] fix_applications insert threw:', e); }
  try {
    // ax72: one row per FIX (fix_type), so trigger-rescans verifies each fix on
    // its own date and marks the row completed. Service role: the scan's
    // ownership was checked above.
    const { error: srErr } = await admin.from('scheduled_rescans').insert({
      user_id: user.id, scan_id, fix_type, scheduled_for: scheduledRescanAt,
    });
    if (srErr) {
      // Migration 20261016000700_scheduled_rescans_per_fix not applied yet → write
      // the legacy untyped row; trigger-rescans matches it to this fix by time.
      console.error('[fixes/apply] scheduled_rescans insert failed, retrying legacy shape:', srErr.message);
      const { error: legacyErr } = await admin.from('scheduled_rescans').insert({
        user_id: user.id, scan_id, scheduled_for: scheduledRescanAt,
      });
      if (legacyErr) console.error('[fixes/apply] legacy scheduled_rescans insert failed:', legacyErr.message);
    }
  } catch (e) { console.error('[fixes/apply] scheduled_rescans insert threw:', e); }

  // P0e: keep generated_fixes in sync — the fix page, badge and dashboard all
  // read from there. Without this, an applied fix would stay "pending" in the
  // queue (the old disconnected-pipeline bug). Idempotent: setting applied →
  // applied is a no-op (the fix page already marks it via /api/fixes/review).
  try {
    const appliedUpdate = { status: 'applied', applied_at: now.toISOString(), updated_at: now.toISOString() };
    if (generated_fix_id) {
      await admin.from('generated_fixes').update(appliedUpdate)
        .eq('id', generated_fix_id).eq('user_id', user.id);
    } else {
      const { data: pendingRow } = await admin.from('generated_fixes').select('id')
        .eq('user_id', user.id).eq('scan_id', scan_id).eq('fix_type', fix_type)
        .eq('status', 'pending_review')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      const rowId = (pendingRow as { id: string } | null)?.id;
      if (rowId) await admin.from('generated_fixes').update(appliedUpdate).eq('id', rowId);
    }
  } catch { /* non-fatal — fix_predictions above is the verify-loop source */ }

  // 4. First-fix milestone. If this is the very first fix this user has ever
  //    applied, fire the celebratory "first_fix_applied" email. Best-effort and
  //    non-blocking — a failure here never affects the apply result.
  try {
    const { count: appliedCount } = await supabase
      .from('fix_applications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);
    if (appliedCount === 1 && user.email && process.env.CRON_SECRET) {
      const { data: scanRow } = await supabase
        .from('rankall_scans')
        .select('overall_score, user_business_name, input')
        .eq('id', scan_id)
        .maybeSingle();
      const base = process.env.NEXT_PUBLIC_BASE_URL || 'https://rankall.io';
      await fetch(`${base}/api/milestone-email`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          email: user.email,
          business_name: (scanRow?.user_business_name as string) || (scanRow?.input as string) || undefined,
          milestone: 'first_fix_applied',
          score: Number(scanRow?.overall_score) || undefined,
          predicted_impact: predicted_impact ?? undefined,
          verify_days: rescan_days,
          scan_id,
        }),
      }).catch(() => {});
    }
  } catch { /* non-fatal */ }

  return NextResponse.json({
    ok: true,
    outcomeId,
    scheduledRescanAt,
    rescanDays: rescan_days,
    expectedVerificationDate: new Date(scheduledRescanAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    message: `Great. Rankall will automatically verify this improvement on ${new Date(scheduledRescanAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}.`,
  });
}
