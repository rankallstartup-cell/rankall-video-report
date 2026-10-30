import { NextRequest, NextResponse } from 'next/server';
import { enforceTrialCap } from '@/lib/trialCaps';

export const dynamic = 'force-dynamic';

// Phase 19: 3-bullet executive summary for the report. Haiku-generated, with a
// deterministic template fallback so it NEVER errors (missing key / API failure).
interface Body {
  businessName?: string;
  score?: number;
  competitorName?: string;
  competitorScore?: number | null;
  mentionedCount?: number;
  industry?: string;
  city?: string;
  countryCode?: string;
  topFix?: string;
  revenueGap?: number;
  revenueSymbol?: string;
}

function templateSummary(b: Body): string[] {
  const biz = b.businessName || 'Your business';
  const ind = b.industry || 'your industry';
  const city = b.city || 'your area';
  const sym = b.revenueSymbol || '$';
  const gap = (b.revenueGap ?? 0).toLocaleString();
  const comp = b.competitorName;
  // b029: with a named competitor but no measured score, say so —
  // never render an invented "scores 0" or an estimated comparison.
  const b1 = comp
    ? b.competitorScore != null
      ? `${biz} scores ${b.score ?? 0}/100 for AI visibility while ${comp} scores ${b.competitorScore}/100, so AI assistants are recommending them ahead of you.`
      : `${biz} scores ${b.score ?? 0}/100 for AI visibility. ${comp} is the top competitor in this market — their score was not measured.`
    : `${biz} appears on ${b.mentionedCount ?? 0} of 12 AI platforms, which is below what it takes to be recommended consistently for ${ind} in ${city}.`;
  const b2 = `This gap is costing an estimated ${sym}${gap} a month in customers who ask AI for a ${ind} and are sent elsewhere.`;
  const b3 = `The single most important next step is to ${b.topFix ? `apply "${b.topFix}"` : 'apply your top recommended fix'} — it is the fastest way to start winning those recommendations back.`;
  return [b1, b2, b3];
}

export async function POST(req: NextRequest) {
  let body: Body = {};
  try { body = await req.json(); } catch { /* use empty */ }

  const fallback = templateSummary(body);
  // Trial cap: over the cap a trialing user gets the template (no AI cost).
  if (await enforceTrialCap(req, 'executive_summary')) {
    return NextResponse.json({ bullets: fallback, source: 'template', trialCapped: true });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ bullets: fallback, source: 'template' });
  }

  try {
    const prompt = `You are a senior business consultant writing an executive summary for a local business owner.

Business: ${body.businessName || 'the business'} in ${body.city || 'their city'}
Industry: ${body.industry || 'local business'}
AI Visibility Score: ${body.score ?? 0}/100
Competitor: ${body.competitorName ? `${body.competitorName}${body.competitorScore != null ? ` at ${body.competitorScore}/100` : ' (score not measured — do not estimate, infer, or compare against a competitor score)'}` : 'none detected'}
Appears on: ${body.mentionedCount ?? 0} of 12 AI platforms
Revenue impact: ${body.revenueSymbol || '$'}${(body.revenueGap ?? 0).toLocaleString()}/month
Top fix available: ${body.topFix || 'their highest-impact fix'}

Write exactly 3 bullet points. Each bullet is ONE sentence. Use plain English a business owner understands. No technical jargon. No markdown. No asterisks. No bullet symbols — just the text. Use the exact revenue figure given above — do not round it (no 'over $6,000' for $6,109).

Bullet 1: Current situation${body.competitorScore != null ? ' (where they stand vs competitor)' : ' (their own standing — no competitor score was measured, so do not compare against a competitor)'}
Bullet 2: The cost of this gap (revenue/opportunity in plain terms)
Bullet 3: The single most important action they should take right now

Return ONLY the 3 sentences, separated by newlines. Nothing else.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await res.json();
    const text: string = data?.content?.[0]?.text ?? '';
    const bullets = text
      .split('\n')
      .map(l => l.replace(/^[\s•\-*]+/, '').trim())
      .filter(l => l.length > 0)
      .slice(0, 3);
    if (bullets.length === 3) {
      return NextResponse.json({ bullets, source: 'ai' });
    }
    return NextResponse.json({ bullets: fallback, source: 'template' });
  } catch {
    return NextResponse.json({ bullets: fallback, source: 'template' });
  }
}
