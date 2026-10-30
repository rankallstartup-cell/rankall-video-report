import { NextRequest, NextResponse } from 'next/server';
import { getCountryConfig, resolveCountryFromRequest } from '@/lib/countryConfig';
import { getSupabaseAdmin } from '@/lib/supabase';
import { impactRangeForFix } from '@/lib/fixIntelligence';
import { guardAiRoute } from '@/lib/aiRouteGuard';

// P0e: DEPRECATED as a primary read path. The report page now reads persisted
// fixes from generated_fixes via /api/fixes/for-scan (single source of truth).
// Ticket 5: this endpoint PERSISTS what it generates (upsert on
// scan_id+fix_type) so the same scan always shows the same fixes —
// previously every page load regenerated via AI and projections drifted.

const COUNTRY_NAMES: Record<string, string> = {
  US: 'the United States', GB: 'the United Kingdom', AU: 'Australia', CA: 'Canada',
  IE: 'Ireland', NZ: 'New Zealand', SG: 'Singapore', AE: 'the United Arab Emirates',
  ZA: 'South Africa', NG: 'Nigeria', KE: 'Kenya', GH: 'Ghana', IN: 'India', PH: 'the Philippines',
};

interface TrustSignal {
  name: string;
  status: 'good' | 'warning' | 'danger' | 'missing';
  value: string;
  impact: 'high' | 'medium' | 'low';
  fixAvailable: boolean;
}

interface TrustSignalReport {
  technical: TrustSignal[];
  directory: TrustSignal[];
  reviews: TrustSignal[];
  community: TrustSignal[];
  overall: number;
}

// Map trust signal names to the fix_types we support
const SIGNAL_TO_FIX: Record<string, string> = {
  'FAQ Schema':              'faq_schema',
  'LocalBusiness JSON-LD':   'jsonld',
  'Review mentions':         'reviews',
  'Review count':            'reviews',
  'Response rate signals':   'reviews',
  'Reddit mentions':         'reddit',
  'Google Business':         'directory',
  'Yelp':                    'directory',
  'Healthgrades':            'directory',
  'Zocdoc':                  'directory',
};

const FIX_TYPE_LABELS: Record<string, string> = {
  faq_schema: 'FAQ Schema Markup',
  jsonld:     'LocalBusiness JSON-LD',
  directory:  'Directory Listing',
  reviews:    'Google Review Responses',
  reddit:     'Reddit Presence',
};

// b0fj: deterministic fallback copy, used when the AI service is
// unavailable (no API key on Preview, or the Anthropic call fails).
// Each fix is grounded in the scan's own trust-signal gap when one
// exists for its type, and carries modest confidence (60) so it never
// masquerades as an AI-personalized fix (AI fixes claim 80-96).
const TEMPLATE_FIX_ACTION: Record<string, string> = {
  faq_schema: 'Add FAQPage JSON-LD schema to your homepage so AI platforms can surface your Q&As in local queries.',
  jsonld:     'Add LocalBusiness JSON-LD structured data to your homepage so AI platforms can read your exact name, address, phone, and hours.',
  directory:  'Claim and complete your listings on the directories AI engines cite in your market, with matching name, address, and phone everywhere.',
  reviews:    'Respond to your recent Google reviews — including the negative ones — so AI platforms see an active, trusted business.',
  reddit:     'Build a genuine presence where your customers ask for recommendations, starting with a helpful answer in one relevant community thread.',
};
const TEMPLATE_FIX_EFFORT: Record<string, string> = {
  faq_schema: '20 min',
  jsonld:     '20 min',
  directory:  '1 hour',
  reviews:    '30 min',
  reddit:     '1 hour',
};

function buildTemplateFixes(
  orderedFixTypes: string[],
  gaps: Array<{ signalName: string; fixType: string; impact: string; value: string }>,
): Array<{ id: string; title: string; description: string; predicted_impact: number; confidence: number; effort: string; fix_type: string; status: string }> {
  return orderedFixTypes.slice(0, 5).map((ft) => {
    const gap = gaps.find(g => g.fixType === ft);
    const description = gap
      ? `Your scan found: ${gap.value} ${TEMPLATE_FIX_ACTION[ft] || ''}`.trim()
      : TEMPLATE_FIX_ACTION[ft] || '';
    return {
      id: ft,
      title: FIX_TYPE_LABELS[ft] || 'Fix',
      description,
      predicted_impact: impactRangeForFix(ft).mid,
      confidence: 60,
      effort: TEMPLATE_FIX_EFFORT[ft] || '1 hour',
      fix_type: ft,
      status: 'pending',
    };
  });
}

function gatherPriorityGaps(trustSignals: TrustSignalReport | null): Array<{ signalName: string; fixType: string; impact: string; value: string }> {
  if (!trustSignals) return [];

  const allSignals = [
    ...(trustSignals.technical || []),
    ...(trustSignals.directory || []),
    ...(trustSignals.reviews   || []),
    ...(trustSignals.community || []),
  ];

  // Only broken signals with a known fix type, sorted high→medium→low
  const impactOrder = { high: 0, medium: 1, low: 2 };
  return allSignals
    .filter(s => (s.status === 'missing' || s.status === 'danger' || s.status === 'warning') && SIGNAL_TO_FIX[s.name])
    .sort((a, b) => (impactOrder[a.impact] ?? 3) - (impactOrder[b.impact] ?? 3))
    .map(s => ({ signalName: s.name, fixType: SIGNAL_TO_FIX[s.name], impact: s.impact, value: s.value }));
}

// Ticket 5: persist so the next load reads these via /api/fixes/for-scan
// instead of regenerating (which made projections non-deterministic).
// Best-effort: a persistence failure must not break the response.
async function persistAndRespond(opts: {
  fixes: Array<{ id: string; title: string; description: string; predicted_impact: number; confidence: number; effort: string; fix_type: string; status: string }>;
  scanId?: string;
  industry?: string;
  location?: string;
  resolvedCountry: string;
}) {
  const { fixes, scanId, industry, location, resolvedCountry } = opts;
  if (scanId) {
    try {
      const admin = getSupabaseAdmin();
      const { data: scanRow } = await admin
        .from('rankall_scans')
        .select('user_id')
        .eq('id', scanId)
        .maybeSingle();
      const ownerId = (scanRow as { user_id: string | null } | null)?.user_id
        ?? '00000000-0000-0000-0000-000000000000';
      const rows = fixes.map((f) => ({
        scan_id: scanId,
        user_id: ownerId,
        fix_type: f.fix_type,
        fix_title: f.title,
        generated_content: f.description,
        predicted_impact: f.predicted_impact,
        confidence: f.confidence,
        time_to_implement: f.effort,
        status: 'pending_review',
        industry: industry || null,
        city: location || null,
        country_code: resolvedCountry,
      }));
      await admin
        .from('generated_fixes')
        .upsert(rows, { onConflict: 'scan_id,fix_type' });
    } catch (persistErr) {
      console.error('[generate-fixes] persist failed (non-fatal):', persistErr);
    }
  }
  return NextResponse.json({ success: true, fixes });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const scanId: string | undefined = typeof body?.scanId === 'string' ? body.scanId : undefined;

    // Spends Anthropic credits and PERSISTS into generated_fixes for the
    // scan, so it needs a scan the caller may act on: the owner (or admin),
    // or — for the anonymous free report — an ownerless scan, metered per
    // IP. Previously anyone could overwrite any customer's fix queue.
    const guard = await guardAiRoute(req, {
      bucket: 'ai:generate-fixes', userLimit: 60, anonIpLimit: 10, scanId, requireScan: true,
    });
    if (!guard.ok) return guard.response;
    const scan = guard.scan ?? {};
    // Prompt facts come from the stored scan, not the body (the body can
    // only fill gaps the row does not have).
    const pick = <T,>(col: string, fallback: T): T => (scan[col] ?? fallback) as T;
    const businessInput: string = pick('input', body.businessInput);
    const industry: string = pick('industry', body.industry);
    const location: string = pick('location', body.location);
    const trustSignals = pick('trust_signals', body.trustSignals);
    const citationSources = pick('citation_sources', body.citationSources);
    const mentionedCount = pick('mentioned_count', body.mentionedCount);
    const competitor = pick('competitor_name', body.competitor);
    const overallScore = pick('overall_score', body.overallScore);
    const countryCode = pick('country_code', body.countryCode);

    if (!businessInput) {
      return NextResponse.json({ error: 'businessInput required' }, { status: 400 });
    }

    // Country: explicit body value first, then cookie override / IP geo.
    const resolvedCountry = (countryCode && getCountryConfig(countryCode).code === countryCode)
      ? countryCode
      : resolveCountryFromRequest(req.headers);
    const countryConfig = getCountryConfig(resolvedCountry);
    const countryName = COUNTRY_NAMES[resolvedCountry] || resolvedCountry;

    const apiKey = process.env.ANTHROPIC_API_KEY;

    const gaps = gatherPriorityGaps(trustSignals);
    const loc  = location || 'their area';
    const ind  = industry || 'local business';

    // Build a deduplicated set of the top 5 fix types to generate, prioritising gaps
    const orderedFixTypes: string[] = [];
    for (const gap of gaps) {
      if (!orderedFixTypes.includes(gap.fixType)) orderedFixTypes.push(gap.fixType);
      if (orderedFixTypes.length === 5) break;
    }
    // Pad with defaults if fewer than 5 gaps found
    for (const ft of ['faq_schema', 'jsonld', 'reviews', 'directory', 'reddit']) {
      if (!orderedFixTypes.includes(ft)) orderedFixTypes.push(ft);
      if (orderedFixTypes.length === 5) break;
    }

    // b0fj: no 500 when the AI service is unavailable — the fix queue
    // failed deterministically on Preview (no key) and Retry could never
    // succeed. Deterministic template fixes keep the queue working.
    if (!apiKey) {
      const templateFixes = buildTemplateFixes(orderedFixTypes, gaps);
      return persistAndRespond({ fixes: templateFixes, scanId, industry, location, resolvedCountry });
    }

    const gapSummary = gaps.slice(0, 8).map(g => `- ${g.signalName} (${g.impact} impact): ${g.value}`).join('\n');
    const citationStr = (citationSources || []).slice(0, 6).join(', ') || 'none detected';
    const competitorStr = competitor || 'an unnamed competitor';

    const prompt = `You are an AI visibility strategist. Generate exactly 5 personalized fixes for this business.

MARKET CONTEXT: This business is in ${countryName}. The trust sources AI engines actually cite in this market are: ${countryConfig.trustSources.join(', ')}. Reference these local platforms by name. Do NOT recommend US-only platforms (Healthgrades, Yelp, BBB, Zocdoc) unless they appear in that list.

BUSINESS DETAILS:
- Business/query: "${businessInput}"
- Industry: ${ind}
- Location: ${loc}
- AI Platform Coverage: ${overallScore || 0}% (${mentionedCount || 0} of 12 platforms mentioning them)
- Trust Score: ${trustSignals?.overall ?? 'unknown'}/100
- Top competitor beating them: ${competitorStr}
- Current citation sources: ${citationStr}

TRUST SIGNAL GAPS (prioritise these):
${gapSummary || 'No specific gaps detected — use default priority order'}

REQUIRED FIX TYPES (in this order): ${orderedFixTypes.join(', ')}

Expected-impact ranges — the single source of truth for these fixes (the queue shows each range's midpoint):
${orderedFixTypes.map(ft => { const r = impactRangeForFix(ft); return `- ${ft}: +${r.min} to +${r.max} points`; }).join('\n')}

Generate exactly 5 fixes, one per fix type above, in that exact order.

Each fix MUST:
1. Mention the specific business type and location (e.g. "${ind} in ${loc}")
2. Use ONLY the expected-impact range given for its fix type below. Do NOT state any other impact numbers, scores, percentages, or statistics — an invented stat is worse than none.
3. Reference the actual gap from their trust signals where relevant
4. Be actionable and specific — not generic

Return a valid JSON array with exactly 5 objects. Each object must have these exact keys:
{
  "id": "<fix_type>",
  "title": "<concise title, max 60 chars>",
  "description": "<2 sentences, specific to this business and location, include a stat>",
  "confidence": <integer 80-96>,
  "effort": "<e.g. '20 min' or '1 hour' or '2 hours'>",
  "fix_type": "<one of: faq_schema | jsonld | directory | reviews | reddit>"
}

Return ONLY the JSON array. No markdown, no explanation, no code fences.`;

    // b0fj: an AI failure (network, non-OK, bad JSON, empty) falls back
    // to deterministic template fixes — the queue must not fail because
    // the AI service hiccupped.
    let fixes: any[] | null = null;
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1200,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await res.json();
      const raw = data.content?.[0]?.text?.trim() || '';
      // Strip any accidental markdown fences
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed) && parsed.length > 0) fixes = parsed;
      else console.error('[generate-fixes] AI returned no fixes — falling back to templates.');
    } catch (aiErr) {
      console.error('[generate-fixes] AI call failed — falling back to templates:', aiErr);
    }

    if (!fixes) {
      const templateFixes = buildTemplateFixes(orderedFixTypes, gaps);
      return persistAndRespond({ fixes: templateFixes, scanId, industry, location, resolvedCountry });
    }

    // Ensure each fix has all required fields and a status default
    const normalised = fixes.slice(0, 5).map((f: any) => ({
      id:               f.id || f.fix_type || 'fix',
      title:            f.title || FIX_TYPE_LABELS[f.fix_type] || 'Fix',
      description:      f.description || '',
      // ax81: impact comes from the metadata range's midpoint, never
      // from the model's guess (which contradicted the displayed range).
      predicted_impact: impactRangeForFix(f.fix_type).mid,
      confidence:       Number(f.confidence) || 85,
      effort:           f.effort || '1 hour',
      fix_type:         f.fix_type || 'faq_schema',
      status:           'pending',
    }));

    return persistAndRespond({ fixes: normalised, scanId, industry, location, resolvedCountry });

  } catch (error) {
    console.error('[generate-fixes] error:', error);
    return NextResponse.json({ error: 'Failed to generate fixes' }, { status: 500 });
  }
}
