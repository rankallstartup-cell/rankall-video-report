import { NextRequest, NextResponse } from 'next/server';
import { guardAiRoute } from '@/lib/aiRouteGuard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export interface LinkedInResult {
  found: boolean;
  profile_url: string | null;
  completeness_score: number;
  current_headline: string;
  current_about: string;
  optimized_headline: string;
  optimized_about: string;
  missing_elements: string[];
}

export async function POST(req: NextRequest) {
  // Spends paid AI/search credits — it was unauthenticated. Signed-in users (metered per user); anonymous only for the homepage
  // identity-confirm lookup, metered per trusted IP.
  const guard = await guardAiRoute(req, { bucket: 'ai:personal-linkedin', userLimit: 20, anonIpLimit: 5 });
  if (!guard.ok) return guard.response;
  try {
    const { name, specialty, city, linkedinUrl } = await req.json();
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

    const serpKey = process.env.SERPAPI_KEY;
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    let profileUrl: string | null = linkedinUrl || null;
    let profileMarkdown = '';

    // Step 1: scrape or find profile
    if (profileUrl && firecrawlKey) {
      try {
        const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${firecrawlKey}` },
          body: JSON.stringify({ url: profileUrl, formats: ['markdown'], timeout: 15000 }),
          signal: AbortSignal.timeout(18000),
        });
        const data = await res.json();
        if (data.success && data.data?.markdown) {
          profileMarkdown = data.data.markdown;
        }
      } catch { /* scrape failed */ }
    } else if (!profileUrl && serpKey) {
      try {
        const q = `site:linkedin.com/in "${name}" ${specialty}`;
        const params = new URLSearchParams({ q, api_key: serpKey, num: '3' });
        const res = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(8000) });
        const data = await res.json();
        const first = (data.organic_results || []).find((r: { link?: string }) => r.link?.includes('linkedin.com/in'));
        if (first?.link) {
          profileUrl = first.link;
          // Try to scrape it
          if (firecrawlKey) {
            try {
              const fcRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${firecrawlKey}` },
                body: JSON.stringify({ url: profileUrl, formats: ['markdown'], timeout: 15000 }),
                signal: AbortSignal.timeout(18000),
              });
              const fcData = await fcRes.json();
              if (fcData.success && fcData.data?.markdown) {
                profileMarkdown = fcData.data.markdown;
              }
            } catch { /* scrape failed */ }
          }
        }
      } catch { /* serp failed */ }
    }

    // Step 2: Parse sections from markdown
    const md = profileMarkdown.toLowerCase();
    const headline = extractSection(profileMarkdown, ['headline', '# ']) || '';
    const about = extractSection(profileMarkdown, ['about', 'summary']) || '';
    const hasExperience = md.includes('experience') && md.includes('at ');
    const hasEducation = md.includes('education') || md.includes('university') || md.includes('college');
    const hasSkills = md.includes('skills') || md.includes('expertise');
    const wordCount = about.trim().split(/\s+/).filter(Boolean).length;
    const specialtyInHeadline = headline.toLowerCase().includes(specialty.toLowerCase());
    const cityInHeadline = city ? headline.toLowerCase().includes(city.toLowerCase()) : false;
    const multipleSecions = (md.includes('experience') ? 1 : 0) + (md.includes('education') ? 1 : 0) + (md.includes('skills') ? 1 : 0) >= 2;
    const hasActivity = md.includes('post') || md.includes('comment') || md.includes('published');

    // Step 3: Score
    let score = 0;
    const missing: string[] = [];

    if (specialtyInHeadline && cityInHeadline) score += 20;
    else missing.push('Headline should include specialty + city');

    if (wordCount >= 200) score += 15;
    else missing.push('About section needs 200+ words');

    if (hasExperience) score += 15;
    else missing.push('Add experience section with employer details');

    if (hasEducation) score += 15;
    else missing.push('Add education section');

    if (hasSkills) score += 10;
    else missing.push('Add skills section with relevant keywords');

    if (multipleSecions) score += 10;
    else missing.push('Complete more profile sections');

    if (hasActivity) score += 15;
    else missing.push('Post recent activity to show engagement');

    if (!profileMarkdown) {
      score = 0;
      missing.length = 0;
      missing.push('LinkedIn profile not found or not scrapable');
    }

    // Step 4: Haiku rewrite
    let optimizedHeadline = '';
    let optimizedAbout = '';

    if (anthropicKey) {
      try {
        const prompt = `You are an AI citation optimization expert. Rewrite this LinkedIn profile for ${name}, a ${specialty}${city ? ` in ${city}` : ''}. Make it authoritative and keyword-rich so ChatGPT, Gemini and Perplexity cite them when asked about top ${specialty} professionals.\n\nCurrent headline: ${headline || 'none found'}\nCurrent about: ${about || 'none found'}\n\nReturn JSON only: {"optimized_headline": "...", "optimized_about": "..."}\n\nOptimized headline: max 120 chars, includes specialty + city + key credential. About: 300 words, first-person, keyword-rich, mentions specific outcomes.`;

        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 800,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        const data = await res.json();
        const text = (data.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(text);
        optimizedHeadline = parsed.optimized_headline || '';
        optimizedAbout = parsed.optimized_about || '';
      } catch { /* fallback to empty */ }
    }

    const result: LinkedInResult = {
      found: !!profileMarkdown,
      profile_url: profileUrl,
      completeness_score: score,
      current_headline: headline,
      current_about: about,
      optimized_headline: optimizedHeadline,
      optimized_about: optimizedAbout,
      missing_elements: missing,
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error('personal-linkedin error:', err);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}

function extractSection(markdown: string, keywords: string[]): string {
  const lines = markdown.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (keywords.some(k => lower.includes(k))) {
      // Collect next non-empty lines up to 500 chars
      const parts: string[] = [];
      for (let j = i + 1; j < lines.length && parts.join(' ').length < 500; j++) {
        if (lines[j].trim()) parts.push(lines[j].trim());
        if (parts.length > 20) break;
      }
      return parts.join(' ').slice(0, 500);
    }
  }
  return '';
}
