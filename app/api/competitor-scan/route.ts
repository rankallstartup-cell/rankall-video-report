import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchGooglePlaces, fetchSerpData, fetchRedditMentions } from '@/lib/enrichment';
import { detectTrustSignals } from '@/lib/trustServer';
import { detectIndustry } from '@/lib/industry-config';
import { analyseAllPlatforms } from '@/lib/analyser-ml';
import { calculateOverallScore, type PlatformStatus } from '@/lib/scoring';
import { resolveCountryFromRequest } from '@/lib/countryConfig';
import { checkUsageLimit, incrementUsage } from '@/lib/usageLimits';
import { resolvePlanServer } from '@/lib/resolvePlanServer';
import { getSessionUser, isCronRequest, userOwnsScan } from '@/lib/apiAuth';
import { competitorNameList } from '@/lib/rescanTrust';
import { invalidQueryField } from '@/lib/queryVariations';

export const dynamic = 'force-dynamic';

const PLATFORMS = [
  { name: 'ChatGPT',    weight: 0.25 / 1.05, model: 'gpt-4o-mini',            apiKey: process.env.OPENAI_API_KEY },
  { name: 'Gemini',     weight: 0.18 / 1.05, model: 'gemini-2.5-flash',       apiKey: process.env.GEMINI_API_KEY },
  { name: 'Google AI',  weight: 0.15 / 1.05, model: 'serpapi',                 apiKey: process.env.SERPAPI_KEY },
  { name: 'Copilot',    weight: 0.10 / 1.05, model: 'gpt-4o',                  apiKey: process.env.OPENAI_API_KEY },
  { name: 'Perplexity', weight: 0.09 / 1.05, model: 'sonar',                   apiKey: process.env.PERPLEXITY_API_KEY },
  { name: 'Grok',       weight: 0.07 / 1.05, model: 'grok-3-mini',             apiKey: process.env.GROK_API_KEY },
  { name: 'Claude',     weight: 0.06 / 1.05, model: 'claude-haiku-4-5',        apiKey: process.env.ANTHROPIC_API_KEY },
  { name: 'DeepSeek',   weight: 0.04 / 1.05, model: 'deepseek-chat',           apiKey: process.env.DEEPSEEK_API_KEY },
  { name: 'Mistral',    weight: 0.03 / 1.05, model: 'mistral-small-latest',    apiKey: process.env.MISTRAL_API_KEY },
  { name: 'Kimi',       weight: 0.02 / 1.05, model: 'kimi-k2.6',                 apiKey: process.env.KIMI_API_KEY },
  { name: 'Groq',       weight: 0.01 / 1.05, model: 'openai/gpt-oss-120b', apiKey: process.env.GROQ_API_KEY },
  { name: 'Meta AI',    weight: 0.05 / 1.05, model: 'muse-spark-1.3', apiKey: process.env.MODEL_API_KEY },
  // Meta AI included via the Meta Model API. We scan 12 active platforms.
  // Weights match lib/platforms.ts (renormalized Oct 26: pre-Meta weight / 1.05, sums to 100%).
];

async function callPlatform(platform: typeof PLATFORMS[0], query: string): Promise<string> {
  if (!platform.apiKey) return '';

  const prompt = `${query}\n\nProvide a helpful, concise answer. If asking about a local business or brand, give your best recommendation based on your knowledge.`;

  if (platform.name === 'ChatGPT' || platform.name === 'Copilot') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${platform.apiKey}` },
      body: JSON.stringify({ model: platform.model, messages: [{ role: 'user', content: prompt }], max_tokens: 400 }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  if (platform.name === 'Gemini') {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${platform.model}:generateContent?key=${platform.apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 400, temperature: 0.1 } }) }
    );
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  if (platform.name === 'Claude') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': platform.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: platform.model, max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await res.json();
    return data.content?.[0]?.text || '';
  }

  if (platform.name === 'Google AI') {
    const params = new URLSearchParams({ q: query, api_key: platform.apiKey, gl: 'us', hl: 'en' });
    const res = await fetch(`https://serpapi.com/search.json?${params}`);
    const data = await res.json();
    const aiOverview = data.ai_overview?.text_blocks?.map((b: any) => b.snippet || b.text || '').filter(Boolean).join(' ') || '';
    return aiOverview || data.organic_results?.[0]?.snippet || '';
  }

  if (platform.name === 'Meta AI') {
    // Meta Model API — muse-spark-1.3 (reasoning model: max_tokens 4000,
    // small budgets return empty content). Standard tier only, never
    // -contributor (Meta trains on contributor prompts/completions).
    // Redirects disabled so the bearer credential never leaks via redirect.
    const res = await fetch('https://api.meta.ai/v1/chat/completions', {
      method: 'POST', redirect: 'manual',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${platform.apiKey}` },
      body: JSON.stringify({ model: platform.model, messages: [{ role: 'user', content: prompt }], temperature: 0, top_p: 1, max_tokens: 4000 }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  // OpenAI-compatible endpoints
  const endpointMap: Record<string, string> = {
    'Groq':       'https://api.groq.com/openai/v1/chat/completions',
    'Perplexity': 'https://api.perplexity.ai/chat/completions',
    'Grok':       'https://api.x.ai/v1/chat/completions',
    'DeepSeek':   'https://api.deepseek.com/chat/completions',
    'Mistral':    'https://api.mistral.ai/v1/chat/completions',
    'Kimi':       'https://api.moonshot.ai/v1/chat/completions',
  };
  const endpoint = endpointMap[platform.name];
  if (!endpoint) return '';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${platform.apiKey}` },
    // grok-3-mini is a reasoning model — low effort keeps it inside the timeout
    // (same fix as the main scan path in lib/platforms.ts).
    body: JSON.stringify({ model: platform.model, messages: [{ role: 'user', content: prompt }], max_tokens: 400, ...(platform.name === 'Grok' ? { reasoning_effort: 'low' } : {}) }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

export async function POST(req: NextRequest) {
  try {
    const { competitorName, industry, location, userBusinessInput, userTrustSignals, userCitationSources, userMentionedCount, userId: bodyUserId, scanId: bodyScanId } = await req.json();

    // IDOR fix: the user is the SESSION user. Only an internal caller
    // holding CRON_SECRET (trigger-rescans) may act for body.userId. The
    // old route trusted body.userId (spend/write any user's quota) and
    // skipped limits entirely when userId was omitted — an 12-platform LLM
    // scan with no cap. A session (or the internal secret) is now required.
    const internal = isCronRequest(req);
    const sessionUser = internal ? null : await getSessionUser(req);
    const userId: string | null = internal ? (bodyUserId || null) : (sessionUser?.id ?? null);
    if (!userId) {
      return NextResponse.json(
        { error: 'authentication_required', message: 'Sign in to run a competitor scan.' },
        { status: 401 },
      );
    }
    // scanId is written to the user's history row — only their own scan.
    let scanId: string | null = null;
    if (bodyScanId) {
      const sbOwn = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } },
      );
      // Cast avoids a TS2589 deep-instantiation on the generic client type.
      if (await userOwnsScan(sbOwn as unknown as Parameters<typeof userOwnsScan>[0], bodyScanId, { id: userId, email: sessionUser?.email ?? null })) scanId = bodyScanId;
    }

    if (!competitorName) {
      return NextResponse.json({ error: 'competitorName required' }, { status: 400 });
    }
    // competitorName / location / industry are spliced into the 12-platform
    // query — bound them before any paid call.
    {
      const bad = invalidQueryField({ competitorName, location, industry });
      if (bad) return NextResponse.json({ error: 'invalid_input', message: `${bad} must be a short plain-text string.` }, { status: 400 });
    }

    // Hoisted so incrementUsage below can pass it (admins never counted).
    let userEmail = '';

    // Monthly usage enforcement (userId is always set at this point).
    if (userId) {
      let userPlan = 'free';
      let userIsTrialing = false;
      try {
        const resolved = await resolvePlanServer(userId);
        userPlan = resolved.plan;
        userEmail = resolved.email;
        userIsTrialing = resolved.isTrialing;
      } catch { /* fall through — treat as free */ }

      const limitCheck = await checkUsageLimit(userId, userEmail, 'competitor_scan', userPlan, userIsTrialing);
      if (!limitCheck.allowed) {
        return NextResponse.json({
          error: 'competitor_scan_limit_reached',
          message: limitCheck.message,
          current: limitCheck.current,
          limit: limitCheck.limit,
          remaining: limitCheck.remaining,
          resetDate: limitCheck.resetDate,
          upgradeUrl: '/pricing',
        }, { status: 429 });
      }
    }

    const detectedIndustry = industry || detectIndustry(competitorName);
    const query = `${competitorName}${location ? ' in ' + location : ''}`;

    // Run platform scan + enrichment in parallel
    const [platformResults, googleData, serpData, redditData] = await Promise.all([
      // Platform scan across all platforms
      Promise.allSettled(
        PLATFORMS.map(p => callPlatform(p, query).then(response => ({ platform: p.name, weight: p.weight, response })))
      ).then(results => PLATFORMS.map((p, i) => {
        const r = results[i];
        return {
          platform: p.name,
          weight: p.weight,
          response: r.status === 'fulfilled' ? r.value.response || null : null,
        };
      })),
      fetchGooglePlaces(competitorName, location || ''),
      fetchSerpData(query, location || ''),
      fetchRedditMentions(competitorName, location || ''),
    ]);

    const analysis = await analyseAllPlatforms({
      businessName: competitorName,
      results: platformResults.map(r => ({ platform: r.platform, weight: r.weight, response: r.response })),
    });
    // Competitor score uses the SAME weighted recommendation formula as the business
    // score (lib/scoring) — true apples-to-apples for the "you 31 vs competitor 78"
    // comparison. (Was coverage-based: response-count / 11.)
    const mentionedCount = analysis.filter(a => a.mentionRate > 0).length;
    const competitorScore = calculateOverallScore(
      analysis.map((a, i) => ({ weight: a.weight, mentionRate: a.mentionRate, status: (platformResults[i]?.response ? 'success' : 'error') as PlatformStatus })),
      1,
    ).score;
    // ax87: citations only from responses that mention the competitor.
    const citationSources = [...new Set(analysis.filter(a => a.mentionRate > 0).flatMap(a => a.citationSources))];

    const trustSignals = await detectTrustSignals({
      businessInput: competitorName,
      scanResults: platformResults.map((r, i) => ({ platform: r.platform, response: r.response, mentioned: (analysis[i]?.mentionRate ?? 0) > 0 })),
      citationSources,
      industry: detectedIndustry,
      // b0fh: measure on the SAME basis as the main scan — the website
      // (from the confidently-matched Places record) + verified Google and
      // SERP data. Without the website every technical signal was
      // not_checked, so "you vs competitor" compared different signal sets.
      websiteUrl: googleData?.website || undefined,
      // Places-discovered site — never 'verified' (same rule as /api/scan).
      websiteVerified: false,
      // The user's own business is a competitor OF the competitor: a longer
      // user name containing the competitor's is attributed to the user.
      competitorNames: competitorNameList([typeof userBusinessInput === 'string' ? userBusinessInput : null]),
      enrichment: { reddit: redditData ?? null, google: googleData ?? null, serpData: (serpData ?? null) as Record<string, boolean | undefined> | null },
    }, resolveCountryFromRequest(req.headers));

    // Build side-by-side gap analysis
    const gaps: string[] = [];
    if (userTrustSignals && trustSignals) {
      const userDir = (userTrustSignals.directory || []).filter((s: any) => s.status === 'good').map((s: any) => s.name);
      const compDir = (trustSignals.directory || []).filter((s: any) => s.status === 'good').map((s: any) => s.name);
      const compOnly = compDir.filter((n: string) => !userDir.includes(n));
      if (compOnly.length > 0) gaps.push(`${competitorName} is listed on ${compOnly.slice(0, 3).join(', ')} — you are not`);

      const userGood = (userTrustSignals.technical || []).filter((s: any) => s.status === 'good').map((s: any) => s.name);
      const compGood = (trustSignals.technical || []).filter((s: any) => s.status === 'good').map((s: any) => s.name);
      const techGap = compGood.filter((n: string) => !userGood.includes(n));
      if (techGap.length > 0) gaps.push(`${competitorName} has ${techGap.slice(0, 2).join(' and ')} on their website — critical signals you are missing`);
    }
    if ((googleData?.reviewCount || 0) > 50) gaps.push(`${competitorName} has ${googleData?.reviewCount} Google reviews (${googleData?.rating}★) — review volume drives AI citation frequency`);

    const platformMentions = platformResults
      .filter(r => r.response)
      .map(r => r.platform);

    // Save to competitor_scans history
    if (userId) {
      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        await supabase.from('competitor_scans').insert({
          user_id: userId,
          scan_id: scanId || null,
          competitor_name: competitorName,
          competitor_score: competitorScore,
          competitor_trust_score: trustSignals?.overall ?? 0,
          competitor_platforms_count: mentionedCount,
          scanned_at: new Date().toISOString(),
        });
      } catch (saveErr) {
        console.error('Failed to save competitor scan history:', saveErr);
      }
    }

    // Count against the user's monthly competitor_scan quota after success.
    if (userId) await incrementUsage(userId, 'competitor_scan', userEmail);

    return NextResponse.json({
      success: true,
      competitor: {
        name: competitorName,
        industry: detectedIndustry,
        score: competitorScore,
        mentionedCount,
        citationSources,
        platformMentions,
        trustSignals,
        google: googleData || null,
        serpData: serpData || null,
        reddit: redditData || null,
      },
      comparison: {
        userScore: userMentionedCount !== undefined ? Math.round((userMentionedCount / PLATFORMS.length) * 100) : null,
        competitorScore,
        userMentionedCount: userMentionedCount || 0,
        competitorMentionedCount: mentionedCount,
        userCitationSources: userCitationSources || [],
        competitorCitationSources: citationSources,
        gaps: gaps.slice(0, 3),
      },
    });
  } catch (err) {
    console.error('Competitor scan error:', err);
    return NextResponse.json({ error: 'Scan failed' }, { status: 500 });
  }
}
