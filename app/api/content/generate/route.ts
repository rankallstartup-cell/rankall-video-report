import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { resolvePlanServer } from '@/lib/resolvePlanServer';
import { isBusinessPlan } from '@/lib/planConfig';

export const dynamic = 'force-dynamic';

// Generates educational TikTok / social content for a content_type via Haiku.
// HARD RULES enforced in the prompt:
//   - Educational only. No fabricated metrics, no invented customers/clients.
//   - case_study uses ANONYMIZED data + an explicit disclaimer; never "my client".
//   - Never claim guaranteed results or specific revenue numbers.
function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

type ContentType =
  | 'live_scan'
  | 'competitor_reveal'
  | 'ai_education'
  | 'fix_breakdown'
  | 'case_study'
  | 'founder_story';

const TYPE_BRIEF: Record<ContentType, string> = {
  live_scan:
    'A real, live AI-visibility scan of a business on camera. Walk through running the scan and reading the score honestly — show whatever the score actually is, good or bad. No staged or fake results.',
  competitor_reveal:
    'Show how AI platforms (ChatGPT, Gemini, Perplexity, etc.) recommend one local business over another, and explain WHY. Educational framing about how AI ranking works — never disparage a named real business.',
  ai_education:
    'Pure education: teach how AI search / AI visibility works, why it matters for local businesses, and one concrete thing the viewer can do. No selling, just value.',
  fix_breakdown:
    'Break down ONE specific fix (e.g. schema markup, Google Business Profile, reviews) that improves AI visibility. Show the before/after concept and the steps. Practical and honest about effort.',
  case_study:
    'An ANONYMIZED, generalized example of an improvement pattern. CRITICAL: do NOT invent a specific customer, do NOT use a real name, do NOT claim specific revenue. Use ranges/illustrative language and an on-screen disclaimer that it is an illustrative example.',
  founder_story:
    'A first-person founder story about why Rankall was built and the problem of AI visibility for local businesses. Authentic, no exaggerated claims, no fake traction numbers.',
};

const VALID_TYPES = Object.keys(TYPE_BRIEF) as ContentType[];

function fallback(contentType: ContentType, ctx: { businessName: string; score: number | null }) {
  const subject = ctx.businessName || 'a local business';
  const scoreLine = ctx.score != null ? `${ctx.score}/100` : 'their AI visibility score';
  const base = {
    live_scan: {
      hook: `I scanned ${subject} live — here's what AI really thinks of them.`,
      script: `Open with the live scan running. Read the actual score (${scoreLine}) out loud — honestly, whatever it is. Explain that this is the score across 12 AI platforms like ChatGPT, Gemini and Perplexity. Walk through one platform where they show up and one where they don't. End by explaining what the score means for getting found.`,
      cta: 'Want your own free AI visibility scan? Link in bio.',
    },
    competitor_reveal: {
      hook: `Why does AI recommend one business over another? Let me show you.`,
      script: `Show two example businesses in the same category. Ask ChatGPT to recommend one. Explain the real signals AI uses — structured data, reviews, consistency, authority. Keep it educational; never trash a named real business.`,
      cta: 'Curious where you stand? Run a free scan — link in bio.',
    },
    ai_education: {
      hook: `AI is the new search engine — and most local businesses are invisible on it.`,
      script: `Teach how AI assistants pull recommendations. Explain that being on page 1 of Google is not the same as being recommended by ChatGPT. Give ONE concrete action: make sure your business info is consistent everywhere. No selling.`,
      cta: 'Learn your AI visibility score free — link in bio.',
    },
    fix_breakdown: {
      hook: `One free fix that makes AI actually recommend your business.`,
      script: `Pick one fix (e.g. schema markup or a complete Google Business Profile). Show the before/after concept. Walk through the exact steps. Be honest that it takes ~20 minutes and isn't magic — it compounds.`,
      cta: 'See your top fixes free — link in bio.',
    },
    case_study: {
      hook: `Here's the pattern I see again and again with local businesses and AI.`,
      script: `ILLUSTRATIVE EXAMPLE — on-screen disclaimer required. Describe a generalized, anonymized pattern: a business starts with a low score, fixes a few fundamentals, and improves over time. Use ranges and "in examples like this" language. Never name a real customer or promise a specific number.`,
      cta: 'Want to see your own starting point? Free scan — link in bio.',
    },
    founder_story: {
      hook: `I built Rankall because local businesses are going invisible — here's why.`,
      script: `First person. Explain the problem: people now ask AI for recommendations, and most local businesses have no idea if they're showing up. Share the honest motivation for building a tool to measure and fix it. No fake traction numbers.`,
      cta: 'Check your AI visibility free — link in bio.',
    },
  }[contentType];

  const disclaimer = contentType === 'case_study' ? '\n\nON-SCREEN: "Illustrative example — not a specific customer."' : '';
  return {
    hook: base.hook,
    script: base.script + disclaimer,
    captions: `${base.hook} ${base.cta}`,
    shot_list: '1) Hook to camera (0-3s)\n2) Screen recording of the scan / point being made\n3) Talking-head explanation\n4) CTA to camera',
    cta: base.cta,
    hashtags: ['#AIvisibility', '#localbusiness', '#smallbusinessmarketing', '#ChatGPT', '#AIsearch', '#rankall'],
  };
}

export async function POST(req: NextRequest) {
  try {
    // b01t: the old code took userId from the request body with only a
    // presence check (`if (!userId) return 401`) — anyone could generate
    // (Anthropic cost) into another user's content library. Derive the
    // owner from the caller's real session; a body userId is ignored.
    const sessionSupabase = await createServerSupabaseClient();
    const { data: { user } } = await sessionSupabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const userId = user.id;

    // b89q: server-side plan gate — the page paywall was the only
    // gate, so a signed-in Free account could generate (Anthropic
    // cost) by calling this route directly. Same rule as the page:
    // Business plan and above; admins pass.
    const { plan, isAdmin } = await resolvePlanServer(userId);
    if (!isAdmin && !isBusinessPlan(plan)) {
      return NextResponse.json({ error: 'upgrade_required' }, { status: 403 });
    }
    const body = await req.json();
    const {
      contentType,
      businessName = '',
      industry = '',
      city = '',
      score = null,
      scanId = null,
      platform = 'tiktok',
    } = body;

    if (!VALID_TYPES.includes(contentType)) {
      return NextResponse.json({ error: 'invalid contentType', valid: VALID_TYPES }, { status: 400 });
    }
    const ct = contentType as ContentType;

    let content = fallback(ct, { businessName, score });

    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1200,
            messages: [{
              role: 'user',
              content: `You are a short-form video scriptwriter for Rankall, a tool that measures local businesses' AI visibility across 12 AI platforms (ChatGPT, Gemini, Google AI, Copilot, Perplexity, Grok, Claude, DeepSeek, Mistral, Kimi, Groq, Meta AI).

Write a ${platform} video for this content type: ${ct}.
Brief: ${TYPE_BRIEF[ct]}

Context (use only what's real; leave out anything blank):
- Business: ${businessName || 'n/a'}
- Industry: ${industry || 'n/a'}
- City: ${city || 'n/a'}
- AI visibility score: ${score != null ? `${score}/100` : 'n/a'}

ABSOLUTE RULES (a violation makes the output unusable):
1. EDUCATIONAL ONLY. Never invent statistics, revenue figures, or "results".
2. NEVER invent a customer or client. Never say "my client" or name a fake business.
3. For case_study: it MUST be an anonymized, illustrative pattern with an explicit on-screen disclaimer that it is an illustrative example, using ranges not exact promised numbers.
4. Never guarantee outcomes. Never disparage a named real business.
5. Honest, value-first tone. The score, if given, is real — present it as-is.

Return STRICT JSON only (no markdown fences), with keys:
{"hook": "...", "script": "...", "captions": "...", "shot_list": "...", "cta": "...", "hashtags": ["#...", "#..."]}

- hook: 1 line, first 3 seconds, scroll-stopping but honest.
- script: the spoken script, short punchy sentences, with timing cues.
- captions: the on-screen / posting caption text.
- shot_list: numbered shots / b-roll suggestions.
- cta: one clear call to action (free scan, link in bio).
- hashtags: 5-8 relevant hashtags as an array of strings each starting with #.`,
            }],
          }),
        });
        const data = await res.json();
        const text = data?.content?.[0]?.text ?? '';
        const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
        if (parsed.hook && parsed.script) {
          content = {
            hook: String(parsed.hook),
            script: String(parsed.script),
            captions: String(parsed.captions || ''),
            shot_list: String(parsed.shot_list || ''),
            cta: String(parsed.cta || ''),
            hashtags: Array.isArray(parsed.hashtags)
              ? parsed.hashtags.map((h: unknown) => String(h)).slice(0, 8)
              : content.hashtags,
          };
        }
      } catch { /* fall back to templated content */ }
    }

    // Persist as a draft (best-effort).
    let id: string | null = null;
    try {
      const { data: inserted } = await admin()
        .from('content_pieces')
        .insert({
          user_id: userId,
          content_type: ct,
          format: platform === 'tiktok' ? 'tiktok_vertical' : platform,
          platform,
          hook: content.hook,
          script: content.script,
          captions: content.captions,
          shot_list: content.shot_list,
          cta: content.cta,
          hashtags: content.hashtags,
          scan_id: scanId,
          status: 'draft',
        })
        .select('id')
        .single();
      id = (inserted as { id: string } | null)?.id ?? null;
    } catch { /* table may be new */ }

    return NextResponse.json({ id, contentType: ct, ...content });
  } catch (err) {
    return NextResponse.json({ error: 'generation_failed', message: String(err) }, { status: 500 });
  }
}
