import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { isAdminUser } from '@/lib/planConfig';
import { ACTIVE_PLATFORMS } from '@/lib/platforms';

interface TalkingPoint {
  point: string;
  whyItMatters: string;
  whatToSay: string;
}

/**
 * POST /api/demo-prep/talking-points
 *
 * Demo Prep talking points, generated server-side. The Anthropic key lives
 * ONLY in the server env (ANTHROPIC_API_KEY) — it must never be bundled to
 * the client (the old code called api.anthropic.com directly from the
 * browser with NEXT_PUBLIC_ANTHROPIC_API_KEY, exposing the key to anyone
 * who opened DevTools). Admin-only: Demo Prep itself is an admin tool.
 *
 * Competitor line (ax8p): mention-share is the measured quantity — a
 * competitor score is never claimed ("competitor score not measured").
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!isAdminUser(user.email)) {
      return NextResponse.json({ error: 'Forbidden — admins only' }, { status: 403 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Talking-points generation is not configured (ANTHROPIC_API_KEY missing).' },
        { status: 503 },
      );
    }

    const body = await req.json();
    const businessName = typeof body.businessName === 'string' ? body.businessName : '';
    if (!businessName) {
      return NextResponse.json({ error: 'businessName is required' }, { status: 400 });
    }
    const city = typeof body.city === 'string' ? body.city : '';
    const industry = typeof body.industry === 'string' ? body.industry : 'local business';
    const score = typeof body.score === 'number' ? body.score : 0;
    const competitor = typeof body.competitor === 'string' ? body.competitor : null;
    const competitorMentions = typeof body.competitorMentions === 'number' ? body.competitorMentions : null;
    const topFixes = Array.isArray(body.topFixes) ? body.topFixes.filter((f: unknown) => typeof f === 'string') : [];
    const mentioned = Array.isArray(body.mentionedPlatforms) ? body.mentionedPlatforms.filter((p: unknown) => typeof p === 'string') : [];
    const notMentioned = Array.isArray(body.notMentionedPlatforms) ? body.notMentionedPlatforms.filter((p: unknown) => typeof p === 'string') : [];

    const prompt = `You are preparing Nandish for a 30-minute demo call with ${businessName}${city ? ` in ${city}` : ''}.

Scan data:
- Business: ${businessName}
- Industry: ${industry}
- City: ${city}
- AI Visibility Score: ${score}/100
- Top competitor: ${competitor ?? 'none detected'}${competitorMentions !== null ? ` (mentioned on ${competitorMentions}/${ACTIVE_PLATFORMS.length} platforms; competitor score not measured)` : ' (competitor score not measured)'}
- Top fixes: ${topFixes.join(', ') || 'see full report'}
- Platforms mentioning them: ${mentioned.join(', ') || 'none'}
- Platforms NOT mentioning them: ${notMentioned.join(', ') || 'none'}

Generate 5 specific talking points for the demo call. Each point should reference real numbers from the scan.

Format your response as JSON array:
[
  {
    "point": "Short punchy point (max 15 words)",
    "whyItMatters": "One sentence on business impact",
    "whatToSay": "2-3 sentences of exact language to use in the call"
  }
]

Only output the JSON array. No preamble.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      console.error('Demo Prep talking-points API error:', await res.text());
      return NextResponse.json(
        { error: 'Talking-points generation failed. Please try again.' },
        { status: 502 },
      );
    }
    const data = await res.json();
    const text: string = data.content?.[0]?.text ?? '[]';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: 'Talking-points generation returned an unexpected format. Please try again.' },
        { status: 502 },
      );
    }
    let talkingPoints: TalkingPoint[];
    try {
      talkingPoints = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json(
        { error: 'Talking-points generation returned an unexpected format. Please try again.' },
        { status: 502 },
      );
    }
    if (!Array.isArray(talkingPoints)) {
      return NextResponse.json(
        { error: 'Talking-points generation returned an unexpected format. Please try again.' },
        { status: 502 },
      );
    }
    return NextResponse.json({ talkingPoints });
  } catch (e) {
    console.error('Demo Prep talking-points route error:', e);
    return NextResponse.json(
      { error: 'Talking-points generation failed. Please try again.' },
      { status: 500 },
    );
  }
}

