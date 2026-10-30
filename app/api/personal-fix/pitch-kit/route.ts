import { NextRequest, NextResponse } from 'next/server';
import { guardAiRoute } from '@/lib/aiRouteGuard';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

async function callOpus(prompt: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

export async function POST(req: NextRequest) {
  // Spends paid AI/search credits — it was unauthenticated. Signed-in users only, metered per user in the shared DB limiter.
  const guard = await guardAiRoute(req, { bucket: 'ai:pitch-kit', userLimit: 20 });
  if (!guard.ok) return guard.response;
  const { name, specialty, city, credentials } = await req.json();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const sp  = specialty || 'professional';
  const loc = city || '';
  const cred = credentials || '';

  try {
    const prompt = `Generate 4 professional PR assets for ${name}, a ${sp}${loc ? ' in ' + loc : ''}${cred ? ' with credentials: ' + cred : ''}.

Return ONLY valid JSON with exactly this structure:
{
  "press_pitch": "...",
  "podcast_bio": "...",
  "wikipedia_draft": "...",
  "linkedin_about": "..."
}

Guidelines for each field:

press_pitch (150 words): HARO-style expert source pitch. Written to journalists. Includes: who they are, their specialty, why they are an authority, specific angles they can comment on, availability for quotes, contact placeholder. Start with the hook — what makes them uniquely quotable. End with: "Available for immediate comment: [email placeholder]"

podcast_bio (150 words): Written for podcast hosts to read as an introduction. Third person. Includes: their specialty and city, their unique angle/expertise, 3 specific talking points they can cover on air, one compelling story hook, why their audience needs to hear this. End with their website placeholder.

wikipedia_draft (400 words): Full Wikipedia-eligible stub in Wikipedia markup format. Include: opening paragraph establishing notability, ==Early life and education== section with [University placeholder], ==Career== section with specific career milestones appropriate for a ${sp}, ==Notable work== section, ==References== section with 3 formatted citation placeholders. Use neutral encyclopedic tone. Include [[wikilinks]] for relevant terms.

linkedin_about (300 words): First person LinkedIn About section optimized for AI citation. Keyword-rich, includes: specialty, city, credentials, patient/client outcomes focus, 3 specific expertise areas. Should contain exact phrases AI would cite (e.g. "leading ${sp} in ${loc}", "specializing in [specific focus]"). End with clear CTA. Do NOT use em-dashes.`;

    const raw = await callOpus(prompt);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    const parsed = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      press_pitch:      parsed.press_pitch || '',
      podcast_bio:      parsed.podcast_bio || '',
      wikipedia_draft:  parsed.wikipedia_draft || '',
      linkedin_about:   parsed.linkedin_about || '',
    });
  } catch (err) {
    console.error('pitch-kit error:', err);
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
  }
}
