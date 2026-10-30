import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { safeBusinessName } from '@/lib/fixIntelligence';
import { resolvePlanServer } from '@/lib/resolvePlanServer';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Platform =
  | 'linkedin' | 'reddit' | 'twitter' | 'gbp'
  | 'facebook' | 'instagram' | 'email' | 'gbp_qa' | 'blog';

const PLATFORMS: Platform[] = ['linkedin', 'reddit', 'twitter', 'gbp', 'facebook', 'instagram', 'email', 'gbp_qa', 'blog'];

interface ScanData {
  score: number | null;
  industry: string;
  city: string;
  businessName: string;
  competitorName: string;
  competitorScore: number | null;
  countryCode: string;
}

// ax6u: scanData comes from the client. Only a finite 0–100 number is a
// measured score; anything else is null and the prompt omits it (the old
// code wrote "score is undefined/100" or a competitor "scores 0/100").
function measuredScore(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100 ? Math.round(v) : null;
}

const TIPS: Record<Platform, string[]> = {
  linkedin: ['Best time to post: Tuesday–Thursday, 8–10am', 'Posts that end with a question get ~2× more comments', 'Make the first line a strong hook — it decides the read'],
  reddit: ['Read the subreddit rules before posting', 'Reply to comments to build trust and karma', 'Lead with value — never open with a link or pitch'],
  twitter: ['Best time to post: weekdays, 9am–12pm', 'A short thread often outperforms a single tweet', 'End with one clear, punchy takeaway'],
  gbp: ['Post at least weekly to stay active in Search/Maps', 'Add a photo — posts with images get ~2× engagement', 'Include a clear call-to-action button (Call / Book / Learn more)'],
  facebook: ['Post at 9am or 7pm for best reach', 'Ask a question to boost comments', 'Add a photo for 2x more engagement'],
  instagram: ['First line must stop the scroll', 'Post at 11am or 2pm weekdays', 'Stories get 15x more reach than posts'],
  email: ['Subject line determines 50% of opens', 'Send Tuesday-Thursday 9-11am', 'Keep under 200 words for best read rate'],
  gbp_qa: ['Q&A improves local AI recommendations', 'Answer within 24 hours', 'Use keywords naturally in answers'],
  blog: ['Post blogs weekly for AI visibility', 'Use FAQ schema on blog posts', 'Share on all social platforms after posting'],
};

function buildPrompt(platform: Platform, s: ScanData, entityType: 'business' | 'personal'): string {
  const biz = safeBusinessName(s.businessName);
  const ind = s.industry || 'local business';
  const city = s.city || 'their area';
  const low = s.score != null && s.score < 50;
  const high = s.score != null && s.score > 70;
  const scoreCtx = s.score != null ? ` Their AI visibility score is ${s.score}/100.` : '';
  const compCtx = s.competitorName && s.competitorScore != null ? ` A competitor (${s.competitorName}) scores ${s.competitorScore}/100.` : '';
  const personal = entityType === 'personal';

  switch (platform) {
    case 'linkedin':
      return `Write a ${personal ? 'first-person personal-brand thought-leadership' : 'professional thought-leadership'} LinkedIn post for a ${ind} ${personal ? 'professional' : 'business'} in ${city}.${scoreCtx}${low ? ' Focus on the challenge of being invisible on AI platforms like ChatGPT and Gemini.' : ''}${high ? ' Focus on the success and what worked.' : ''} Business/name: ${biz}.${compCtx} Conversational but professional, first person, 150–200 words. NO hashtags. Return only the post text.`;
    case 'reddit':
      return `Write an authentic Reddit post for a ${ind} ${personal ? 'professional' : 'business'} in ${city}. It must feel like a genuine community contribution, NOT an ad. Share real expertise about ${ind} in a way that naturally positions ${biz} as a trusted ${personal ? 'expert' : 'local expert'}. Suggest a subreddit like r/${city.replace(/[^a-z0-9]/gi, '')} or r/${ind.replace(/[^a-z0-9]/gi, '')}. 100–150 words, conversational, NO promotional language, NO links. Return only the post text.`;
    case 'twitter':
      return `Write a single tweet for a ${ind} ${personal ? 'professional' : 'business'} in ${city}.${scoreCtx}${low ? ' Take an educational angle about how AI platforms recommend local businesses.' : ''}${high ? ' Share a win or insight.' : ''} Max 280 characters, punchy and direct, NO hashtags. Return only the tweet text.`;
    case 'gbp':
      return `Write a Google Business Profile post update for a ${ind} business in ${city}. Under 1500 characters. Include what makes them stand out, a clear call to action, and mention their ${city} location. Professional but friendly. Business name: ${biz}. Return only the post text.`;
    case 'facebook':
      return `Write a Facebook post for a ${ind} business in ${city}.${scoreCtx} Tone: friendly, community-focused.${low ? ' Share a relatable challenge about being found online.' : ''}${high ? ' Share a success or tip with the community.' : ''} Business: ${biz}. 150-200 words. Conversational. Include a question to drive comments. No hashtags. Return only the post text.`;
    case 'instagram':
      return `Write an Instagram caption for a ${ind} business in ${city}. Tone: visual, aspirational, engaging. Business: ${biz}. Keep under 150 words. Start with a strong hook. End with a call to action. Include 5 relevant hashtags at the end (industry + location + business type). Return only the caption text.`;
    case 'email':
      return `Write a short email newsletter for a ${ind} business in ${city} to send to their customers.\n\nBusiness: ${biz}\n\nWrite this FROM ${biz} TO their existing customers.\n\nInclude:\n- A helpful tip about ${ind}\n- Warm personal greeting\n- Soft call to action to book or visit\n- Sign off from the business\n\nTone: warm, personal, friendly. NOT about AI or technology. 150-200 words.\n\nStart with:\nSubject: [subject line here]\n---\n[email body]`;
    case 'gbp_qa':
      return `Generate 5 question and answer pairs for the Google Business Profile Q&A section for a ${ind} business in ${city}. Business: ${biz}. Questions should be what real customers ask about ${ind} businesses. Answers should be helpful, specific, and naturally mention the business name and location. Format as:\nQ: [question]\nA: [answer]\nEach answer 2-3 sentences. Return only the Q&A pairs.`;
    case 'blog':
      return `Write a detailed blog post outline for a ${ind} business in ${city}.\n\nBusiness: ${biz}\n\nThis blog post is for ${biz}'s website to attract new customers and provide helpful information.\n\nCreate an outline about a topic that ${ind} customers in ${city} care about.\n\nGood topic examples for ${ind}:\n- Common questions customers have\n- Seasonal tips relevant to ${ind}\n- How to choose the right ${ind} professional\n- What to expect when visiting a ${ind} business\n- Top tips from a ${ind} expert\n\nFormat:\nTitle: [SEO-friendly title]\nMeta Description: [150 chars]\n---\nIntroduction: [2-3 sentence hook]\n\nSection 1: [heading]\n- Point 1\n- Point 2\n- Point 3\n\nSection 2: [heading]\n- Point 1\n- Point 2\n- Point 3\n\nSection 3: [heading]\n- Point 1\n- Point 2\n- Point 3\n\nSection 4: [heading]\n- Point 1\n- Point 2\n- Point 3\n\nSection 5: [heading]\n- Point 1\n- Point 2\n- Point 3\n\nConclusion: [2-3 sentences + CTA]\nSuggested tags: [5 relevant tags]`;
  }
}

// gbp_qa (5 Q&A pairs) and blog (full outline) need more room than a short post.
function maxTokensFor(platform: Platform): number {
  return platform === 'blog' || platform === 'gbp_qa' ? 1200 : 600;
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // b8ab: server-side plan gate. The page gates Free users behind an
  // upgrade prompt, but this route only checked auth — a Free account
  // could call the API directly and generate. Gate on the resolved plan
  // (admins resolve to 'enterprise', so admin access is preserved,
  // matching the page). Resolution failure falls back to free — the
  // codebase's failure shape (see /api/usage/summary).
  let gatePlan = 'free';
  try {
    const resolved = await resolvePlanServer(user.id);
    gatePlan = resolved.plan;
  } catch { /* free */ }
  if (gatePlan === 'free') {
    return NextResponse.json({ error: 'Social Content is available on paid plans.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const platform = body.platform as Platform;
  if (!PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: 'invalid platform' }, { status: 400 });
  }
  const rawScan = (body.scanData ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.slice(0, 200) : '');
  const scanData: ScanData = {
    score: measuredScore(rawScan.score),
    industry: str(rawScan.industry),
    city: str(rawScan.city),
    businessName: str(rawScan.businessName),
    competitorName: str(rawScan.competitorName),
    competitorScore: measuredScore(rawScan.competitorScore),
    countryCode: str(rawScan.countryCode) || 'US',
  };
  const entityType: 'business' | 'personal' = body.entityType === 'personal' ? 'personal' : 'business';

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokensFor(platform),
        messages: [{ role: 'user', content: buildPrompt(platform, scanData, entityType) }],
      }),
    });
    const data = await res.json();
    const content: string = (data.content?.[0]?.text ?? '').trim();
    if (!content) return NextResponse.json({ error: 'generation_failed' }, { status: 502 });

    return NextResponse.json({ content, characterCount: content.length, platform, tips: TIPS[platform] });
  } catch (err) {
    console.error('[social/generate] failed:', err);
    return NextResponse.json({ error: 'generation_failed' }, { status: 500 });
  }
}
