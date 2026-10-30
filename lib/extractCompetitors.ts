import { extractAllCompetitors, detectBusinessMention } from '@/lib/analyser-ml';
import { getSupabaseAdmin } from '@/lib/supabase';
// P0a: server-side route — service_role (bypasses RLS); no user session here.
// Resolved lazily: a module-level client threw "supabaseUrl is required" on
// import wherever env vars are absent (unit tests importing scoreCompetitor).
import { calculateOverallScore, type PlatformStatus } from '@/lib/scoring';

interface PlatformResult {
  platform: string;
  weight?: number;
  response: string | null;
}

export interface ExtractedCompetitor {
  name: string;
  platformCount: number;
  rank: number;
  score: number;
  placeId: string | null;
}

/**
 * For a single competitor (with name variants), detect which platforms mention
 * it and compute a weighted score — same formula as the target business.
 */
export function scoreCompetitor(
  variants: string[],
  platformResults: PlatformResult[],
): { platforms: string[]; mentionRates: Map<string, number>; score: number } {
  const responded = platformResults.filter(r => r.response);
  const totalWeight = responded.reduce((s, r) => s + (r.weight ?? 0), 0);

  const mentionRates = new Map<string, number>();
  const platforms: string[] = [];

  for (const r of responded) {
    const mentioned = variants.some(v => detectBusinessMention(r.response!, v));
    const rate = mentioned ? 1 : 0;
    mentionRates.set(r.platform, rate);
    if (mentioned) platforms.push(r.platform);
  }

  const score = calculateOverallScore(
    responded.map(r => ({
      weight: r.weight ?? (totalWeight > 0 ? 0 : 1 / responded.length),
      mentionRate: mentionRates.get(r.platform) ?? 0,
      status: 'success' as PlatformStatus,
    })),
    1,
  ).score;

  return { platforms, mentionRates, score };
}

export async function extractAndStoreCompetitors(
  scanId: string,
  _query: string,
  platformResults: PlatformResult[],
  options?: { businessName?: string; queries?: string[]; city?: string; category?: string },
): Promise<void> {
  const responses = platformResults
    .filter(r => r.response)
    .map(r => ({ platform: r.platform, response: r.response! }));

  if (responses.length === 0) { console.warn('[extractCompetitors] no responses, skipping'); return; }

  const competitors = await extractAllCompetitors(
    responses,
    options?.businessName,
    undefined,
    { queries: options?.queries, city: options?.city, category: options?.category },
  );

  if (competitors.length === 0) { console.warn('[extractCompetitors] no competitors extracted'); return; }

  const scored = competitors.slice(0, 8).map(c => {
    const allVariants = [...new Set([c.name, ...c.variants])];
    const result = scoreCompetitor(allVariants, platformResults);
    console.log('[extractCompetitors] competitor:', c.name, 'variants:', allVariants, 'detected on:', result.platforms, 'score:', result.score);
    return {
      name: c.name,
      platform_count: result.platforms.length,
      score: result.score,
      place_id: c.placeId,
    };
  }).filter(c => c.score > 0 && c.platform_count > 0);

  scored.sort((a, b) => b.score - a.score);

  if (scored.length === 0) { console.warn('[extractCompetitors] all competitors scored 0, skipping'); return; }

  const rows = scored.map((c, i) => ({
    scan_id: scanId,
    business_name: c.name,
    platform_count: c.platform_count,
    rank: i + 1,
    score: c.score,
    place_id: c.place_id,
    location: null,
    note: null,
  }));

  const { error } = await getSupabaseAdmin().from('scan_competitors').insert(rows);
  if (error) {
    console.error('[extractCompetitors] insert failed:', error.message);
  } else {
    console.log('[extractCompetitors] stored', rows.length, 'validated competitors for scan', scanId);
  }
}
