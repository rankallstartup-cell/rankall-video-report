import { NextRequest, NextResponse, after } from 'next/server';
import { getAdminOrInternalActor } from '@/lib/apiAuth';
import { checkRateLimitDb } from '@/lib/rateLimit';
import { ACTIVE_PLATFORMS as PLATFORMS, callPlatform, resetStaggerCounters } from '@/lib/platforms';
import { extractAndStoreCompetitors } from '@/lib/extractCompetitors';
import { selectTopFixTypes, safeBusinessName } from '@/lib/fixIntelligence';
import { generateFixForScan } from '@/lib/generateFix';
import { checkCrawlerAccess, storeCrawlerResult } from '@/lib/crawlerCheck';
import { analyseAllPlatforms, isValidCompetitor, extractAllCompetitors, detectBusinessMention } from '@/lib/analyser-ml';
import { calculateOverallScore, calculateRecommendationShare, type PlatformStatus } from '@/lib/scoring';
import { saveScan, getSupabaseAdmin } from '@/lib/supabase';
// P0a: server-side route — service_role (bypasses RLS); no user session here.
const supabase = getSupabaseAdmin();
import { generateQueryVariations, invalidQueryField } from '@/lib/queryVariations';
import { validateCompetitor } from '@/lib/dataQuality';
import { inferCountryFromText } from '@/lib/countryConfig';
import { lookupGooglePlace } from '@/lib/enrichment';

const CACHE_DAYS = 7;

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MASTER_TIMEOUT_MS = 45000;

// Back-office only (admin session or internal automation): every call spends
// paid LLM credits across ~12 platforms. It was unauthenticated.
const OUTREACH_RATE_LIMIT = { limit: 300, windowMs: 24 * 60 * 60 * 1000 };

export async function POST(req: NextRequest) {
  const actor = await getAdminOrInternalActor(req);
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rl = await checkRateLimitDb('outreach:run-scan', actor, OUTREACH_RATE_LIMIT);
  if (!rl.allowed) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  try {
    const { businessName, industry, city, force } = await req.json();
    if (!businessName || !industry || !city) {
      return NextResponse.json(
        { error: 'businessName, industry, and city required' },
        { status: 400 },
      );
    }
    // Spliced into the generated platform queries — bound them even for
    // admin / internal callers.
    {
      const bad = invalidQueryField({ businessName, industry, city });
      if (bad) return NextResponse.json({ error: 'invalid_input', message: `${bad} must be a short plain-text string.` }, { status: 400 });
    }

    const countryCode = inferCountryFromText(city, `${businessName} ${city}`) || 'US';

    // 7-day scan cache: return stored result if a recent scan exists
    if (!force) {
      try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - CACHE_DAYS);
        const { data: cached } = await supabase
          .from('rankall_scans')
          .select('id, overall_score, mentioned_count, competitor_name, recommendation_share, queries_used, intent_type')
          .ilike('user_business_name', businessName)
          .ilike('business_city', city)
          .gte('created_at', cutoff.toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cached) {
          console.log('[scan] cache hit:', { businessName, city, scanId: cached.id, score: cached.overall_score });
          return NextResponse.json({
            scanId: cached.id,
            saveError: null,
            appeared: (cached.mentioned_count ?? 0) > 0,
            mentionedCount: cached.mentioned_count ?? 0,
            overallScore: cached.overall_score ?? 0,
            recommendationShare: cached.recommendation_share ?? 0,
            competitor: cached.competitor_name ? { name: cached.competitor_name, score: null, platformCount: null } : null,
            query: `best ${industry} in ${city}`,
            queries: cached.queries_used || [],
            platformResults: {},
            resolvedIndustry: industry,
            resolvedCategory: null,
            scoringVersion: 2,
            status: 'scanned',
            cached: true,
          });
        }
      } catch (err) {
        console.error('[scan] cache lookup failed, proceeding with fresh scan:', err);
      }
    }

    // Outreach: operator specified the industry — use it directly.
    // Only call Places for contact info (website/phone/address), not category.
    let placeWebsite: string | null = null;
    let placePhone: string | null = null;
    let placeAddress: string | null = null;

    try {
      const placesResult = await lookupGooglePlace(businessName, city);
      if (placesResult.hasListing) {
        placeWebsite = placesResult.placeWebsite;
        placePhone = placesResult.placePhone;
        placeAddress = placesResult.placeAddress;
        console.log('[outreach-scan] Places contact info:', { businessName, placeWebsite, placePhone, placeAddress });
      }
    } catch (err) {
      console.error('[outreach-scan] Places lookup failed:', err);
    }

    const categoryNoun = industry;
    const categoryQuery = `best ${categoryNoun} in ${city}`;
    const queries = generateQueryVariations(categoryQuery);
    console.log('[outreach-scan] queries:', JSON.stringify(queries));

    // Fire all queries across all platforms (same fan-out as main scan)
    const platformMap = new Map<string, {
      platform: string;
      weight: number;
      responses: string[];
      error: string | null;
    }>();

    PLATFORMS.forEach(p => {
      platformMap.set(p.name, {
        platform: p.name,
        weight: p.weight,
        responses: [],
        error: null,
      });
    });

    resetStaggerCounters();
    const jobs = PLATFORMS.flatMap(platform => {
      const pQueries = platform.maxQueries ? queries.slice(0, platform.maxQueries) : queries;
      return pQueries.map(query =>
        callPlatform(platform, query)
          .then(response => {
            if (response) {
              const entry = platformMap.get(platform.name);
              if (entry) entry.responses.push(response);
            }
          })
          .catch(err => {
            const entry = platformMap.get(platform.name);
            if (entry && !entry.error) entry.error = err?.message || 'Failed';
          })
      );
    });

    await Promise.race([
      Promise.allSettled(jobs),
      new Promise<void>(resolve => setTimeout(resolve, MASTER_TIMEOUT_MS)),
    ]);

    const platformResults = Array.from(platformMap.values()).map(entry => ({
      platform: entry.platform,
      weight: entry.weight,
      status: entry.responses.length > 0 ? 'success' : 'error',
      response: entry.responses.length > 0
        ? entry.responses.join('\n\n---\n\n')
        : null,
      error: entry.responses.length > 0 ? null : entry.error,
    }));

    // Build per-query response arrays for fractional mention scoring
    const perQueryMap = new Map<string, string[]>();
    for (const [name, entry] of platformMap) {
      perQueryMap.set(name, [...entry.responses]);
    }

    const analysis = await analyseAllPlatforms({
      businessName,
      city,
      results: platformResults.map(r => ({
        platform: r.platform,
        weight: r.weight,
        response: r.response,
        perQueryResponses: perQueryMap.get(r.platform) || [],
      })),
      queries,
      category: industry,
    });

    const scoreInputs = analysis.map((a, i) => ({
      weight: a.weight,
      mentionRate: a.mentionRate,
      competitor_mentioned: a.competitor_mentioned,
      status: (platformResults[i]?.status === 'success' ? 'success' : 'error') as PlatformStatus,
    }));

    const { score, mentionedCount } = calculateOverallScore(scoreInputs, queries.length);
    // b02f: canonical mentioned/12 — same formula as /api/scan.
    const recommendationShare = calculateRecommendationShare(mentionedCount, PLATFORMS.length);

    // Extract ALL competitors with name normalization, then score each one
    const responsesForComp = platformResults
      .map(r => ({ platform: r.platform, response: r.response || '' }))
      .filter(r => r.response);
    const allDetected = await extractAllCompetitors(responsesForComp, businessName, undefined, { queries, city, category: industry });

    // Score each valid competitor through the same weighted formula
    const scoredCompetitors: Array<{ name: string; score: number; platformCount: number; platforms: string[] }> = [];
    for (const comp of allDetected) {
      if (!isValidCompetitor(comp.name)) continue;
      try {
        const cv = validateCompetitor(comp.name, businessName, city);
        if (cv.status === 'blocked') continue;
      } catch { /* fail open */ }

      const compScoreInputs = platformResults.map((r, i) => {
        const pqr = perQueryMap.get(r.platform) || [];
        let mentionRate = 0;
        if (pqr.length > 0) {
          const hits = pqr.filter(resp => detectBusinessMention(resp, comp.name)).length;
          mentionRate = hits / pqr.length;
        } else if (r.response) {
          mentionRate = detectBusinessMention(r.response, comp.name) ? 1 : 0;
        }
        return {
          weight: analysis[i]?.weight ?? 1,
          mentionRate,
          status: (r.status === 'success' ? 'success' : 'error') as PlatformStatus,
        };
      });
      const compResult = calculateOverallScore(compScoreInputs, queries.length);
      scoredCompetitors.push({
        name: comp.name,
        score: compResult.score,
        platformCount: compResult.mentionedCount,
        platforms: comp.platforms,
      });
    }

    // Sort by score desc, then platformCount desc
    scoredCompetitors.sort((a, b) => b.score - a.score || b.platformCount - a.platformCount);
    console.log('[scan] all competitors:', scoredCompetitors.map(c => ({ name: c.name, score: c.score, platformCount: c.platformCount, platforms: c.platforms })));

    const topComp = scoredCompetitors[0] || null;
    const competitor = topComp?.name || null;
    const competitorScore = topComp?.score ?? null;
    const competitorPlatformCount = topComp?.platformCount ?? 0;

    console.log('[outreach-scan] calling saveScan:', {
      businessName, city, score, mentionedCount, industry,
      platformCount: platformResults.length,
      successCount: platformResults.filter(r => r.status === 'success').length,
    });

    let scanId: string | null = null;
    let saveError: string | null = null;
    try {
      scanId = await saveScan({
        input: categoryQuery,
        intentType: 'outreach',
        industry,
        location: city,
        overallScore: score,
        results: platformResults.map(r => ({
          platform: r.platform,
          weight: r.weight,
          response: r.response,
          error: r.status === 'error' ? 'Platform call failed' : null,
          status: r.status,
        })),
        competitorName: competitor,
        mentionedCount,
        countryCode,
        businessName,
        city,
        queriesUsed: queries,
        resolvedCategory: null,
        categoryConfidence: null,
        recommendationShare,
      });
    } catch (saveErr: any) {
      console.error('[outreach-scan] saveScan threw:', saveErr);
      saveError = saveErr?.message || String(saveErr);
    }

    console.log('[outreach-scan] saveScan returned:', { scanId, businessName, saveError });

    if (scanId) {
      const extractQuery = categoryQuery;
      const extractResults = platformResults.map(r => ({ platform: r.platform, weight: r.weight, response: r.response }));
      const fixScore = score;
      const fixBizName = safeBusinessName(businessName);
      const fixIndustry = industry;
      const fixCity = city;
      const fixCountry = countryCode;
      const fixWebsite = placeWebsite;
      const fixPhone = placePhone;
      const fixAddress = placeAddress;
      after(async () => {
        console.log('[outreach-scan] after() fired, scanId:', scanId);
        try {
          await extractAndStoreCompetitors(scanId, extractQuery, extractResults, {
            businessName,
            queries,
            city,
            category: industry,
          });
        } catch (err) {
          console.error('[outreach-scan] competitor extraction failed:', err);
        }

        // Crawler check (best-effort, 3s timeout built in)
        let blockedBots: string[] = [];
        let crawlerRawLines: string[] = [];
        if (fixWebsite) {
          try {
            const crawlerResult = await checkCrawlerAccess(fixWebsite);
            blockedBots = crawlerResult.blockedBots;
            crawlerRawLines = crawlerResult.rawLines;
            await storeCrawlerResult(scanId, crawlerResult);
            if (blockedBots.length > 0) {
              console.log('[outreach-scan] crawler blocked:', blockedBots);
            }
          } catch (err) {
            console.error('[outreach-scan] crawler check failed:', err);
          }
        }

        try {
          const topFixTypes = selectTopFixTypes([], null, fixScore, 0, {
            blockedBots,
            isFreeSlot: true,
          }).slice(0, 3);
          console.log('[outreach-scan] generating fixes:', topFixTypes, 'score:', fixScore, 'biz:', fixBizName);
          for (const fixType of topFixTypes) {
            const result = await generateFixForScan({
              scanId, fixType,
              businessName: fixBizName, industry: fixIndustry,
              city: fixCity, countryCode: fixCountry, score: fixScore,
              website: fixWebsite || undefined, phone: fixPhone || undefined,
              address: fixAddress || undefined, category: fixIndustry,
              source: 'auto_after_scan',
              blockedBots: fixType === 'crawler_access' ? blockedBots : undefined,
              crawlerRawLines: fixType === 'crawler_access' ? crawlerRawLines : undefined,
            });
            console.log('[outreach-scan] fix result:', fixType, result.success, result.error || result.skipReason || 'OK');
          }
        } catch (err) {
          console.error('[outreach-scan] fix generation failed:', err);
        }
      });
    }

    const competitorObj = competitor ? {
      name: competitor,
      score: competitorScore,
      platformCount: competitorPlatformCount,
    } : null;
    console.log('[outreach-scan] competitor response:', JSON.stringify(competitorObj));

    return NextResponse.json({
      scanId,
      saveError,
      appeared: mentionedCount > 0,
      mentionedCount,
      overallScore: score,
      recommendationShare,
      competitor: competitorObj,
      query: categoryQuery,
      queries,
      platformResults: Object.fromEntries(
        analysis.map(a => [a.platform, a.mentioned]),
      ),
      resolvedIndustry: industry,
      resolvedCategory: null,
      scoringVersion: 2,
      status: 'scanned',
    });
  } catch (err) {
    console.error('run-scan error:', err);
    return NextResponse.json({ error: 'Scan failed' }, { status: 500 });
  }
}
