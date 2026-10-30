import { NextRequest, NextResponse } from 'next/server';
import { ACTIVE_PLATFORMS, callPlatform } from '@/lib/platforms';
import { getSupabaseAdmin } from '@/lib/supabase';
// P0a: server-side route — service_role (bypasses RLS); no user session here.
const supabase = getSupabaseAdmin();
import { checkUsageLimit, incrementUsage } from '@/lib/usageLimits';
import { resolvePlanServer } from '@/lib/resolvePlanServer';
import { knowledgePanelTitleMatches } from '@/lib/trust';
import { getSessionUser } from '@/lib/apiAuth';
import { checkRateLimit } from '@/lib/rateLimit';
import { invalidQueryField } from '@/lib/queryVariations';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export interface PersonalTrustSignal {
  key: string;
  label: string;
  exists: boolean;
  url?: string;
  score_impact: number;
  fix_available: boolean;
  fix_priority: 'high' | 'medium' | 'low';
}

export interface PersonalQueryResult {
  query_type: 'name_recognition' | 'expertise' | 'recommendation' | 'authority' | 'comparison';
  query_text: string;
  mentioned_count: number;
  recommended_count: number;
  total_platforms: number;
  mention_rate: number;
  platform_details: Array<{
    platform: string;
    mentioned: boolean;
    recommended: boolean;
    sentiment: 'positive' | 'neutral' | 'negative' | 'not_found';
    authority_signals: string[];
  }>;
}

export interface ReputationAlert {
  platform: string;
  query_type: string;
  excerpt: string;
  severity: 'critical' | 'warning';
}

export interface PersonalScanResult {
  scan_id: string | null;
  name: string;
  specialty: string;
  location: string;
  overall_score: number;
  name_recognition_rate: number;
  recommendation_rate: number;
  authority_citation_rate: number;
  positive_sentiment_rate: number;
  query_results: PersonalQueryResult[];
  trust_signals: PersonalTrustSignal[];
  competitor_name: string | null;
  competitor_mention_rate: number;
  gap_narrative: string;
  low_recognition: boolean;
  recognition_message: string | null;
  confidence_level: 'high' | 'medium' | 'low';
  confidence_message: string;
  // Ticket 7: identity-confirm — who the scan describes (separate from score confidence)
  identity: {
    confirmed: boolean;
    confidence: 'high' | 'medium' | 'low' | null;
    basis: string[];
    linkedin_url: string | null;
  };
  linkedin_score: number | null;
  linkedin_gaps: string[];
  linkedin_optimizations: string[];
  reputation_alerts: ReputationAlert[];
}

// ── SPECIALTY DETECTION ───────────────────────────────────────────────

type SpecialtyCategory = 'medical' | 'legal' | 'business';

function detectSpecialtyCategory(specialty: string): SpecialtyCategory {
  const s = specialty.toLowerCase();
  if (/doctor|dr|physician|surgeon|dentist|therapist|psychiatrist|psychologist|cardiologist|dermatologist|pediatrician|neurologist|oncologist|radiologist|orthopedic/.test(s)) return 'medical';
  if (/lawyer|attorney|counsel|solicitor|barrister|paralegal|judge|legal/.test(s)) return 'legal';
  return 'business';
}

// ── TRUST SIGNAL CHECKS ───────────────────────────────────────────────

async function checkTrustSignals(name: string, specialty: string): Promise<PersonalTrustSignal[]> {
  const category = detectSpecialtyCategory(specialty);
  const signals: PersonalTrustSignal[] = [];
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;

  async function scrapeExists(url: string): Promise<boolean> {
    if (!firecrawlKey) return false;
    try {
      const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${firecrawlKey}` },
        body: JSON.stringify({ url, formats: ['markdown'], timeout: 10000 }),
        signal: AbortSignal.timeout(12000),
      });
      const data = await res.json();
      return !!(data.success && data.data?.markdown && data.data.markdown.length > 100);
    } catch { return false; }
  }

  async function searchExists(query: string): Promise<boolean> {
    const serpKey = process.env.SERPAPI_KEY;
    if (!serpKey) return false;
    try {
      const params = new URLSearchParams({ q: query, api_key: serpKey, num: '3' });
      const res = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(8000) });
      const data = await res.json();
      const results = data.organic_results || [];
      return results.some((r: any) =>
        (r.title || '').toLowerCase().includes(name.toLowerCase().split(' ')[1] || name.toLowerCase()) ||
        (r.snippet || '').toLowerCase().includes(name.toLowerCase().split(' ')[1] || name.toLowerCase())
      );
    } catch { return false; }
  }

  if (category === 'medical') {
    const lastName = name.split(' ').pop() || name;
    const [healthgrades, zocdoc, pubmed, linkedin, doximity] = await Promise.allSettled([
      searchExists(`site:healthgrades.com "${lastName}"`),
      searchExists(`site:zocdoc.com "${lastName}"`),
      searchExists(`site:pubmed.ncbi.nlm.nih.gov "${name}"`),
      searchExists(`site:linkedin.com/in "${name}"`),
      searchExists(`site:doximity.com "${lastName}"`),
    ]);
    signals.push(
      { key: 'healthgrades', label: 'Healthgrades profile', exists: healthgrades.status === 'fulfilled' && healthgrades.value, score_impact: 8, fix_available: true, fix_priority: 'high' },
      { key: 'zocdoc', label: 'Zocdoc profile', exists: zocdoc.status === 'fulfilled' && zocdoc.value, score_impact: 7, fix_available: true, fix_priority: 'high' },
      { key: 'pubmed', label: 'PubMed publications', exists: pubmed.status === 'fulfilled' && pubmed.value, score_impact: 10, fix_available: false, fix_priority: 'medium' },
      { key: 'linkedin', label: 'LinkedIn profile', exists: linkedin.status === 'fulfilled' && linkedin.value, score_impact: 6, fix_available: true, fix_priority: 'medium' },
      { key: 'doximity', label: 'Doximity profile', exists: doximity.status === 'fulfilled' && doximity.value, score_impact: 7, fix_available: true, fix_priority: 'medium' },
    );
  } else if (category === 'legal') {
    const lastName = name.split(' ').pop() || name;
    const [avvo, martindale, superLawyers, linkedin, superLawyersExt] = await Promise.allSettled([
      searchExists(`site:avvo.com "${lastName}"`),
      searchExists(`site:martindale.com "${lastName}"`),
      searchExists(`site:superlawyers.com "${lastName}"`),
      searchExists(`site:linkedin.com/in "${name}"`),
      searchExists(`site:superlawyers.com "${name}"`),
    ]);
    signals.push(
      { key: 'avvo', label: 'Avvo profile', exists: avvo.status === 'fulfilled' && avvo.value, score_impact: 9, fix_available: true, fix_priority: 'high' },
      { key: 'martindale', label: 'Martindale-Hubbell profile', exists: martindale.status === 'fulfilled' && martindale.value, score_impact: 8, fix_available: true, fix_priority: 'high' },
      { key: 'super_lawyers', label: 'Super Lawyers listing', exists: superLawyers.status === 'fulfilled' && superLawyers.value, score_impact: 7, fix_available: false, fix_priority: 'medium' },
      { key: 'linkedin', label: 'LinkedIn profile', exists: linkedin.status === 'fulfilled' && linkedin.value, score_impact: 6, fix_available: true, fix_priority: 'medium' },
      { key: 'super_lawyers_extended', label: 'Super Lawyers listing', exists: superLawyersExt.status === 'fulfilled' && superLawyersExt.value, score_impact: 8, fix_available: true, fix_priority: 'medium' },
    );
  } else {
    const [linkedin, forbes, amazon, podcasts] = await Promise.allSettled([
      searchExists(`site:linkedin.com/in "${name}"`),
      searchExists(`"${name}" site:forbes.com OR site:inc.com OR site:hbr.org`),
      searchExists(`site:amazon.com/author "${name}"`),
      searchExists(`"${name}" podcast guest OR interview`),
    ]);
    signals.push(
      { key: 'linkedin', label: 'LinkedIn profile', exists: linkedin.status === 'fulfilled' && linkedin.value, score_impact: 8, fix_available: true, fix_priority: 'high' },
      { key: 'media_bylines', label: 'Forbes/Inc/HBR bylines', exists: forbes.status === 'fulfilled' && forbes.value, score_impact: 10, fix_available: true, fix_priority: 'high' },
      { key: 'amazon_author', label: 'Amazon author page', exists: amazon.status === 'fulfilled' && amazon.value, score_impact: 6, fix_available: true, fix_priority: 'medium' },
      { key: 'podcast_appearances', label: 'Podcast appearances', exists: podcasts.status === 'fulfilled' && podcasts.value, score_impact: 7, fix_available: true, fix_priority: 'medium' },
    );
  }

  // b02d: a Knowledge Panel exists only when SerpAPI returns an actual
  // knowledge_graph object whose title is THIS person (normalised name
  // match). Any organic result for `"name" "specialty"` is not a panel.
  async function knowledgePanelExists(query: string): Promise<boolean> {
    const serpKey = process.env.SERPAPI_KEY;
    if (!serpKey) return false;
    try {
      const params = new URLSearchParams({ q: query, api_key: serpKey, num: '3' });
      const res = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(8000) });
      const data = await res.json();
      return knowledgePanelTitleMatches(data?.knowledge_graph?.title, name);
    } catch { return false; }
  }

  // Universal signals for all categories
  const [wikipedia, knowledgePanel, twitter, youtube] = await Promise.allSettled([
    searchExists(`site:en.wikipedia.org "${name}"`),
    knowledgePanelExists(`"${name}" ${specialty}`),
    searchExists(`site:twitter.com OR site:x.com "${name}" ${specialty}`),
    searchExists(`site:youtube.com "${name}" ${specialty}`),
  ]);
  signals.push(
    { key: 'wikipedia', label: 'Wikipedia page', exists: wikipedia.status === 'fulfilled' && wikipedia.value, score_impact: 12, fix_available: true, fix_priority: 'high' },
    { key: 'knowledge_panel', label: 'Google Knowledge Panel', exists: knowledgePanel.status === 'fulfilled' && knowledgePanel.value, score_impact: 10, fix_available: true, fix_priority: 'high' },
    { key: 'twitter', label: 'Twitter/X presence', exists: twitter.status === 'fulfilled' && twitter.value, score_impact: 5, fix_available: true, fix_priority: 'low' },
    { key: 'youtube', label: 'YouTube channel/videos', exists: youtube.status === 'fulfilled' && youtube.value, score_impact: 6, fix_available: true, fix_priority: 'low' },
  );

  return signals;
}

// ── QUERY ANALYSIS ────────────────────────────────────────────────────

async function analyzeResponse(response: string, identifier: {
  name: string;
  specialty: string;
  city: string;
  state: string;
}): Promise<{
  mentioned: boolean;
  recommended: boolean;
  sentiment: 'positive' | 'neutral' | 'negative' | 'not_found';
  confidence: 'high' | 'medium' | 'low';
  authority_signals: string[];
}> {
  const NOT_FOUND = { mentioned: false, recommended: false, sentiment: 'not_found' as const, confidence: 'low' as const, authority_signals: [] };

  if (!response || response.trim().length < 20) return NOT_FOUND;

  const { name, specialty, city, state } = identifier;
  const locDesc = [city, state].filter(Boolean).join(' ') || 'their stated location';

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
        max_tokens: 160,
        messages: [{
          role: 'user',
          content: `Does this AI response demonstrate genuine knowledge of a SPECIFIC person named "${name}" who is a ${specialty} in ${locDesc}?

The response must be about THIS specific person in THIS specific location — NOT a different person with a similar name in a different city, and NOT just echoing the name in a "I don't know / can't find" disclaimer.

Response to analyze: "${response.slice(0, 1500)}"

Reply with JSON only, no markdown:
{"genuinely_knows":true/false,"about_correct_person":true/false,"recommends":true/false,"sentiment":"positive"/"neutral"/"negative"/"not_found","confidence":"high"/"medium"/"low"}

genuinely_knows = true ONLY if the response shows real facts, credentials, or accomplishments about this person — not a disclaimer.
about_correct_person = true ONLY if there is no ambiguity that the ${specialty} in ${locDesc} is the person being discussed (not a different ${name} elsewhere).
confidence = high only when the response clearly and unambiguously identifies this exact person.`,
        }],
      }),
    });

    const data = await res.json();
    const text = (data.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);

    // A genuine mention requires BOTH genuine knowledge AND that it is the correct person
    const mentioned = parsed.genuinely_knows === true && parsed.about_correct_person === true;
    const sentiment = (['positive','neutral','negative','not_found'].includes(parsed.sentiment)
      ? parsed.sentiment : 'not_found') as 'positive' | 'neutral' | 'negative' | 'not_found';
    const confidence = (['high','medium','low'].includes(parsed.confidence)
      ? parsed.confidence : 'low') as 'high' | 'medium' | 'low';

    // Fallback: if Haiku says NOT mentioned but the person's full name clearly
    // appears in the response text (and it isn't a "can't find" disclaimer),
    // count it as mentioned at LOW confidence. Guards against Haiku being overly
    // strict about location/credentials when the name is plainly present.
    let finalMentioned = mentioned;
    let fallbackFired = false;
    if (!mentioned && response.length > 20) {
      const respLower = response.toLowerCase();
      const nameWords = name.toLowerCase().split(' ').filter(w => w.length > 2);
      const allWordsPresent = nameWords.length >= 2 && nameWords.every(word => respLower.includes(word));
      const isDisclaimer =
        respLower.includes("i don't have information") ||
        respLower.includes('i cannot find') ||
        respLower.includes('no information available') ||
        respLower.includes("i'm not able to") ||
        respLower.includes("i don't know");
      // Diagnostic: fires for every Haiku-negative response so we can see WHY the
      // name fallback did or didn't kick in (name split, word presence, length).
      console.log('[personal-scan] fallback check:', JSON.stringify({
        name,
        nameWords,
        allWordsPresent,
        isDisclaimer,
        responseLength: response.length,
        responsePreview: response.substring(0, 120),
      }));
      if (allWordsPresent && !isDisclaimer) {
        finalMentioned = true;
        fallbackFired = true;
        console.log('[personal-scan] name-presence fallback fired — response contains full name but Haiku said not mentioned:', name);
      }
    }
    // Fallback mentions are inherently less certain than Haiku-confirmed ones.
    const finalConfidence: 'high' | 'medium' | 'low' = fallbackFired ? 'low' : confidence;

    // Authority signals from the response text (only when genuinely mentioned)
    const authority_signals: string[] = [];
    if (finalMentioned) {
      const lower = response.toLowerCase();
      if (/board.certified|board certified/.test(lower)) authority_signals.push('Board certified');
      if (/published|author|wrote/.test(lower)) authority_signals.push('Published author');
      if (/award|recognized|honored/.test(lower)) authority_signals.push('Award recipient');
      if (/hospital|university|clinic|institution/.test(lower)) authority_signals.push('Institutional affiliation');
      if (/years? of experience|decade/.test(lower)) authority_signals.push('Experience cited');
    }

    return {
      mentioned: finalMentioned,
      recommended: finalMentioned && parsed.recommends === true,
      sentiment: finalMentioned ? sentiment : 'not_found',
      confidence: finalMentioned ? finalConfidence : 'low',
      authority_signals,
    };
  } catch {
    return NOT_FOUND;
  }
}

// ── GAP NARRATIVE ─────────────────────────────────────────────────────

async function generateGapNarrative(
  name: string,
  specialty: string,
  location: string,
  overallScore: number,
  totalOpportunities: number,
  appearedIn: number,
  competitorName: string | null,
  competitorMentions: number,
  presentSignals: string[],
  missingSignals: string[],
): Promise<string> {
  try {
    const pct = Math.round((appearedIn / totalOpportunities) * 100);
    const compPct = competitorName ? Math.round((competitorMentions / totalOpportunities) * 100) : null;

    const prompt = `${name} is a ${specialty} in ${location}.
Across 12 AI platforms and 5 query types, they appeared in ${appearedIn} of ${totalOpportunities} opportunities (${pct}%).
${competitorName ? `Closest peer ${competitorName} appeared in ${competitorMentions} of ${totalOpportunities} (${compPct}%).` : ''}
Authority signals present: ${presentSignals.join(', ') || 'none detected'}.
Authority signals missing: ${missingSignals.join(', ') || 'none missing'}.

Generate a personal brand AI diagnosis:
1. Why AI platforms do or don't recommend this person by name
2. Which missing signals cause the biggest gap
3. Top 3 highest-impact fixes in priority order with expected score improvement
4. One specific actionable first step they can take this week

Write in second person, direct, specific to their profession. Reference real platform names. 200 words max.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    return data.content?.[0]?.text || '';
  } catch { return ''; }
}

// ── LINKEDIN SCORING ──────────────────────────────────────────────────

async function scoreLinkedIn(name: string, specialty: string, loc: string): Promise<{
  score: number | null;
  gaps: string[];
  optimizations: string[];
}> {
  const firecrawlKey = process.env.FIRECRAWL_API_KEY;
  const serpKey = process.env.SERPAPI_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!serpKey && !firecrawlKey) return { score: null, gaps: [], optimizations: [] };

  // Step 1: find LinkedIn URL via SerpAPI
  let profileUrl: string | null = null;
  let profileMarkdown = '';

  if (serpKey) {
    try {
      const q = `site:linkedin.com/in "${name}" ${specialty}`;
      const params = new URLSearchParams({ q, api_key: serpKey, num: '3' });
      const res = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(8000) });
      const data = await res.json();
      const first = (data.organic_results || []).find((r: { link?: string }) => r.link?.includes('linkedin.com/in'));
      if (first?.link) profileUrl = first.link;
    } catch { /* no url found */ }
  }

  // Step 2: scrape via Firecrawl
  if (profileUrl && firecrawlKey) {
    try {
      const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${firecrawlKey}` },
        body: JSON.stringify({ url: profileUrl, formats: ['markdown'], timeout: 15000 }),
        signal: AbortSignal.timeout(18000),
      });
      const data = await res.json();
      if (data.success && data.data?.markdown) profileMarkdown = data.data.markdown;
    } catch { /* scrape failed */ }
  }

  if (!profileMarkdown) return { score: null, gaps: ['LinkedIn profile not found'], optimizations: [] };

  // Step 3: score 5 dimensions
  const md = profileMarkdown.toLowerCase();
  const gaps: string[] = [];
  let score = 0;

  // Headline (0-20): contains specialty + location keywords
  const headlineMatch = profileMarkdown.match(/^#\s*(.+)$/m) || profileMarkdown.match(/headline[:\s]+([^\n]+)/i);
  const headline = headlineMatch?.[1] || '';
  const headlineHasSpec = headline.toLowerCase().includes(specialty.toLowerCase());
  const headlineHasLoc = loc ? headline.toLowerCase().includes(loc.split(' ')[0].toLowerCase()) : false;
  if (headlineHasSpec && headlineHasLoc) score += 20;
  else if (headlineHasSpec || headlineHasLoc) { score += 10; gaps.push('Headline should include both specialty and city'); }
  else gaps.push('Optimize headline with specialty + city for AI discoverability');

  // About section (0-20): 200+ words, professional language
  const aboutIdx = md.indexOf('about');
  const aboutText = aboutIdx >= 0 ? profileMarkdown.slice(aboutIdx, aboutIdx + 1500) : '';
  const aboutWords = aboutText.trim().split(/\s+/).filter(Boolean).length;
  if (aboutWords >= 200) score += 20;
  else if (aboutWords >= 80) { score += 12; gaps.push('Expand About section to 200+ words with specific outcomes and credentials'); }
  else gaps.push('Write a 200+ word About section with specific outcomes and credentials');

  // Experience (0-20): has employer names + dates + descriptions
  const hasExp = md.includes('experience') && (md.includes(' at ') || md.includes('·'));
  const expDescWords = hasExp ? (md.match(/\b(led|managed|built|drove|increased|decreased|delivered|launched)\b/g) || []).length : 0;
  if (hasExp && expDescWords >= 3) score += 20;
  else if (hasExp) { score += 12; gaps.push('Add achievement verbs and metrics to experience entries'); }
  else gaps.push('Add detailed experience entries with employer, role, and accomplishments');

  // Skills (0-20): has skills section with relevant endorsements
  const hasSkills = md.includes('skill') || md.includes('expertise') || md.includes('specialt');
  const skillCount = (profileMarkdown.match(/\||\n-\s/g) || []).length;
  if (hasSkills && skillCount >= 5) score += 20;
  else if (hasSkills) { score += 12; gaps.push('Add more skills keywords that match your specialty terms'); }
  else gaps.push('Add a skills section with 10+ relevant keywords for AI visibility');

  // Activity (0-20): recent posts / shares
  const hasActivity = md.includes('post') || md.includes('comment') || md.includes('published') || md.includes('article') || md.includes('shared');
  if (hasActivity) score += 20;
  else gaps.push('Post thought leadership content weekly to build AI citation signals');

  // Step 4: get optimization suggestions from Haiku
  const optimizations: string[] = [];
  if (anthropicKey && gaps.length > 0) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          messages: [{ role: 'user', content: `Give 3 one-sentence LinkedIn optimization tips for ${name}, a ${specialty} in ${loc || 'their city'}, to improve AI citation. Focus on: ${gaps.slice(0, 2).join(', ')}. Return as JSON array of strings: ["tip1","tip2","tip3"]` }],
        }),
      });
      const data = await res.json();
      const text = (data.content?.[0]?.text || '[]').replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) optimizations.push(...parsed.slice(0, 3));
    } catch { /* skip */ }
  }

  return { score: Math.min(100, score), gaps, optimizations };
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────

// Country → human-readable suffix for queries.
// Covers all 14 countries supported by Local Pro (see lib/countryConfig.ts).
// US omitted because no country suffix is needed for US queries.
const COUNTRY_SUFFIX: Record<string, string> = {
  GB: 'UK', AU: 'Australia', CA: 'Canada', IE: 'Ireland',
  NZ: 'New Zealand', SG: 'Singapore', AE: 'UAE', ZA: 'South Africa',
  NG: 'Nigeria', KE: 'Kenya', GH: 'Ghana', IN: 'India', PH: 'Philippines',
};

export async function POST(req: NextRequest) {
  try {
    // Accept `state` (alias `region`) as a distinct identifier alongside name, occupation, city
    const { name, specialty, location, region, state, country: bodyCountry, userId: bodyUserId, identityConfirmed, identityConfidence, identityBasis, linkedinUrl } = await req.json();
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
    // Every one of these is spliced into the 5×12 platform queries — bound
    // them (string, ≤ 100 chars, no control chars) so a request cannot send
    // arbitrary-length prompts to every paid platform.
    {
      const bad = invalidQueryField({ name, specialty, location, region, state, country: bodyCountry });
      if (bad) return NextResponse.json({ error: 'invalid_input', message: `${bad} must be a short plain-text string.` }, { status: 400 });
    }

    // Ticket 7 (Personal Pro identity-confirm): a scan must never silently
    // score an unconfirmed identity — the wrong "John Smith", or a firm
    // ("Power Rogers") read as a person. The confirm is MANDATORY server-side:
    // the old gate only applied when the client itself sent
    // requireConfirm:true, so any caller could skip it by omitting the flag.
    // Both UI callers (homepage runConfirmedPersonalScan, dashboard
    // personal-brand runScan) send identityConfirmed:true only after the
    // user confirms the identity shown.
    if (identityConfirmed !== true) {
      return NextResponse.json({
        error: 'identity_confirm_required',
        message: 'Please confirm this is the right person before scoring. Add a LinkedIn URL or confirm the identity shown.',
      }, { status: 428 });
    }

    // Phase 21: Personal Pro disambiguation — a bare name ("Dr. Sarah Johnson")
    // matches too many people. Require at least a specialty OR a location so AI
    // platforms resolve the right person. Accept context from the structured
    // fields OR inferred from the name string (specialty keyword / 3+ words).
    {
      const nameStr = String(name);
      const hasSpecialty =
        !!(specialty && String(specialty).trim()) ||
        /doctor|dr\.|dentist|lawyer|attorney|therapist|consultant|coach|advisor|surgeon|physician|cardiologist|dermatologist|psychiatrist|psychologist/i.test(nameStr + ' ' + (specialty || ''));
      const hasLocation =
        !!((location && String(location).trim()) || (region && String(region).trim()) || (state && String(state).trim())) ||
        nameStr.trim().split(/\s+/).length > 3;
      if (!hasSpecialty && !hasLocation) {
        return NextResponse.json({
          error: 'disambiguation_required',
          message: 'Please include your specialty and city for accurate results. Example: "Dr. Sarah Johnson cardiologist Chicago"',
          suggestions: [`${nameStr} [specialty] [city]`],
        }, { status: 400 });
      }
    }

    // IDOR fix: the user is the SESSION user — body.userId is never trusted
    // (it let anyone spend another user's quota and attach scans/snapshots
    // to their account). A body userId that differs from the session is
    // rejected outright so a stale client cannot silently scan as nobody.
    const sessionUser = await getSessionUser(req);
    const userId: string | null = sessionUser?.id ?? null;
    if (bodyUserId && bodyUserId !== userId) {
      return NextResponse.json(
        { error: 'authentication_required', message: 'Sign in again to run this scan on your account.' },
        { status: 401 },
      );
    }

    // Anonymous scans (55 LLM calls each) used to skip every limit. They now
    // get a per-IP daily cap in their own bucket.
    if (!userId) {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      const rl = checkRateLimit(`personal:${ip}`, null, { limit: 2 });
      if (!rl.allowed) {
        return NextResponse.json({
          error: 'personal_scan_limit_reached',
          message: `Free personal scan limit reached (${rl.limit}/day). Sign in to scan more.`,
          upgradeUrl: '/signup',
        }, { status: 429 });
      }
    }

    // Hoisted so incrementUsage below can pass it (admins never counted).
    let userEmail = sessionUser?.email ?? '';

    // Monthly usage enforcement for authenticated users.
    if (userId) {
      let userPlan = 'free';
      let userIsTrialing = false;
      try {
        const resolved = await resolvePlanServer(userId);
        userPlan = resolved.plan;
        userEmail = resolved.email;
        userIsTrialing = resolved.isTrialing;
      } catch { /* fall through — treat as free */ }

      const limitCheck = await checkUsageLimit(userId, userEmail, 'personal_scan', userPlan, userIsTrialing);
      if (!limitCheck.allowed) {
        return NextResponse.json({
          error: 'personal_scan_limit_reached',
          message: limitCheck.message,
          current: limitCheck.current,
          limit: limitCheck.limit,
          remaining: limitCheck.remaining,
          resetDate: limitCheck.resetDate,
          upgradeUrl: '/pricing',
        }, { status: 429 });
      }
    }

    const sp = specialty || 'professional';
    const loc = location || '';
    const reg = state || region || '';

    // Country: body > Vercel header > US default
    const country = (bodyCountry || req.headers.get('x-vercel-ip-country') || 'US').toUpperCase();
    const countrySuffix = COUNTRY_SUFFIX[country] || '';

    // Build location string for queries: "Chicago Illinois" or "London England UK"
    const locParts = [loc, reg, countrySuffix].filter(Boolean);
    const fullLoc = locParts.join(' ');

    // City + state only (no country suffix), used for precise person disambiguation
    const cityState = [loc, reg].filter(Boolean).join(' ');

    // Identifier passed to the Haiku classifier so it matches the RIGHT person
    const identifier = { name, specialty: sp, city: loc, state: reg };

    // 5 query types — include all 4 identifiers (name + occupation + city + state) for precision
    const queryTypes: Array<{ type: PersonalQueryResult['query_type']; text: string }> = [
      // 1. Name recognition — who is this exact person
      { type: 'name_recognition', text: fullLoc ? `Who is ${name} ${sp} in ${fullLoc}?` : `Who is ${name} ${sp}?` },
      // 2. Expertise — does the name surface in a category search
      { type: 'expertise',        text: fullLoc ? `top ${sp} in ${fullLoc}` : `top ${sp}` },
      // 3. Recommendation — would AI recommend them for the service
      { type: 'recommendation',   text: fullLoc ? `Who should I see for ${sp} services in ${fullLoc}?` : `Who should I see for ${sp} services?` },
      // 4. Authority — direct quality question with location
      { type: 'authority',        text: cityState ? `Is ${name} ${sp} in ${cityState} a good ${sp}?` : `Is ${name} a good ${sp}?` },
      // 5. Specific identity — the most specific possible direct lookup
      { type: 'comparison',       text: fullLoc ? `${name} ${sp} ${fullLoc}` : `${name} ${sp}` },
    ];

    const activePlatforms = ACTIVE_PLATFORMS;

    // Fire all query x platform combinations
    const allJobs = queryTypes.flatMap(qt =>
      activePlatforms.map(platform => ({ qt, platform }))
    );

    const allResults = await Promise.allSettled(
      allJobs.map(({ qt, platform }) =>
        callPlatform(platform, qt.text).then(response => ({
          queryType: qt.type,
          queryText: qt.text,
          platform: platform.name,
          response,
        }))
      )
    );

    // Aggregate by query type
    const queryResultMap = new Map<PersonalQueryResult['query_type'], PersonalQueryResult>();

    for (const qt of queryTypes) {
      queryResultMap.set(qt.type, {
        query_type: qt.type,
        query_text: qt.text,
        mentioned_count: 0,
        recommended_count: 0,
        total_platforms: activePlatforms.length,
        mention_rate: 0,
        platform_details: [],
      });
    }

    // Run Haiku classification on all fulfilled responses in parallel
    const fulfilledResults = allResults
      .filter((r): r is PromiseFulfilledResult<{ queryType: PersonalQueryResult['query_type']; queryText: string; platform: string; response: string }> => r.status === 'fulfilled')
      .map(r => r.value);

    const analyses = await Promise.all(
      fulfilledResults.map(r => analyzeResponse(r.response, identifier))
    );

    for (let i = 0; i < fulfilledResults.length; i++) {
      const { queryType, platform } = fulfilledResults[i];
      const entry = queryResultMap.get(queryType);
      if (!entry) continue;

      const analysis = analyses[i];
      entry.platform_details.push({
        platform,
        mentioned: analysis.mentioned,
        recommended: analysis.recommended,
        sentiment: analysis.sentiment,
        authority_signals: analysis.authority_signals,
      });
      if (analysis.mentioned) entry.mentioned_count++;
      if (analysis.recommended) entry.recommended_count++;
    }

    // Calculate rates
    for (const entry of queryResultMap.values()) {
      entry.mention_rate = Math.round((entry.mentioned_count / entry.total_platforms) * 100);
    }

    const queryResults = Array.from(queryResultMap.values());

    // ── SCORE CALCULATION (single consistent denominator) ───────────────
    // Every rate is counted out of the SAME total: every Haiku-classified
    // platform response. This avoids the >100% bug from mismatched denominators.
    const totalPlatforms = analyses.length;
    console.log('HAIKU ANALYSIS:', analyses.map(a => a.mentioned));

    const mentionCount   = analyses.filter(a => a.mentioned).length;
    const recommendCount = analyses.filter(a => a.recommended).length;
    const authorityCount = analyses.filter(a => a.authority_signals.length > 0).length;
    const positiveCount  = analyses.filter(a => a.sentiment === 'positive').length;

    const nameRecRate   = totalPlatforms > 0 ? mentionCount   / totalPlatforms : 0;
    const recRate       = totalPlatforms > 0 ? recommendCount / totalPlatforms : 0;
    const authorityRate = totalPlatforms > 0 ? authorityCount / totalPlatforms : 0;
    const positiveRate  = totalPlatforms > 0 ? positiveCount  / totalPlatforms : 0;

    // Weights sum to 100: each rate is 0–1, weight is its max point contribution
    const rawScore =
      nameRecRate   * 25 +
      recRate       * 30 +
      authorityRate * 25 +
      positiveRate  * 20;

    const clampedScore = Math.round(Math.min(100, Math.max(0, rawScore)));

    // Aliases for narrative / persistence (same consistent denominator)
    const totalOpps = totalPlatforms;
    const totalMentioned = mentionCount;

    // ── CONFIDENCE ASSESSMENT ───────────────────────────────────────────
    // How certain are we that platforms identified THIS specific person?
    const highConfCount = analyses.filter(a => a.mentioned && a.confidence === 'high').length;
    const mentionedAnalyses = analyses.filter(a => a.mentioned);
    let confidenceLevel: 'high' | 'medium' | 'low';
    let confidenceMessage: string;
    if (highConfCount >= 5) {
      confidenceLevel = 'high';
      confidenceMessage = 'High confidence scan — AI platforms clearly identify you as a unique professional.';
    } else if (mentionedAnalyses.length > 0 && highConfCount >= 2) {
      confidenceLevel = 'medium';
      confidenceMessage = 'Moderate confidence — some platforms identify you, but adding your practice name would sharpen results.';
    } else {
      confidenceLevel = 'low';
      confidenceMessage = 'We found limited information about this specific person. Try adding your practice name for more accurate results.';
    }

    // Find competitor (most mentioned other name across recommendation/expertise queries)
    const otherNames: Record<string, number> = {};
    for (const qt of ['recommendation', 'expertise'] as const) {
      const qr = queryResultMap.get(qt);
      if (!qr) continue;
      for (const pd of qr.platform_details) {
        // Simple competitor extraction: just track mention count for non-target name
        if (!pd.mentioned) continue;
        // We can't easily extract a competitor name from free text here; mark as TBD
      }
    }
    const competitorName: string | null = null;
    const competitorMentions = 0;

    // Reputation alerts: collect negative-sentiment mentions
    const reputationAlerts: ReputationAlert[] = [];
    for (let i = 0; i < fulfilledResults.length; i++) {
      const { queryType, platform, response } = fulfilledResults[i];
      const analysis = analyses[i];
      if (analysis.mentioned && analysis.sentiment === 'negative') {
        reputationAlerts.push({
          platform,
          query_type: queryType,
          excerpt: response.slice(0, 300),
          severity: analysis.confidence === 'high' ? 'critical' : 'warning',
        });
      }
    }

    // Trust signals and LinkedIn scoring — run in parallel
    const [trustSignals, linkedinResult] = await Promise.all([
      checkTrustSignals(name, sp),
      scoreLinkedIn(name, sp, fullLoc || loc),
    ]);
    const presentSignals = trustSignals.filter(s => s.exists).map(s => s.label);
    const missingSignals = trustSignals.filter(s => !s.exists).map(s => s.label);

    // Gap narrative
    const gapNarrative = await generateGapNarrative(
      name, sp, fullLoc || loc, clampedScore,
      totalOpps, totalMentioned,
      competitorName, competitorMentions,
      presentSignals, missingSignals,
    );

    // Aggregate the 5 query × 12 platform analyses down to ONE row per platform
    // for rankall_platform_results (what the report's Platform Recognition grid
    // reads). A platform counts as "mentioned" if the person was recognized on
    // ANY query; keep a representative response, preferring a mentioned one. Seed
    // with every active platform so failed/rejected platforms still show a row.
    const platformAgg = new Map<string, { mentioned: boolean; response: string | null }>();
    for (const pl of activePlatforms) platformAgg.set(pl.name, { mentioned: false, response: null });
    for (let i = 0; i < fulfilledResults.length; i++) {
      const pname = fulfilledResults[i].platform;
      const presp = fulfilledResults[i].response || null;
      const pmentioned = analyses[i]?.mentioned ?? false;
      const cur = platformAgg.get(pname) ?? { mentioned: false, response: null };
      if (pmentioned && (!cur.mentioned || !cur.response)) cur.response = presp || cur.response;
      if (pmentioned) cur.mentioned = true;
      if (!cur.response && presp) cur.response = presp;
      platformAgg.set(pname, cur);
    }
    // Platform-level recognition count (0–12) — the value every consumer of
    // mentioned_count expects (report divides it by 12), NOT the up-to-60 total.
    const platformsMentioned = Array.from(platformAgg.values()).filter(p => p.mentioned).length;

    // Save to Supabase
    let scanId: string | null = null;
    try {
      const { data: scan } = await supabase
        .from('rankall_scans')
        .insert({
          user_id:       userId || null,
          input:         `${name} ${sp}${loc ? ' ' + loc : ''}`,
          intent_type:   'personal_pro',
          industry:      sp,
          location:      loc,
          overall_score: clampedScore,
          competitor_name: competitorName,
          mentioned_count: platformsMentioned,
          citation_sources: presentSignals,
          created_at:    new Date().toISOString(),
        })
        .select()
        .single();
      scanId = scan?.id || null;

      // Save authority snapshot
      if (userId) {
        const wikiSignal      = trustSignals.find(s => s.key === 'wikipedia');
        const kpSignal        = trustSignals.find(s => s.key === 'knowledge_panel');
        const hgSignal        = trustSignals.find(s => s.key === 'healthgrades');
        const pubmedSignal    = trustSignals.find(s => s.key === 'pubmed');
        const podcastSignal   = trustSignals.find(s => s.key === 'podcast_appearances');
        const pressSignal     = trustSignals.find(s => s.key === 'media_bylines');
        const linkedinSignal  = trustSignals.find(s => s.key === 'linkedin');

        await supabase.from('personal_authority_snapshots').insert({
          user_id:                userId,
          scan_date:              new Date().toISOString(),
          wikipedia_exists:       wikiSignal?.exists ?? false,
          knowledge_panel_exists: kpSignal?.exists ?? false,
          healthgrades_score:     hgSignal?.exists ? 1 : 0,
          pubmed_citations:       pubmedSignal?.exists ? 1 : 0,
          press_mentions:         pressSignal?.exists ? 1 : 0,
          podcast_appearances:    podcastSignal?.exists ? 1 : 0,
          linkedin_followers:     linkedinSignal?.exists ? 1 : 0,
          personal_ai_score:      clampedScore,
          created_at:             new Date().toISOString(),
        }).then(() => {}, (e) => console.error('snapshot save error:', e));
      }

      // Persist per-platform recognition so /report/[id]'s Platform Recognition
      // grid renders (previously this table was never written for personal scans).
      if (scanId) {
        // ax9c: personal scans also populate score + mention_rate — personal
        // recognition is boolean per platform, so 100/0 and 1/0 are the
        // faithful representation (previously both columns stayed NULL).
        const platformInserts = Array.from(platformAgg.entries()).map(([pname, p]) => ({
          scan_id: scanId,
          platform: pname,
          mentioned: p.mentioned,
          score: p.mentioned ? 100 : 0,
          mention_rate: p.mentioned ? 1 : 0,
          response_text: p.response ? p.response.substring(0, 2000) : null,
          weight: activePlatforms.find(pl => pl.name === pname)?.weight ?? 1,
          error: null,
          created_at: new Date().toISOString(),
        }));
        await supabase.from('rankall_platform_results').insert(platformInserts)
          .then(() => {}, (e: unknown) => console.error('[personal-scan] platform results insert failed:', (e as Error)?.message));
      }
    } catch (e) {
      console.error('personal scan save error:', e);
    }

    const lowRecognition = clampedScore < 15;
    const recognitionMessage = lowRecognition
      ? 'AI platforms do not currently recognize this name. This could mean: (1) this person has very low online presence, (2) the name was not spelled correctly, or (3) this person is not yet known to AI platforms. If this is your name, this report shows you have significant opportunity to build AI visibility from scratch.'
      : null;

    const result: PersonalScanResult = {
      scan_id: scanId,
      name,
      specialty: sp,
      location: fullLoc || loc,
      overall_score: clampedScore,
      name_recognition_rate: Math.round(nameRecRate * 100),
      recommendation_rate: Math.round(recRate * 100),
      authority_citation_rate: Math.round(authorityRate * 100),
      positive_sentiment_rate: Math.round(positiveRate * 100),
      query_results: queryResults,
      trust_signals: trustSignals,
      competitor_name: competitorName,
      competitor_mention_rate: competitorMentions,
      gap_narrative: gapNarrative,
      low_recognition: lowRecognition,
      recognition_message: recognitionMessage,
      confidence_level: confidenceLevel,
      confidence_message: confidenceMessage,
      // Ticket 7: echo the identity confirmation that gated this scan.
      identity: {
        confirmed: identityConfirmed === true,
        confidence: (['high', 'medium', 'low'].includes(identityConfidence as string) ? identityConfidence : null) as 'high' | 'medium' | 'low' | null,
        basis: Array.isArray(identityBasis) ? identityBasis.filter((b): b is string => typeof b === 'string') : [],
        linkedin_url: typeof linkedinUrl === 'string' && linkedinUrl.trim() ? linkedinUrl.trim() : null,
      },
      linkedin_score: linkedinResult.score,
      linkedin_gaps: linkedinResult.gaps,
      linkedin_optimizations: linkedinResult.optimizations,
      reputation_alerts: reputationAlerts,
    };

    // Count against the user's monthly personal_scan quota after success.
    if (userId) await incrementUsage(userId, 'personal_scan', userEmail);

    return NextResponse.json(result);
  } catch (err) {
    console.error('scan-personal error:', err);
    return NextResponse.json({ error: 'Scan failed' }, { status: 500 });
  }
}
