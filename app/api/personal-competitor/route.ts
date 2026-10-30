import { NextRequest, NextResponse } from 'next/server';
import { knowledgePanelTitleMatches } from '@/lib/trust';
import { guardAiRoute } from '@/lib/aiRouteGuard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export interface CompetitorResult {
  name: string;
  source_url: string;
  has_wikipedia: boolean;
  has_knowledge_panel: boolean;
  estimated_score: number;
  advantages: string[];
}

export interface PeerComparisonResult {
  competitors: CompetitorResult[];
  user_gaps: string[];
}

export async function POST(req: NextRequest) {
  // Spends paid AI/search credits — it was unauthenticated. Signed-in users only, metered per user in the shared DB limiter.
  const guard = await guardAiRoute(req, { bucket: 'ai:personal-competitor', userLimit: 20 });
  if (!guard.ok) return guard.response;
  try {
    const { name, specialty, city, country } = await req.json();
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

    const serpKey = process.env.SERPAPI_KEY;
    if (!serpKey) {
      return NextResponse.json({ competitors: [], user_gaps: [] });
    }

    // Determine search query based on specialty
    const sp = specialty || 'professional';
    const loc = city || '';
    const category = detectCategory(sp);

    let searchQuery = '';
    if (category === 'medical') {
      searchQuery = `site:healthgrades.com OR site:doximity.com "${sp}" "${loc}" -"${name}"`;
    } else if (category === 'legal') {
      searchQuery = `site:avvo.com OR site:martindale.com "${sp}" "${loc}" -"${name}"`;
    } else {
      searchQuery = `site:linkedin.com/in "${sp}" "${loc}" -"${name}"`;
    }

    // Find competitors via SerpAPI
    let rawResults: Array<{ title?: string; link?: string; snippet?: string }> = [];
    try {
      const params = new URLSearchParams({ q: searchQuery, api_key: serpKey, num: '5' });
      const res = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(10000) });
      const data = await res.json();
      rawResults = data.organic_results || [];
    } catch { /* serp failed */ }

    // Extract competitor names from results
    const competitorNames: Array<{ name: string; url: string }> = [];
    for (const r of rawResults) {
      const extracted = extractNameFromResult(r.title || '', r.snippet || '', r.link || '', name);
      if (extracted && competitorNames.length < 3) {
        competitorNames.push({ name: extracted, url: r.link || '' });
      }
    }

    // For each competitor, check Wikipedia and Knowledge Panel
    const competitorResults: CompetitorResult[] = await Promise.all(
      competitorNames.map(async (comp) => {
        let hasWikipedia = false;
        let hasKnowledgePanel = false;

        try {
          const wikiParams = new URLSearchParams({ q: `"${comp.name}" Wikipedia`, api_key: serpKey, num: '3' });
          const wikiRes = await fetch(`https://serpapi.com/search.json?${wikiParams}`, { signal: AbortSignal.timeout(8000) });
          const wikiData = await wikiRes.json();
          const wikiOrg: Array<{ link?: string }> = wikiData.organic_results || [];
          hasWikipedia = wikiOrg.some((r) => (r.link || '').includes('wikipedia'));
          // b02d: a knowledge_graph for a DIFFERENT entity (a namesake, an
          // organisation, the specialty itself) is not this competitor's
          // panel — require a normalised name match.
          hasKnowledgePanel = knowledgePanelTitleMatches(wikiData.knowledge_graph?.title, comp.name);
        } catch { /* skip */ }

        const advantages: string[] = [];
        if (hasWikipedia) advantages.push('Wikipedia page');
        if (hasKnowledgePanel) advantages.push('Google Knowledge Panel');
        advantages.push(`${sp} profile on ${getDomainLabel(comp.url)}`);

        // Deterministic score from real signals only — no random component.
        // Base 40 = a listed professional profile on a directory site.
        // +20 for a Wikipedia page, +15 for a Google Knowledge Panel.
        // Max 75. Same input → identical score on every call.
        const estimatedScore = 40 + (hasWikipedia ? 20 : 0) + (hasKnowledgePanel ? 15 : 0);

        return {
          name: comp.name,
          source_url: comp.url,
          has_wikipedia: hasWikipedia,
          has_knowledge_panel: hasKnowledgePanel,
          estimated_score: Math.min(80, estimatedScore),
          advantages,
        };
      })
    );

    // Derive user gaps: things competitors have that user likely doesn't
    const userGaps: string[] = [];
    const hasWikiComp = competitorResults.some(c => c.has_wikipedia);
    const hasKPComp = competitorResults.some(c => c.has_knowledge_panel);
    if (hasWikiComp) userGaps.push('Wikipedia page (competitors have it)');
    if (hasKPComp) userGaps.push('Google Knowledge Panel');
    if (competitorResults.length > 0) userGaps.push(`Active presence on ${getDomainLabel(competitorResults[0]?.source_url || '')}`);

    const result: PeerComparisonResult = {
      competitors: competitorResults,
      user_gaps: userGaps.slice(0, 3),
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error('personal-competitor error:', err);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}

function detectCategory(specialty: string): 'medical' | 'legal' | 'business' {
  const s = specialty.toLowerCase();
  if (/doctor|dr|physician|surgeon|dentist|therapist|psychiatrist|cardiologist|dermatologist|pediatrician|neurologist/.test(s)) return 'medical';
  if (/lawyer|attorney|counsel|solicitor|barrister|legal/.test(s)) return 'legal';
  return 'business';
}

function extractNameFromResult(title: string, snippet: string, url: string, excludeName: string): string | null {
  // Try to extract a person name from the title
  const exclude = excludeName.toLowerCase();

  // Common patterns: "Dr. Jane Smith - Cardiologist", "Jane Smith | LinkedIn"
  const patterns = [
    /^([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s*[-|,]/,
    /^Dr\.?\s+([A-Z][a-z]+ [A-Z][a-z]+)/i,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match) {
      const candidate = match[1].trim();
      if (!candidate.toLowerCase().includes(exclude.split(' ')[0])) {
        return candidate;
      }
    }
  }

  // Fallback: extract from URL slug
  if (url.includes('linkedin.com/in/')) {
    const slug = url.split('linkedin.com/in/')[1]?.split('/')[0]?.split('?')[0];
    if (slug) {
      const parts = slug.split('-').filter(p => p.length > 1);
      if (parts.length >= 2) {
        const candidate = parts.slice(0, 2).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
        if (!candidate.toLowerCase().includes(exclude.split(' ')[0])) {
          return candidate;
        }
      }
    }
  }

  return null;
}

function getDomainLabel(url: string): string {
  if (url.includes('healthgrades')) return 'Healthgrades';
  if (url.includes('doximity')) return 'Doximity';
  if (url.includes('avvo')) return 'Avvo';
  if (url.includes('martindale')) return 'Martindale';
  if (url.includes('linkedin')) return 'LinkedIn';
  if (url.includes('zocdoc')) return 'Zocdoc';
  return 'directory site';
}
