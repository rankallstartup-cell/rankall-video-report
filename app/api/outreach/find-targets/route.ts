import { NextRequest, NextResponse } from 'next/server';
import { getAdminOrInternalActor } from '@/lib/apiAuth';
import { checkRateLimitDb } from '@/lib/rateLimit';
import {
  fetchMapsResults,
  toTargetSearchErrorResponse,
  type OutreachTarget,
} from '@/lib/outreachFailureShapes';
import { normalizeBusinessName, qualityScoreFor, rankTargetsByQuality, isLikelyChain, distinctAddressCounts } from '@/lib/outreachTargeting';

export const dynamic = 'force-dynamic';


// Back-office only (admin session or internal automation): spends SerpAPI
// credits (3 searches per call). It was unauthenticated.
const OUTREACH_RATE_LIMIT = { limit: 100, windowMs: 24 * 60 * 60 * 1000 };

export async function POST(req: NextRequest) {
  const actor = await getAdminOrInternalActor(req);
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rl = await checkRateLimitDb('outreach:find-targets', actor, OUTREACH_RATE_LIMIT);
  if (!rl.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  try {
    const { industry, city, state, countryCode, excludeChains } = await req.json();
    if (!industry || !city) {
      return NextResponse.json({ error: 'industry and city required' }, { status: 400 });
    }

    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey) return NextResponse.json({ error: 'SERPAPI_KEY not set' }, { status: 500 });

    const location = city + (state ? ' ' + state : '');
    const queries = [
      `${industry} in ${location}`,
      `best ${industry} ${location}`,
      `${industry} near ${location}`,
    ];

    const gl = (countryCode || 'US').toLowerCase();
    // Fix #10: a SerpAPI failure is an explicit 502, never a silent []
    // that looks like "no targets found". Any one of the 3 queries failing
    // fails the whole search — partial results would silently under-report.
    const allResults = await Promise.all(queries.map(q => fetchMapsResults(q, apiKey, gl)));
    const flat = allResults.flat();

    const seen = new Set<string>();
    const targets: OutreachTarget[] = [];
    for (const t of flat) {
      const key = t.businessName.toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      targets.push(t);
    }

    // #9 targeting quality: annotate quality + chain signal, rank website +
    // reviews first (website-less targets stay, ranked lower). Chain filter
    // is OPT-IN (excludeChains, default OFF): filtered targets are reported
    // with a reason, never dropped silently.
    const addressCounts = distinctAddressCounts(flat);
    for (const t of targets) {
      t.qualityScore = qualityScoreFor(t);
      t.likelyChain = isLikelyChain(normalizeBusinessName(t.businessName), addressCounts.get(normalizeBusinessName(t.businessName)) ?? 0);
    }
    const ranked = rankTargetsByQuality(targets);
    const excluded: Array<{ businessName: string; reason: string }> = [];
    const kept = excludeChains === true
      ? ranked.filter(t => {
          if (t.likelyChain) { excluded.push({ businessName: t.businessName, reason: 'chain_filter' }); return false; }
          return true;
        })
      : ranked;

    if (targets.length === 0) {
      console.warn('[find-targets] No maps results for:', queries[0]);
    }

    return NextResponse.json({ targets: kept.slice(0, 50), filteredChains: excluded.length, excluded });
  } catch (err: any) {
    // Server-side log only: the raw error can carry provider internals.
    // The client gets a generic message, never the raw error.
    console.error('find-targets error:', err?.message);
    const { status, body } = toTargetSearchErrorResponse();
    return NextResponse.json(body, { status });
  }
}
