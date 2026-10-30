import { NextRequest, NextResponse } from 'next/server';
import { guardAiRoute } from '@/lib/aiRouteGuard';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export interface PeerProfile {
  rank: number;
  name: string;
  score: number;
  advantages: string[];
  platform_wins: string[];
  is_user: boolean;
}

export async function POST(req: NextRequest) {
  // Spends paid AI/search credits — it was unauthenticated. Signed-in users only, metered per user in the shared DB limiter.
  const guard = await guardAiRoute(req, { bucket: 'ai:personal-peer', userLimit: 20 });
  if (!guard.ok) return guard.response;
  const { name, specialty, location, user_score, present_signals, missing_signals } = await req.json();
  if (!name || !specialty) return NextResponse.json({ error: 'name and specialty required' }, { status: 400 });

  const loc = location || '';
  const score = user_score ?? 0;
  const present = present_signals?.join(', ') || 'none detected';
  const missing = missing_signals?.join(', ') || 'none detected';

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: `Based on this personal scan for ${name}, a ${specialty}${loc ? ' in ' + loc : ''} with AI score ${score}/100:
- Authority signals present: ${present}
- Authority signals missing: ${missing}

Generate 2 fictional but realistic peer ${specialty} professionals in ${loc || 'the same city'} who rank higher in AI visibility. These should feel authentic.

Return ONLY valid JSON:
{
  "peers": [
    {
      "rank": 1,
      "name": "Dr. [FirstName] [LastName]",
      "score": [integer 65-90],
      "advantages": ["advantage 1", "advantage 2", "advantage 3"],
      "platform_wins": ["ChatGPT", "Perplexity"]
    },
    {
      "rank": 2,
      "name": "Dr. [FirstName] [LastName]",
      "score": [integer 55-75],
      "advantages": ["advantage 1", "advantage 2"],
      "platform_wins": ["Gemini", "Grok"]
    }
  ],
  "user_gaps": ["gap 1", "gap 2", "gap 3"]
}

Advantages should be specific: e.g. "Wikipedia page with 47 citations", "Google Knowledge Panel verified", "Featured in Chicago Tribune", "42 podcast appearances", "Zocdoc profile with 200+ reviews", "PubMed: 8 published papers".
Platform wins: pick 2-3 platforms from: ChatGPT, Gemini, Perplexity, Grok, Claude, Copilot.
User gaps: the 3 most impactful missing signals for ${name} compared to these peers.`,
        }],
      }),
    });

    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON');
    const parsed = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      peers: parsed.peers || [],
      user_gaps: parsed.user_gaps || [],
    });
  } catch (err) {
    console.error('personal-peer error:', err);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}
