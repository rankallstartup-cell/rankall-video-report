// P0e: single source of truth for reading fixes.
//
// Every surface (sidebar badge, fix page, dashboard, report page, ROI email)
// reads `generated_fixes` through these helpers — never `fix_predictions` for
// display, never on-the-fly counts. Reads use the service-role client
// (bypasses RLS) and are always scoped in code to the owning user/scan.

import { getSupabaseAdmin } from '@/lib/supabase';
import { canonicalFixImpact } from './fixIntelligence';

export interface UnifiedFix {
  id: string;
  scan_id: string | null;
  user_id: string | null;
  fix_type: string;
  fix_title: string | null;
  status: string;
  predicted_impact: number | null;
  confidence: number | null;
  difficulty: string | null;
  time_to_implement: string | null;
  generated_content: string | null;
  why_recommended: string | null;
  created_at: string;
  // b89u: the verification columns exist on the table (the applied
  // fix on staging carries score_before = 4) but were never selected,
  // so the fix page rendered "Starting score 0/100" from undefined.
  score_before?: number | null;
  score_after?: number | null;
  verification_status?: string | null;
}

const FIX_COLUMNS =
  'id, scan_id, user_id, fix_type, fix_title, status, predicted_impact, confidence, difficulty, time_to_implement, generated_content, why_recommended, created_at, score_before, score_after, verification_status';

// ax81: ONE impact number per fix. The stored predicted_impact is legacy
// (Claude's per-fix guess, 8–22) and disagreed with the "Expected Impact"
// range shown from fixQuality metadata (e.g. queue +16 vs range +8 to +12).
// Every reader normalises to the metadata range's midpoint, so the queue,
// the report, and the portal all show the same number — which always lies
// inside the displayed range. (A backfill rewriting stored values is
// proposed in the ticket; reads stay correct with or without it.)
function withCanonicalImpact<T extends { fix_type: string; predicted_impact: number | null }>(rows: T[]): T[] {
  return rows.map(r => ({ ...r, predicted_impact: canonicalFixImpact(r.fix_type) }));
}

// Dedupe by fix_type, newest first. Collapses the per-scan regen triplication
// (e.g. jsonld ×17 across scans) at read time for any legacy rows. Generation
// itself dedupes going forward (see lib/generateFix.ts).
function dedupeByType<T extends { fix_type: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (seen.has(r.fix_type)) continue;
    seen.add(r.fix_type);
    out.push(r);
  }
  return out;
}

/** Pending (or other-status) fixes for a user, deduped by fix_type. */
export async function getUserFixes(
  userId: string,
  status = 'pending_review',
  limit = 50,
): Promise<UnifiedFix[]> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from('generated_fixes')
    .select(FIX_COLUMNS)
    .eq('user_id', userId)
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(limit * 3); // over-fetch so dedupe still fills the page
  return withCanonicalImpact(dedupeByType(((data ?? []) as unknown) as UnifiedFix[]).slice(0, limit));
}

/** Fixes for a single scan, deduped by fix_type. Used by the report page. */
export async function getFixesForScan(scanId: string): Promise<UnifiedFix[]> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from('generated_fixes')
    .select(FIX_COLUMNS)
    .eq('scan_id', scanId)
    .order('created_at', { ascending: false });
  // b02c: the report queue is labelled "Ranked by predicted impact" —
  // return impact-ranked, not creation order. (predicted_impact is
  // already normalised to the metadata midpoint by withCanonicalImpact,
  // so this sorts on the same number the queue displays.)
  const fixes = withCanonicalImpact(dedupeByType(((data ?? []) as unknown) as UnifiedFix[]));
  return [...fixes].sort((a, b) => (b.predicted_impact ?? 0) - (a.predicted_impact ?? 0));
}

/**
 * Counts for the sidebar badge + dashboard. Counts are deduped the same way
 * as the lists, so the badge always matches what the fix page shows.
 */
export async function getFixCounts(
  userId: string,
): Promise<{ pending: number; applied: number }> {
  const admin = getSupabaseAdmin();
  const [pendingRes, appliedRes] = await Promise.all([
    admin
      .from('generated_fixes')
      .select('fix_type')
      .eq('user_id', userId)
      .eq('status', 'pending_review')
      .limit(500),
    admin
      .from('generated_fixes')
      .select('fix_type')
      .eq('user_id', userId)
      .eq('status', 'applied')
      .limit(500),
  ]);
  const countDeduped = (rows: { fix_type: string }[] | null) =>
    dedupeByType(rows ?? []).length;
  return {
    pending: countDeduped(pendingRes.data),
    applied: countDeduped(appliedRes.data),
  };
}
