import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { resolvePlanServer } from '@/lib/resolvePlanServer';
import { getFixMetadata } from '@/lib/fixQuality';
import { knownImpactRangeForFix, buildBusinessImpact } from '@/lib/fixIntelligence';

export const dynamic = 'force-dynamic';

// Phase 4.1 Agency Client Mode: turn a technical fix into client-facing business
// language. NEVER exposes prompts, internal scoring, confidence formulas, or
// reasoning. The agency sees technical detail elsewhere; the CLIENT sees this.
const AGENCY_PLANS = ['agency', 'enterprise'];

export async function POST(req: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { plan, isAdmin } = await resolvePlanServer(user.id);
  if (!AGENCY_PLANS.includes(plan) && !isAdmin) {
    return NextResponse.json({ error: 'Agency plan required' }, { status: 403 });
  }

  const { fixType, businessName = '', industry = '', city = '' } = await req.json();
  if (!fixType) return NextResponse.json({ error: 'fixType required' }, { status: 400 });

  const meta = getFixMetadata(fixType);
  const range = knownImpactRangeForFix(fixType);

  // Derived (non-AI) fields — safe, deterministic, no internal scoring exposed.
  const derived = {
    businessImpact: buildBusinessImpact(fixType, industry),
    implementationOwner: (meta.difficulty === 'Hard') ? 'Agency (technical)' : 'Agency or client',
    estimatedEffort: (meta.timeToImplement as string) || '30–60 minutes',
    estimatedVisibilityImpact: range ? `Est. +${range.min}–${range.max} points of AI visibility` : 'Not estimated for this fix type',
  };

  // Client-facing copy via Haiku. Business language only.
  let explainToClient = `${meta.whatThisFixes || 'An improvement to how AI platforms understand your business'}. ${derived.businessImpact}`;
  let clientSummary = `We're improving how AI assistants recommend ${businessName || 'your business'}. Expected impact: ${derived.estimatedVisibilityImpact}.`;

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: `Write client-facing copy for a marketing agency explaining one AI-visibility improvement to their client. Business: ${businessName || 'the client'} (${industry || 'local business'}${city ? `, ${city}` : ''}). The improvement: ${meta.whatThisFixes || fixType}. Why it matters: ${meta.whyItMatters || 'it helps AI assistants recommend the business'}.

Return STRICT JSON only (no markdown): {"explainToClient": "...", "clientSummary": "..."}
Rules:
- Business language ONLY. No jargon, no technical schema talk, no scores, no percentages, no confidence figures.
- explainToClient: 2-3 plain sentences a non-technical business owner understands.
- clientSummary: 1 short sentence for a proposal line item.
- Never promise guaranteed results. Never invent specific numbers, customers, or statistics.`,
          }],
        }),
      });
      const data = await res.json();
      const text = data?.content?.[0]?.text ?? '';
      const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
      if (parsed.explainToClient) explainToClient = String(parsed.explainToClient);
      if (parsed.clientSummary) clientSummary = String(parsed.clientSummary);
    } catch { /* fall back to the derived copy above */ }
  }

  return NextResponse.json({ fixType, explainToClient, clientSummary, ...derived });
}
