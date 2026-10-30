// ── Public share surfaces: server-only loaders ───────────────────────────
// ax8b item 2: /r/[id], its OG image and /score/[slug] used to render the
// business name / score / competitor for ANY id (anon-key reads that RLS
// allowed for every ownerless scan, service role for the OG image). They
// now load server-side with the service role and serve only scans that
// canServePublicShare() allows: ownerless (outreach) scans, or owned scans
// the owner explicitly published (rankall_scans.is_public). Names go
// through getTrustedDisplayName (#39) so a stale wrong-business Google name
// is never shown. Never import this from a client component.
//
// Round 2 (decision, documented): ownerless scans stay shareable because
// outreach emails link prospects to /r/<id> for scans that have no owner.
// The id is a random UUID (isScanId), so an anonymous homepage scan is
// reachable only by whoever holds its link. There is NO claim flow that
// later attaches an anonymous scan to an account (nothing updates
// rankall_scans.user_id after insert — checked in round 2); a signed-in
// user's scans are saved WITH user_id and are private unless the owner
// publishes them (is_public). If a claim flow is ever added it must set
// user_id (and leave is_public false) so the claimed scan turns private.

import { getSupabaseAdmin } from './supabase';
import { getFixesForScan } from './fixes';
import { getTrustedDisplayName } from './enrichment';
import { canServePublicShare, isScanId } from './reportPayload';

type Row = Record<string, unknown>;

export interface PublicShareScan {
  id: string;
  input: string;
  displayName: string;
  industry: string | null;
  location: string | null;
  overall_score: number;
  competitor_name: string | null;
  mentioned_count: number;
  queries_used: string[] | null;
  created_at: string;
  resolved_category: string | null;
  crawler_blocked_bots: string[] | null;
}

export interface PublicShareData {
  scan: PublicShareScan;
  platforms: Array<{ platform: string; mentioned: boolean; mention_rate: number | null; error: string | null }>;
  competitors: Array<{ business_name: string; platform_count: number; rank: number; score: number; location: string | null }>;
  /** Fix #1 only — the one fix the report leaves unlocked for everyone. */
  fix: {
    fix_title: string;
    fix_type: string;
    generated_content: string;
    predicted_impact: number | null;
    difficulty: string | null;
    time_to_implement: string | null;
  } | null;
}

function displayNameFor(row: Row): string {
  const enrichment = (row.enrichment ?? null) as { google?: Parameters<typeof getTrustedDisplayName>[3] } | null;
  return getTrustedDisplayName(
    row.input as string | null,
    row.location as string | null,
    row.user_business_name as string | null,
    enrichment?.google,
  );
}

/** The scan row for a public share surface, or null (missing / private). */
export async function loadShareableScanRow(id: string): Promise<Row | null> {
  if (!isScanId(id)) return null;
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('rankall_scans')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as Row;
    if (!canServePublicShare(row.user_id as string | null, row.is_public)) return null;
    return row;
  } catch {
    return null;
  }
}

/**
 * Outreach fix #1 — resolve the prospect-facing public report URL for a
 * scan, or null when the scan is not eligible for public share.
 *
 * Outreach emails must link to the prospect's own free report page
 * (/r/<id>), never to the paywalled /report/<id> or a bare ?q= search
 * URL. Eligibility is checked per scan at send time: run-scan's cache
 * lookup can return an OWNED scan (no user filter), and an owned scan
 * that the owner never published must never be mailed as a "free report".
 * Server-only (uses the service role). Fail-closed: any error → null.
 */
export async function resolvePublicReportUrl(
  scanId: string | null | undefined,
  base = 'https://rankall.io',
): Promise<string | null> {
  if (!isScanId(scanId)) return null;
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('rankall_scans')
      .select('user_id, is_public')
      .eq('id', scanId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as { user_id?: unknown; is_public?: unknown };
    if (!canServePublicShare(row.user_id as string | null, row.is_public)) return null;
    return `${base.replace(/\/$/, '')}/r/${scanId}`;
  } catch {
    return null;
  }
}

function toShareScan(row: Row): PublicShareScan {
  return {
    id: String(row.id),
    input: String(row.input ?? ''),
    displayName: displayNameFor(row),
    industry: (row.industry as string | null) ?? null,
    location: (row.location as string | null) ?? null,
    overall_score: Number(row.overall_score) || 0,
    competitor_name: (row.competitor_name as string | null) ?? null,
    mentioned_count: Number(row.mentioned_count) || 0,
    queries_used: Array.isArray(row.queries_used) ? (row.queries_used as string[]) : null,
    created_at: String(row.created_at ?? ''),
    resolved_category: (row.resolved_category as string | null) ?? null,
    crawler_blocked_bots: Array.isArray(row.crawler_blocked_bots) ? (row.crawler_blocked_bots as string[]) : null,
  };
}

export async function loadPublicShare(id: string): Promise<PublicShareData | null> {
  const row = await loadShareableScanRow(id);
  if (!row) return null;
  const admin = getSupabaseAdmin();

  const [platformRes, compRes, fixes] = await Promise.all([
    admin.from('rankall_platform_results').select('platform, mentioned, mention_rate, error').eq('scan_id', id),
    admin.from('scan_competitors').select('business_name, platform_count, rank, score, location').eq('scan_id', id).order('score', { ascending: false }),
    getFixesForScan(id).catch(() => []),
  ]);

  // b0fm: only fix #1 (impact rank 0 — the same fix /api/fixes/for-scan
  // leaves unlocked) is sent. The old page pulled every fix's
  // generated_content into the browser and picked one.
  const first = fixes[0];
  const fix = first && first.generated_content
    ? {
        fix_title: first.fix_title || first.fix_type,
        fix_type: first.fix_type,
        generated_content: first.generated_content,
        predicted_impact: first.predicted_impact ?? null,
        difficulty: first.difficulty ?? null,
        time_to_implement: first.time_to_implement ?? null,
      }
    : null;

  return {
    scan: toShareScan(row),
    platforms: ((platformRes.data ?? []) as PublicShareData['platforms']),
    competitors: ((compRes.data ?? []) as PublicShareData['competitors'])
      .filter(c => c.score > 0 && c.platform_count > 0),
    fix,
  };
}

/** /score/[slug]: resolve the slug, then apply the same public-share rule. */
export async function loadScoreBySlug(slug: string): Promise<{
  scan: PublicShareScan;
  platforms: Array<{ platform: string; mentioned: boolean }>;
} | null> {
  if (!slug || slug.length > 200) return null;
  const admin = getSupabaseAdmin();
  try {
    let scanId: string | null = null;
    const { data: link } = await admin
      .from('rankall_report_links')
      .select('scan_id')
      .eq('slug', slug)
      .maybeSingle();
    if (link) scanId = (link as { scan_id: string }).scan_id;
    // b8b8: the old second path queried rankall_scans.score_slug — a
    // column that does not exist (no migration ever created it), so it
    // always 400'd and was swallowed by the catch below. Slugs resolve
    // via rankall_report_links only (auto-generated "<scanId>-<ts>").
    if (!scanId) return null;
    const row = await loadShareableScanRow(scanId);
    if (!row) return null;
    const { data: platformData } = await admin
      .from('rankall_platform_results')
      .select('platform, mentioned')
      .eq('scan_id', scanId);
    return {
      scan: toShareScan(row),
      platforms: (platformData ?? []) as Array<{ platform: string; mentioned: boolean }>,
    };
  } catch {
    return null;
  }
}
