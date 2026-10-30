// lib/generateFix.ts
// Fix content generation, callable directly in-process (no self-fetch). Used by the
// post-scan auto-generation and by /api/generate-fix. All failures return a
// structured result and are logged — never silently swallowed.

import { createClient } from '@supabase/supabase-js';
import { getCountryConfig, type CountryConfig } from '@/lib/countryConfig';
import { getIndustryContext } from '@/lib/fixQuality';
import { fixTypeLabel, safeBusinessName, buildFixEvidence } from '@/lib/fixIntelligence';
import { invalidateScanCache } from '@/lib/scanCache';

export type FixSource = 'manual' | 'auto_after_scan' | 'outreach_lazy' | 'scheduled' | 'admin';

const LEAK_MARKERS = [
  'MARKET CONTEXT:',
  'BUSINESS CONTEXT:',
  'CRITICAL RULES:',
  'Return ONLY the generated content',
  'ready to copy-paste.',
  'Never fabricate business data',
  'Use placeholders:',
  'Never use the search query as a business name',
  'Never recommend US platforms',
];

export function cleanWebsiteUrl(raw: string): string {
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    u.search = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return raw;
  }
}

export function sanitizeFixContent(content: string): string {
  let result = content;
  for (const marker of LEAK_MARKERS) {
    const idx = result.indexOf(marker);
    if (idx !== -1) {
      result = result.substring(0, idx).trimEnd();
    }
  }
  return result;
}

export interface GenerateFixInput {
  scanId: string;
  fixType: string;
  businessName?: string;
  industry?: string;
  city?: string;
  countryCode?: string;
  userId?: string;
  score?: number;
  website?: string;
  phone?: string;
  address?: string;
  category?: string;
  competitorName?: string;
  competitorScore?: number;
  // ax71: real platform-mention count for this scan. Without it, the
  // stored evidence claimed 'You appear on 0 of 11 AI platforms' for
  // every auto-generated fix — even for mentioned businesses.
  platformsMentioned?: number;
  revenueGap?: number;
  source?: FixSource;
  blockedBots?: string[];
  crawlerRawLines?: string[];
}

export interface GenerateFixResult {
  success: boolean;
  generatedFixId?: string;
  fixType: string;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
  // ax6v: the predicted impact stored as predicted_impact (fresh inserts
  // only). Callers use it to show the same number the product shows.
  predictedImpact?: number | null;
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// ── Content generation (prompt + Anthropic) ─────────────────────────────────
export async function generateFixContent(opts: {
  fixType: string;
  businessName: string;
  industry?: string;
  location?: string;
  countryCode: string;
  website?: string;
  phone?: string;
  address?: string;
  category?: string;
  blockedBots?: string[];
  crawlerRawLines?: string[];
}): Promise<string> {
  if (opts.website) opts = { ...opts, website: cleanWebsiteUrl(opts.website) };

  // Deterministic fix types — no LLM call needed
  if (opts.fixType === 'crawler_access' || opts.fixType === 'bing_places') {
    const resolvedCountry = getCountryConfig(opts.countryCode).code === opts.countryCode ? opts.countryCode : 'US';
    const countryConfig = getCountryConfig(resolvedCountry);
    const schemaAdditions = getCountrySchemaAdditions(resolvedCountry, opts.businessName);
    const content = buildPrompt(opts.fixType, opts.businessName, opts.industry || '', opts.location || '', countryConfig, resolvedCountry, schemaAdditions, {
      website: opts.website, phone: opts.phone, address: opts.address,
      category: opts.category, blockedBots: opts.blockedBots, crawlerRawLines: opts.crawlerRawLines,
    });
    return content;
  }

  const resolvedCountry = getCountryConfig(opts.countryCode).code === opts.countryCode ? opts.countryCode : 'US';
  const countryConfig = getCountryConfig(resolvedCountry);
  const schemaAdditions = getCountrySchemaAdditions(resolvedCountry, opts.businessName);
  const prompt = buildPrompt(opts.fixType, opts.businessName, opts.industry || '', opts.location || '', countryConfig, resolvedCountry, schemaAdditions, {
    website: opts.website, phone: opts.phone, address: opts.address,
    category: opts.category, blockedBots: opts.blockedBots, crawlerRawLines: opts.crawlerRawLines,
  });

  const systemPrompt = buildSystemPrompt(opts.industry || '', resolvedCountry);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 1500, system: systemPrompt, messages: [{ role: 'user', content: prompt }] }),
  });
  // b0fk: an AI failure (missing key on Preview -> 401, network error,
  // empty content) used to return '' as if generation had succeeded —
  // callers then claimed success with no content (and the auto path
  // persisted an empty generated_content row). Throw so every caller
  // reports failure instead of false success.
  if (!res.ok) throw new Error(`Fix generation failed (AI service ${res.status})`);
  const data = await res.json();
  let content = data.content?.[0]?.text || '';
  if (opts.website) content = content.replaceAll('YOUR_WEBSITE', opts.website);
  if (opts.phone) content = content.replaceAll('YOUR_PHONE', opts.phone);
  const cleaned = sanitizeFixContent(content);
  if (!cleaned.trim()) throw new Error('Fix generation returned no content');
  return cleaned;
}

// ── Generate + persist a fix for a scan (dedupe, evidence, insert) ───────────
export async function generateFixForScan(input: GenerateFixInput): Promise<GenerateFixResult> {
  console.log('[generateFix] starting:', input.fixType, input.source ?? 'auto_after_scan');

  if (!input.scanId || !input.fixType) {
    return { success: false, fixType: input.fixType || 'unknown', error: 'Missing scanId or fixType' };
  }

  const sb = admin();

  // Dedupe: same scan + fixType already awaiting review.
  const { data: existing } = await sb
    .from('generated_fixes')
    .select('id')
    .eq('scan_id', input.scanId)
    .eq('fix_type', input.fixType)
    .eq('status', 'pending_review')
    .maybeSingle();
  if (existing?.id) {
    console.log('[generateFix] skip (duplicate):', input.fixType);
    return { success: true, generatedFixId: existing.id as string, fixType: input.fixType, skipped: true, skipReason: 'Fix already exists for this scan' };
  }

  // P0e: cross-scan dedupe — the same fix is already pending_review for this
  // user from an earlier scan. Refresh it onto the new scan instead of
  // creating a duplicate (this was the jsonld ×17 triplication). NULL user_id
  // = outreach scans for different prospects: each scan keeps its own rows.
  if (input.userId) {
    const { data: prior } = await sb
      .from('generated_fixes')
      .select('id')
      .eq('user_id', input.userId)
      .eq('fix_type', input.fixType)
      .eq('status', 'pending_review')
      .neq('scan_id', input.scanId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if ((prior as { id: string } | null)?.id) {
      const priorId = (prior as { id: string }).id;
      await sb
        .from('generated_fixes')
        .update({
          scan_id: input.scanId,
          score_before: typeof input.score === 'number' ? input.score : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', priorId);
      console.log('[generateFix] refresh (cross-scan dedupe):', input.fixType);
      return { success: true, generatedFixId: priorId, fixType: input.fixType, skipped: true, skipReason: 'Fix already pending for this user; refreshed to latest scan' };
    }
  }

  const evidence = buildFixEvidence({
    fixType: input.fixType,
    score: input.score,
    competitorScore: input.competitorScore,
    platformsMentioned: input.platformsMentioned,
  });

  try {
    const content = await generateFixContent({
      fixType: input.fixType,
      businessName: safeBusinessName(input.businessName),
      industry: input.industry,
      location: input.city,
      countryCode: input.countryCode || 'US',
      website: input.website,
      phone: input.phone,
      address: input.address,
      category: input.category,
      blockedBots: input.blockedBots,
      crawlerRawLines: input.crawlerRawLines,
    });

    const { data, error } = await sb.from('generated_fixes').insert({
      scan_id: input.scanId,
      user_id: input.userId ?? null,
      fix_type: input.fixType,
      fix_title: fixTypeLabel(input.fixType),
      generated_content: content,
      industry: input.industry ?? null,
      city: input.city ?? null,
      country_code: input.countryCode || 'US',
      predicted_impact: evidence.predictedImpact,
      confidence: evidence.confidence,
      difficulty: evidence.difficulty,
      time_to_implement: evidence.timeToImplement,
      status: 'pending_review',
      score_before: typeof input.score === 'number' ? input.score : null,
      // Evidence + traceability
      why_recommended: evidence.whyRecommended,
      triggered_by_signal: evidence.triggeredBySignal,
      triggered_by_finding: evidence.triggeredByFinding,
      platform_evidence: evidence.platformEvidence,
      verification_status: evidence.verificationStatus,
      evidence_source: input.source ?? 'auto_after_scan',
    }).select('id').single();

    if (error) {
      console.error('[generateFix] insert failed:', input.fixType, error.message, error.code);
      return { success: false, fixType: input.fixType, error: error.message };
    }
    console.log('[generateFix] complete:', input.fixType, true);
    if (input.businessName) {
      await invalidateScanCache(input.businessName, input.countryCode || 'US', input.userId || 'anon');
    }
    // ax6v: return the predicted impact so callers (the scan route's
    // 'Fixes ready' email) can show the same number the product shows.
    // It is exactly the value inserted as predicted_impact above.
    return { success: true, generatedFixId: data.id as string, fixType: input.fixType, predictedImpact: evidence.predictedImpact };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[generateFix] failed:', input.fixType, msg);
    return { success: false, fixType: input.fixType, error: msg };
  }
}

// ── Prompt builders (moved from the route so both callers share them) ────────
export function getCountrySchemaAdditions(countryCode: string, businessName: string): Record<string, unknown> {
  switch (countryCode) {
    case 'GB': return { currenciesAccepted: 'GBP', areaServed: { '@type': 'Country', name: 'United Kingdom' } };
    case 'AU': return { currenciesAccepted: 'AUD', areaServed: { '@type': 'Country', name: 'Australia' } };
    case 'CA': return { currenciesAccepted: 'CAD', areaServed: { '@type': 'Country', name: 'Canada' } };
    case 'IN': return { currenciesAccepted: 'INR', areaServed: { '@type': 'Country', name: 'India' }, ...(businessName ? { alternateName: businessName } : {}) };
    case 'AE': return { currenciesAccepted: 'AED', areaServed: { '@type': 'Country', name: 'United Arab Emirates' } };
    case 'SG': return { currenciesAccepted: 'SGD', areaServed: { '@type': 'City', name: 'Singapore' } };
    case 'IE': return { currenciesAccepted: 'EUR', areaServed: { '@type': 'Country', name: 'Ireland' } };
    case 'NZ': return { currenciesAccepted: 'NZD', areaServed: { '@type': 'Country', name: 'New Zealand' } };
    case 'ZA': return { currenciesAccepted: 'ZAR', areaServed: { '@type': 'Country', name: 'South Africa' } };
    default:   return { currenciesAccepted: 'USD', areaServed: { '@type': 'Country', name: 'United States' } };
  }
}

const COUNTRY_NAMES: Record<string, string> = {
  US: 'the United States', GB: 'the United Kingdom', AU: 'Australia', CA: 'Canada',
  IE: 'Ireland', NZ: 'New Zealand', SG: 'Singapore', AE: 'the United Arab Emirates',
  ZA: 'South Africa', NG: 'Nigeria', KE: 'Kenya', GH: 'Ghana', IN: 'India', PH: 'the Philippines',
};

export function buildPrompt(
  fixType: string,
  businessInput: string,
  industry: string,
  location: string,
  countryConfig: CountryConfig,
  resolvedCountry: string,
  schemaAdditions: Record<string, unknown>,
  extra?: {
    website?: string;
    phone?: string;
    address?: string;
    category?: string;
    blockedBots?: string[];
    crawlerRawLines?: string[];
  },
): string {
  const biz = businessInput;
  const trustSources = countryConfig.trustSources;
  const primaryTrustSource = trustSources[0] || 'google.com/maps';
  const secondaryTrustSource = trustSources[1] || 'facebook.com';
  const countryName = COUNTRY_NAMES[countryConfig.code] || countryConfig.code;
  const marketContext = `\n\nMARKET CONTEXT: This fix is for a business in ${countryName}. Reference the local platforms and trust sources that AI engines actually cite in this market: ${trustSources.join(', ')}. Do NOT reference US-only platforms (Healthgrades, Yelp, BBB, Zocdoc) unless they appear in that list.`;

  let countryNotes = '';
  if (resolvedCountry === 'AE') {
    countryNotes += "\n\nNote: UAE weekend is Friday-Saturday — adjust your openingHoursSpecification accordingly.";
    countryNotes += "\n\nTip: Add your business name in Arabic in the 'alternateName' field for Arabic-language AI queries.";
  }
  if (resolvedCountry === 'IN') {
    countryNotes += "\n\nTip: Add your business name in Hindi in the 'alternateName' field for better AI recognition in India.";
  }

  const schemaAdditionsStr = JSON.stringify(schemaAdditions, null, 2);

  const body = ((): string => {
    switch (fixType) {
      case 'crawler_access': {
        const bots = extra?.blockedBots ?? [];
        const lines = extra?.crawlerRawLines ?? [];
        return `Your website${extra?.website ? ` (${extra.website})` : ''} is blocking AI crawlers from reading it.

WHY THIS MATTERS: Much of what AI cites about a business comes from off-page sources — but if your own website is blocked, AI platforms cannot verify ANY of your on-page content. This is the single highest-impact fix for AI visibility.

BLOCKED AI BOTS (${bots.length}):
${bots.map(b => `  ❌ ${b}`).join('\n')}

YOUR CURRENT ROBOTS.TXT RULES CAUSING THE BLOCK:
${lines.length > 0 ? lines.map(l => `  ${l}`).join('\n\n') : '  (Could not retrieve specific lines)'}

HOW TO FIX (5-10 minutes):

1. Open your website's robots.txt file (usually at ${extra?.website || 'yoursite.com'}/robots.txt)
2. Find the User-agent lines listed above
3. Either REMOVE the Disallow: / line under each AI bot, or change it to:

${bots.map(b => `User-agent: ${b}\nAllow: /`).join('\n\n')}

4. Save and re-upload robots.txt
5. Rescan on Rankall to verify the fix

IMPORTANT: Removing these blocks does NOT affect your Google SEO rankings or your regular website security. It simply allows AI assistants (ChatGPT, Claude, Perplexity, Bing Copilot) to read your public pages so they can recommend your business.

BUSINESS: ${biz}
LOCATION: ${location}`;
      }
      case 'bing_places': {
        const name = biz;
        const addr = extra?.address || location || 'YOUR_ADDRESS';
        const phone = extra?.phone || 'YOUR_PHONE';
        const website = extra?.website || 'YOUR_WEBSITE';
        const cat = extra?.category || industry || 'your business category';
        return `CLAIM AND COMPLETE YOUR BING PLACES LISTING

WHY THIS MATTERS: Much of what AI cites about a business comes from off-page sources. ChatGPT's live lookups lean heavily on the Bing index, and most small business Bing listings are incomplete or unclaimed. Completing yours puts you ahead of competitors who haven't.

YOUR BUSINESS DETAILS (use these to fill out the listing):
  Business Name: ${name}
  Address: ${addr}
  Phone: ${phone}
  Website: ${website}
  Category: ${cat}

STEP-BY-STEP (15-20 minutes):

1. GO TO https://www.bingplaces.com and sign in with a Microsoft account
2. SEARCH for "${name}" — if your listing appears, click "Claim this business"
   If it does NOT appear, click "Add your business" and enter:
   - Business name: ${name}
   - Address: ${addr}
   - Phone: ${phone}
3. VERIFY ownership (Bing offers phone, email, or postcard verification)
4. COMPLETE every field:
   - Website: ${website}
   - Phone: ${phone}
   - Hours of operation (be specific — include lunch breaks if applicable)
   - Business description (150+ words, mention "${location}" and your key services)
   - Category: select "${cat}" as primary; add 2-3 secondary categories
   - Photos: upload at least 5 (storefront, interior, team, products/services)
   - Payment methods accepted
   - Service area (if you serve customers beyond your address)
5. PUBLISH and wait 24-48 hours for Bing to index the changes

AFTER COMPLETING:
- Bing's index feeds into ChatGPT, Microsoft Copilot, and Bing Copilot
- A complete listing makes your business verifiable by AI platforms
- Rescan on Rankall after 48 hours to measure the improvement`;
      }
      case 'faq_schema':
        return `Generate a complete FAQPage JSON-LD schema for this business: "${biz}"

Create 8 realistic FAQ pairs that real customers would ask. Make them specific to this business type and location.

Return ONLY the complete HTML script tag with the JSON-LD — no explanation, no markdown, no backticks. Start with <script and end with </script>.

Example format:
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "QUESTION HERE",
      "acceptedAnswer": { "@type": "Answer", "text": "ANSWER HERE" }
    }
  ]
}
</script>`;
      case 'jsonld':
        return `Generate a complete LocalBusiness JSON-LD schema for this business: "${biz}"

Include all relevant fields: name, description, address (use the location from the business name if available), telephone placeholder, url placeholder, openingHours, priceRange, and relevant sameAs directory URLs.

Also include these country-specific schema fields (spread them into the LocalBusiness object):
${schemaAdditionsStr}
${countryNotes}

Return ONLY the complete HTML script tag with the JSON-LD — no explanation, no markdown, no backticks. Start with <script and end with </script>.`;
      case 'directory':
        return `Write a complete, optimized business profile for "${biz}" for ${primaryTrustSource} — the primary AI citation source in this market (also consider ${secondaryTrustSource} as a secondary listing).

Include:
- Business name (exact)
- Professional bio (150 words) — written in third person, mentions location, specialties, years experience
- List of 10 specific services offered
- Why choose us section (3 bullet points)
- Patient/customer philosophy statement

Format it cleanly with clear section headers. Make it specific and professional — not generic.`;
      case 'reviews':
        return `Write 10 personalized, professional responses to Google reviews for "${biz}".

Create responses for a mix of 5/4/3-star scenarios (praise, specific staff, wait time, value, long-term customer, emergency, parking, referral).

Each response should:
- Thank the reviewer by name placeholder [Name]
- Be 2-3 sentences
- Mention the business name naturally
- Be warm and professional, not generic

Format each as:
REVIEW [NUMBER]: [Scenario]
RESPONSE: [Your response here]`;
      case 'reddit':
        return `Create a Reddit presence strategy for "${biz}".

Provide:
1. TOP 5 SUBREDDITS TO JOIN (relevant to this business type and location, with why each matters).
2. CONTENT STRATEGY — 3 specific value-first Reddit posts (title + 100-150 words each, non-promotional).
3. COMMENT TEMPLATES — 5 helpful 2-3 sentence templates that mention the business naturally at the end.
4. RULES TO FOLLOW — 3 specific Reddit rules to avoid getting banned.`;
      default:
        return `Generate specific, actionable content to help "${biz}" improve their AI visibility for the fix type: ${fixType}.

Provide ready-to-use content that they can implement immediately. Be specific to their business — not generic advice.`;
    }
  })();

  // Deterministic templates are complete — no LLM suffix needed
  if (fixType === 'crawler_access' || fixType === 'bing_places') {
    return body;
  }

  return body + marketContext;
}

export function buildSystemPrompt(
  industry: string,
  resolvedCountry: string,
): string {
  return `You generate business content for AI visibility fixes. Output ONLY the requested content — no commentary, no meta-instructions, no markdown wrappers.

${getIndustryContext(industry, resolvedCountry)}

Rules:
- Never fabricate business data (phone, address, coordinates, hours).
- Use placeholders: YOUR_PHONE, YOUR_ADDRESS, YOUR_BUSINESS_NAME, YOUR_CITY, YOUR_WEBSITE.
- If the business name looks like a search query (contains 'best', 'top', 'in [city]', 'near me'), use YOUR_BUSINESS_NAME instead.
- All content must be specific to this industry in this country.
- Never recommend US platforms for non-US businesses.`;
}
