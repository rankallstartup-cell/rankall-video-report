// ── Share of Voice ──────────────────────────────────────────────────────────
// More powerful than a bare score: of every AI recommendation in your category,
// what share names YOU vs your competitor? Computed honestly from the persisted
// per-platform scan data (your mentions vs the tracked competitor's mentions).

export interface SovPlatform {
  platform: string;
  youMentioned: boolean;
  competitorMentioned: boolean;
}

export interface ShareOfVoiceResult {
  platforms: SovPlatform[];
  youCount: number;
  competitorCount: number;
  // 0–100. Your share of the recommendations that named either you or the
  // competitor. When neither is named anywhere, share is 0 (you own nothing yet).
  youShare: number;
  competitorShare: number;
  competitorName: string | null;
  // Platforms that produced any response — the denominator for "coverage".
  respondedCount: number;
}

interface RawResult {
  platform: string;
  response_text?: string | null;
  mentioned?: boolean | null;
}

export function computeShareOfVoice(
  results: RawResult[],
  competitorName?: string | null,
): ShareOfVoiceResult {
  const comp = (competitorName || '').trim();
  const compLower = comp.toLowerCase();

  const platforms: SovPlatform[] = results.map(r => {
    const text = r.response_text || '';
    const responded = text.length > 0;
    // Prefer the explicit mentioned flag; fall back to "responded" as a proxy.
    const youMentioned = r.mentioned === true || (r.mentioned == null && responded);
    const competitorMentioned =
      !!comp && responded && text.toLowerCase().includes(compLower);
    return { platform: r.platform, youMentioned, competitorMentioned };
  });

  const youCount = platforms.filter(p => p.youMentioned).length;
  const competitorCount = platforms.filter(p => p.competitorMentioned).length;
  const respondedCount = results.filter(r => (r.response_text || '').length > 0).length;

  const denom = youCount + competitorCount;
  const youShare = denom > 0 ? Math.round((youCount / denom) * 100) : 0;
  const competitorShare = denom > 0 ? 100 - youShare : 0;

  return {
    platforms,
    youCount,
    competitorCount,
    youShare,
    competitorShare,
    competitorName: comp || null,
    respondedCount,
  };
}
