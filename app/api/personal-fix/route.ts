import { NextRequest, NextResponse } from 'next/server';
import { guardAiRoute } from '@/lib/aiRouteGuard';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const FIX_TYPES = ['wikipedia_stub', 'knowledge_panel', 'profile_optimization', 'press_pitch', 'podcast_pitch', 'thought_leadership'] as const;
type FixType = typeof FIX_TYPES[number];

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
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

export async function POST(req: NextRequest) {
  // Spends paid AI/search credits — it was unauthenticated. Signed-in users only, metered per user in the shared DB limiter.
  const guard = await guardAiRoute(req, { bucket: 'ai:personal-fix', userLimit: 40 });
  if (!guard.ok) return guard.response;
  const { fix_type, name, specialty, location } = await req.json();

  if (!fix_type || !FIX_TYPES.includes(fix_type)) {
    return NextResponse.json({ error: 'Invalid fix_type' }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const sp = specialty || 'professional';
  const loc = location || '';
  let generated_content = '';
  let instructions = '';
  let expected_impact = '';

  try {
    if (fix_type === 'wikipedia_stub') {
      generated_content = await callOpus(
        `Draft a Wikipedia-eligible stub article for ${name}, a ${sp}${loc ? ' based in ' + loc : ''}.

Write it in neutral, encyclopedic Wikipedia style. Include:
- Opening paragraph: who they are, their field, and why they may be notable
- Professional background section with likely career milestones for a ${sp}
- Notable work or contributions section
- References section placeholder

Keep under 400 words. Use Wikipedia article formatting conventions.
Do not invent specific facts — use placeholder brackets like [Year] or [Institution Name] where specific facts would go.`
      );
      instructions = `1. Create a Wikipedia account if you don't have one.
2. Search Wikipedia for your name to confirm no article exists.
3. Go to Wikipedia:Your first article and follow the wizard.
4. For ${sp} notability, you need: significant coverage in reliable sources, or recognition in your field. Gather 3–5 reliable third-party sources (news articles, journal citations, institutional pages) before submitting.
5. Paste the draft above and replace all [brackets] with real information.
6. Submit for review — new articles are reviewed within 1–4 weeks.`;
      expected_impact = 'Wikipedia presence is one of the highest-weight authority signals for AI platforms. ChatGPT and Perplexity heavily cite Wikipedia. Expected score improvement: +8 to +15 points.';
    }

    else if (fix_type === 'knowledge_panel') {
      generated_content = await callOpus(
        `Write a step-by-step guide for ${name}, a ${sp}, to claim or create their Google Knowledge Panel.

Include verification methods specific to ${sp} professionals.
Cover: Google Search Console verification, Google My Business (if applicable), Schema.org markup for a person, and the entity authority building timeline.
Be specific about what fields matter most for AI citability (description, sameAs links, image).
300 words max.`
      );
      instructions = `1. Search your name on Google and check if a Knowledge Panel exists.
2. If it exists: click "Claim this Knowledge Panel" and verify via one of your linked profiles.
3. If it doesn't exist: build entity authority first — ensure your LinkedIn, website, and any professional profiles all consistently use your exact name.
4. Add Person schema markup to your website (see schema.org/Person).
5. Request Knowledge Panel via Google's feedback form once entity signals are strong.
6. Add sameAs links in your schema pointing to Wikipedia, LinkedIn, and professional directories.`;
      expected_impact = 'Google Knowledge Panel directly feeds AI platforms. Claude, Perplexity, and Google AI pull from Knowledge Graph. Expected score improvement: +10 to +18 points.';
    }

    else if (fix_type === 'profile_optimization') {
      generated_content = await callOpus(
        `Write an optimized professional bio for ${name}, a ${sp}${loc ? ' in ' + loc : ''}, for their online profiles.

Generate three versions:
1. LinkedIn "About" section (300 words) — written in first person, includes specialty keywords AI platforms search for
2. Directory bio (150 words) — third person, designed for Healthgrades/Avvo/LinkedIn short bio fields, keyword-rich
3. Website "About Me" paragraph (100 words) — schema-friendly, includes name, specialty, location, and credentials

For each version, bold the key phrases that AI platforms are most likely to cite.`
      );
      instructions = `1. Update your LinkedIn "About" section with Version 1 above.
2. Log into your professional directory profile (${sp === 'lawyer' || sp === 'attorney' ? 'Avvo, Martindale' : sp.includes('doctor') || sp.includes('therapist') ? 'Healthgrades, Zocdoc' : 'LinkedIn, Google Business'}) and update the bio field with Version 2.
3. Update your website About page with Version 3, and add Person schema markup around it.
4. Use identical name format (e.g., "Dr. Jane Smith" not "Jane Smith MD") across all profiles for entity consistency.`;
      expected_impact = 'Consistent, keyword-rich profiles are how AI platforms identify authority. Expected score improvement: +6 to +12 points.';
    }

    else if (fix_type === 'press_pitch') {
      generated_content = await callOpus(
        `Write personalized pitch emails to 3 relevant publications for ${name}, a ${sp}${loc ? ' in ' + loc : ''}.

For each pitch:
- Target a specific publication relevant to their specialty
- Propose a specific article angle (not generic — something AI would cite for their specialty)
- Include subject line, opening, pitch body, and sign-off
- Keep each pitch under 200 words

Publications to target:
1. A trade publication for ${sp} professionals
2. A regional news outlet${loc ? ' in ' + loc : ''}
3. A consumer publication that covers ${sp}-related topics

Make the pitches feel personal and specific. Include placeholder [Your Credentials] and [Specific Story Angle] where needed.`
      );
      instructions = `1. Find the editor's email at each publication (look for "Editorial" or "Tips" on their contact page).
2. Send individually — never send a mass pitch.
3. Follow up once after 2 weeks if no response.
4. A published article with your byline and name creates a high-authority citation AI platforms can pick up — timing depends on each platform's refresh cycle; Rankall verifies with a rescan after you mark the fix applied (7 days by default).`;
      expected_impact = 'Press mentions in established publications are among the strongest AI authority signals. One published article can move your score by +8 to +20 points.';
    }

    else if (fix_type === 'podcast_pitch') {
      generated_content = await callOpus(
        `Write podcast guest pitch emails for ${name}, a ${sp}${loc ? ' in ' + loc : ''}.

Identify 3 relevant podcasts for a ${sp} guest and write a pitch for each:
- Podcast 1: Industry/specialty podcast
- Podcast 2: Business or entrepreneur podcast
- Podcast 3: Consumer-facing podcast for their specialty's clients

Each pitch should include:
- Subject line
- One-sentence hook
- Why they're a valuable guest (specific expertise angle)
- 3 topic ideas they could cover
- Brief bio line
Keep each pitch under 150 words.`
      );
      instructions = `1. Search "[your specialty] podcast" on Spotify or Apple Podcasts to find relevant shows.
2. Find the host's contact on their website or Twitter/X.
3. Podcast appearances create audio transcripts and show notes that are indexed — AI platforms like Perplexity cite podcast content.
4. Ask the host to include your full name and title in the episode description and show notes.
5. Share the episode on LinkedIn when it publishes to amplify the authority signal.`;
      expected_impact = 'Podcast appearances create crawlable, citable content. 3+ episodes can increase AI citation rate significantly. Expected score improvement: +5 to +10 points.';
    }

    else if (fix_type === 'thought_leadership') {
      generated_content = await callOpus(
        `Write the first LinkedIn article for ${name}, a ${sp}${loc ? ' in ' + loc : ''}.

Choose a topic that:
- AI platforms currently cite heavily in the ${sp} space
- Demonstrates genuine expertise
- Will be useful to clients or peers searching for ${sp} information

Write the full article:
- Headline: compelling, keyword-rich
- Introduction: hook + why this matters
- 3–4 main points with practical insights
- Conclusion with call to action
- Target 600–800 words
- Write in first person, authoritative but accessible

This article will be published directly to LinkedIn.`
      );
      instructions = `1. Go to LinkedIn → Write an article → Paste this content.
2. Add a professional header image (Canva works well).
3. Publish and share the article as a post, tagging relevant peers or publications.
4. LinkedIn articles are indexed by Google and cited by AI platforms. The article must include your full name, specialty, and location in the text for entity association.
5. Aim to publish one article per month for sustained authority building.`;
      expected_impact = 'LinkedIn articles are crawled by multiple AI platforms. One strong article can become an authority citation — when AI reflects it depends on the refresh cycle of each platform. Expected score improvement: +4 to +8 points.';
    }

    return NextResponse.json({
      fix_type,
      generated_content,
      instructions,
      expected_impact,
    });
  } catch (err) {
    console.error('personal-fix error:', err);
    return NextResponse.json({ error: 'Fix generation failed' }, { status: 500 });
  }
}
