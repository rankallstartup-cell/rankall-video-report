import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { enforceTrialCap } from '@/lib/trialCaps';
import { agencyPlanGate } from '@/lib/agencyPlanGate';
import { scanRevenueEstimate } from '@/lib/revenueModel';
import { PROPOSAL_FEE_SYMBOL, proposalRevenueGap } from '@/lib/proposalCurrency';

// No industry average is quoted: the old constant (52/100) was presented
// as a measured benchmark.

function buildPrompt(args: {
  business_name: string;
  location: string | null;
  website?: string | null;
  industry: string;
  score: number | null;
  competitorScore: number | null;
  proposed_fee: number | string;
  agency_name?: string | null;
  revenueGap: number | null;
  revenueSymbol: string;
  revenueGapOtherCurrency?: boolean;
}) {
  const { business_name, location, website, industry, score, competitorScore, proposed_fee, agency_name, revenueGap, revenueSymbol, revenueGapOtherCurrency } = args;
  const measured = score != null;
  // Never invent a score, competitor score, or revenue gap: when no scan
  // exists the prompt says so and the proposal must quote no measured numbers.
  const facts = measured
    ? `Current AI visibility score: ${score}/100 (measured by a Rankall scan)
Top competitor AI visibility score: ${competitorScore != null ? `${competitorScore}/100` : 'not measured'}
Estimated monthly revenue gap from lost AI referrals (an estimate from the scan's platform mentions, industry customer value and market inquiry volume): ${revenueGap != null ? `${revenueSymbol}${revenueGap.toLocaleString()}` : revenueGapOtherCurrency ? "estimated in the prospect's local currency in the Rankall report — do not quote an amount" : 'not measured — a baseline scan will establish it'}`
    : `No Rankall scan exists for this business yet. Do NOT invent a measured score, competitor score, or revenue gap for them. The proposal must say a free baseline scan establishes their real numbers in week 1, before any gap or ROI figure is quoted.`;
  const section2 = measured
    ? `2. Current Situation — what we found about their AI visibility, using the real score of ${score}/100.`
    : `2. Current Situation — why AI visibility decides who gets the call in ${industry}, and that a free baseline scan in week 1 establishes this business's real numbers before any gap is quoted.`;
  const section3 = measured && competitorScore != null
    ? `3. What We Found — the competitor gap: competitors score ${competitorScore}/100 and are capturing the AI-referred customers this business is losing.`
    : `3. What We Found — the competitor picture will come from the baseline scan; do not quote a competitor score or gap.`;
  const section6 = measured && revenueGap != null
    ? `6. ROI Projection — conservative estimate tied to recovering part of the estimated ~${revenueSymbol}${revenueGap.toLocaleString()}/month revenue gap. Label it as an estimate.`
    : `6. ROI Projection — no quantified gap is quoted yet; the baseline scan establishes the gap, and ROI is projected from those real numbers.`;
  return `Generate a professional GEO (Generative Engine Optimization) proposal for a marketing agency to send to a prospect.

Prospect: ${business_name}${location ? ` in ${location}` : ''}${website ? ` (${website})` : ''}
Industry: ${industry}
${facts}
Proposed monthly fee: ${PROPOSAL_FEE_SYMBOL}${proposed_fee}
Agency name: ${agency_name || 'Our Agency'}

Write a compelling 600-800 word proposal with clear section headers covering exactly:
1. Executive Summary — the AI search shift is happening NOW (2.5B Google AI users, 200M ChatGPT users); create urgency.
${section2}
${section3}
4. Our 12-Week Plan — Week 1-4: Foundations (GBP, citations, schema), Week 5-8: Content & Authority, Week 9-12: Advanced placement & monitoring.
5. Investment — ${PROPOSAL_FEE_SYMBOL}${proposed_fee}/month with clear deliverables.
Use ONLY the ${PROPOSAL_FEE_SYMBOL} currency symbol anywhere in the proposal.
${section6}
7. Why Act Now — early movers win in AI search; the window is closing.

Tone: Professional, data-driven, creates urgency without being pushy. This will be sent as a PDF to the prospect.`;
}

function fallbackProposal(args: {
  business_name: string;
  location: string | null;
  industry: string;
  score: number | null;
  competitorScore: number | null;
  proposed_fee: number | string;
  agency_name?: string | null;
  revenueGap: number | null;
  revenueSymbol: string;
  revenueGapOtherCurrency?: boolean;
}) {
  const { business_name, location, industry, score, competitorScore, proposed_fee, agency_name, revenueGap, revenueSymbol, revenueGapOtherCurrency } = args;
  const agency = agency_name || 'Our Agency';
  const where = location ? ` in ${location}` : '';
  const measured = score != null;
  const currentSituation = measured
    ? `Our analysis places ${business_name}'s current AI visibility score at ${score}/100. In practical terms, when AI engines are asked about ${industry} options${where}, ${business_name} is rarely surfaced — meaning ready-to-buy customers are being routed to competitors instead.`
    : `We have not yet run a Rankall scan for ${business_name}, so this proposal quotes no measured score. A free baseline scan in week 1 establishes the real numbers — current score, competitor position, and revenue gap — before any gap or ROI figure is quoted.`;
  const whatWeFound = measured && competitorScore != null
    ? `The leading competitor in your market scores ${competitorScore}/100 — a ${competitorScore - score}-point lead. That gap is not about quality of service; it is about how well structured and trusted each business appears to AI engines. Competitors with stronger citations, reviews, and schema are capturing the AI-referred customers you are currently losing.`
    : `The competitor picture will come from the baseline scan. We do not quote a competitor score or gap until it is measured.`;
  const roi = revenueGap != null
    ? `The estimated revenue gap from lost AI referrals is approximately ${revenueSymbol}${revenueGap.toLocaleString()}/month (an estimate based on the platforms that don't mention ${business_name}, typical customer value for ${industry}, and AI inquiry volume in your market). Recovering even part of that gap can cover the program cost.`
    : revenueGapOtherCurrency
      ? `The Rankall report estimates the revenue gap from lost AI referrals in your local currency; recovering even part of that gap can cover the program cost.`
      : `No revenue gap is quoted yet — the baseline scan establishes it, and ROI is projected from those real numbers.`;
  return `AI VISIBILITY PROPOSAL FOR ${business_name.toUpperCase()}
Prepared by ${agency}

EXECUTIVE SUMMARY
The way customers find businesses has fundamentally changed. Over 2.5 billion people now use Google's AI-powered search, and more than 200 million use ChatGPT every week. When someone asks an AI assistant to recommend a ${industry}${where}, the AI answers with a short list of businesses — and most never make that list. This shift is happening now, and the businesses that act first will own the recommendations for years to come.

CURRENT SITUATION
${currentSituation}

WHAT WE FOUND
${whatWeFound}

OUR 12-WEEK PLAN
Weeks 1-4 (Foundations): Optimize Google Business Profile, build consistent directory citations, and implement FAQ and local-business schema.
Weeks 5-8 (Content & Authority): Publish AI-optimized content, accelerate review velocity, and strengthen trust signals across platforms.
Weeks 9-12 (Advanced Placement & Monitoring): Secure placements in the sources AI engines cite most, and put ongoing visibility monitoring in place.

INVESTMENT
${PROPOSAL_FEE_SYMBOL}${proposed_fee}/month, covering strategy, implementation, content, citation building, and monthly AI-visibility reporting — a fully managed program with no long-term lock-in.

ROI PROJECTION
${roi}

WHY ACT NOW
AI search rankings compound. The businesses that establish authority today will be the default recommendations tomorrow, and dislodging an entrenched competitor later costs far more than leading now. The window is open — but it is closing fast.

We would welcome the opportunity to get started.
— ${agency}`;
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // b89c: proposal generation is an Agency-plan surface.
  const gate = await agencyPlanGate(user.id);
  if (gate) return gate;
  const trialCap = await enforceTrialCap(req, 'agency_proposal');
  if (trialCap) return trialCap;

  const body = await req.json();
  const { business_name, website, city, state, proposed_fee, agency_name } = body;

  if (!business_name || !proposed_fee) {
    return NextResponse.json({ error: 'business_name and proposed_fee are required' }, { status: 400 });
  }

  // Look up existing scan for this prospect (by business name). Only measured
  // values are used — when no scan exists, score/competitor/gap stay null and
  // the proposal text says so instead of quoting fabricated defaults.
  let scanData: { score?: number; industry?: string; competitorScore?: number; platformsCovered?: number; countryCode?: string } | null = null;
  const { data: existingScan } = await supabase
    .from('rankall_scans')
    .select('overall_score, industry, competitor_score, mentioned_count, country_code')
    .ilike('input', `%${business_name}%`)
    .limit(1)
    .maybeSingle();
  if (existingScan) scanData = {
    score: typeof existingScan.overall_score === 'number' ? existingScan.overall_score : undefined,
    industry: existingScan.industry ?? undefined,
    competitorScore: typeof existingScan.competitor_score === 'number' ? existingScan.competitor_score : undefined,
    platformsCovered: typeof existingScan.mentioned_count === 'number' ? existingScan.mentioned_count : undefined,
    countryCode: (existingScan.country_code as string | null) ?? undefined,
  };

  const score = scanData?.score ?? null;
  const industry = scanData?.industry ?? 'local business';
  const competitorScore = scanData?.competitorScore ?? null;
  const platformsCovered = scanData?.platformsCovered ?? null;
  const location = city ? `${city}${state ? `, ${state}` : ''}` : null;
  // ax80: ONE revenue model — the report's complement model over the scan's
  // real mention count (lib/revenueModel → lib/scoring revenueGapForScan),
  // in the scan market's currency. The old max(500, (comp-score)*80) "$"
  // formula disagreed with the report and floored at an invented $500.
  // No scan / no mention count → null → "not measured".
  const revenueEstimate = scanRevenueEstimate({
    mentionedCount: platformsCovered,
    totalPlatforms: 12,
    industry: scanData?.industry ?? null,
    countryCode: scanData?.countryCode ?? 'US',
  });
  // Item 10: one currency per document. The fee is entered in
  // PROPOSAL_FEE_SYMBOL; a gap in another currency (e.g. £ for a UK scan)
  // is not quoted as a number next to it — the text describes it instead.
  const scanRevenueSymbol = revenueEstimate?.symbol ?? PROPOSAL_FEE_SYMBOL;
  const revenueGap = proposalRevenueGap(revenueEstimate?.gap ?? null, scanRevenueSymbol);
  const revenueGapOtherCurrency = revenueEstimate != null && revenueGap == null;
  const revenueSymbol = PROPOSAL_FEE_SYMBOL;

  const promptArgs = {
    business_name,
    location,
    website,
    industry,
    score,
    competitorScore,
    proposed_fee,
    agency_name,
    revenueGap,
    revenueSymbol,
    revenueGapOtherCurrency,
  };

  let content = '';
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (apiKey) {
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1800,
          messages: [{ role: 'user', content: buildPrompt(promptArgs) }],
        }),
      });

      if (resp.ok) {
        const aiData = await resp.json();
        content = aiData.content?.[0]?.text ?? '';
      } else {
        console.error('Anthropic API error:', await resp.text());
      }
    } catch (e) {
      console.error('Anthropic request failed:', e);
    }
  }

  // Graceful fallback when the key is missing or the API call failed.
  if (!content) {
    content = fallbackProposal(promptArgs);
  }

  // Save to agency_proposals
  const { data: proposal, error: insertError } = await supabase
    .from('agency_proposals')
    .insert({
      agency_user_id:            user.id,
      prospect_business_name:    business_name,
      prospect_website:          website ?? null,
      prospect_city:             city ?? null,
      prospect_state:            state ?? null,
      prospect_score:            score,
      prospect_competitor_score: competitorScore,
      prospect_industry:         industry,
      proposed_monthly_fee:      Number(proposed_fee),
      proposal_content:          content,
      agency_name:               agency_name ?? null,
      status:                    'draft',
      created_at:                new Date().toISOString(),
    })
    .select()
    .single();

  if (insertError) console.error('agency_proposals insert error:', insertError);

  return NextResponse.json({
    proposal_id: proposal?.id ?? null,
    content,
    score,
    competitor_score: competitorScore,
    industry,
    revenue_gap: revenueGap,
    revenue_symbol: revenueSymbol,
    scan_revenue_gap: revenueEstimate?.gap ?? null,
    scan_revenue_symbol: scanRevenueSymbol,
    platforms_covered: platformsCovered,
    score_measured: score != null,
  });
}
