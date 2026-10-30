import { validateNoFakeData, getFixMetadata } from "@/lib/fixQuality"
import type { NextRequest } from 'next/server';
import { guardAiRoute } from '@/lib/aiRouteGuard';

type FixType =
  | 'faq_schema'
  | 'meta_description'
  | 'local_business_schema'
  | 'title_tag'
  | 'h1_tag'
  | 'alt_tags'
  | 'google_business'
  | 'review_response'
  | 'page_speed'
  | 'website_content'
  | string

function detectSchemaType(businessType: string): string {
  const t = (businessType || '').toLowerCase();
  if (/dental|dentist|orthodont/.test(t)) return 'DentalClinic';
  if (/lawyer|legal|solicitor|attorney|law firm/.test(t)) return 'LegalService';
  if (/hvac|heating|cooling|air condition|furnace/.test(t)) return 'HomeAndConstructionBusiness';
  if (/plumb/.test(t)) return 'Plumber';
  if (/electric/.test(t)) return 'Electrician';
  if (/restaurant|cafe|diner|bistro|pizz|sushi|burger/.test(t)) return 'Restaurant';
  if (/doctor|medical|physician|clinic|urgent care/.test(t)) return 'MedicalClinic';
  if (/gym|fitness|crossfit|yoga|pilates/.test(t)) return 'ExerciseGym';
  if (/real estate|realtor|property/.test(t)) return 'RealEstateAgent';
  if (/vet|veterinar|animal|pet/.test(t)) return 'VeterinaryCare';
  if (/salon|hair|beauty|barber|nail/.test(t)) return 'HairSalon';
  if (/auto|car|vehicle|tire|mechanic/.test(t)) return 'AutoRepair';
  if (/hotel|motel|inn|lodg/.test(t)) return 'Hotel';
  if (/accountant|cpa|tax/.test(t)) return 'AccountingService';
  return 'LocalBusiness';
}

function buildPrompt(
  fixType: FixType,
  businessName: string,
  businessType: string,
  city: string,
  websiteUrl: string,
  currentContent: string
): { prompt: string; instructions: string; expectedImpact: string } {
  const biz  = businessName || 'the business'
  const type = businessType || 'local business'
  const loc  = city || 'your city'
  const url  = websiteUrl || 'your website'

  switch (fixType) {
    case 'faq_schema':
      return {
        prompt: `Generate a FAQPage JSON-LD schema for "${biz}", a ${type} in ${loc}.

CRITICAL: Only generate real, industry-specific FAQ questions. Do NOT use generic questions like "What services do you offer?" that apply to every business.

For a ${type} business, generate 5 highly specific FAQ questions and answers that patients/customers actually search for on Google and ChatGPT. Make the answers informative, 2-3 sentences each.

Return ONLY this JSON-LD in a <script> tag:

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "[specific question for ${type}]",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "[specific answer for ${biz} in ${loc}]"
      }
    }
  ]
}
</script>

Generate 5 questions. No markdown, no explanation.`,
        instructions: `1. Copy the entire <script> block above\n2. Open your website's HTML editor (or WordPress header plugin)\n3. Paste it just before the closing </head> tag\n4. Save and verify at: https://search.google.com/test/rich-results`,
        expectedImpact: `Gives AI platforms structured answers they can quote when customers ask questions about ${type} in ${loc}. Rankall's estimate for FAQ schema is shown on your fix queue; a rescan verifies the actual change.`,
      }

    case 'meta_description':
      return {
        prompt: `Write an optimized meta description for "${biz}", a ${type} in ${loc}.${currentContent ? `\n\nCurrent meta description: "${currentContent}"` : ''}

Requirements:
- Exactly 145–158 characters
- Include business name, city, and primary service
- Include a call to action
- Optimized for AI platform citation (not just click-through)
- Sound natural, not keyword-stuffed

Return ONLY the <meta> tag, ready to paste. No explanation.

Format:
<meta name="description" content="...">`,
        instructions: `1. Copy the <meta> tag above\n2. In your website's <head> section, find and replace the existing meta description (or add if missing)\n3. Save your changes`,
        expectedImpact: '+3–6 AI visibility points. Meta descriptions are read by all AI platforms to understand what your business does. A well-optimized description increases the chance of being cited in local queries.',
      }

    case 'local_business_schema': {
      const schemaType = detectSchemaType(type);
      return {
        prompt: `Generate a ${schemaType} JSON-LD schema TEMPLATE for "${biz}".

Website: ${url}

CRITICAL RULES — YOU MUST FOLLOW THESE:
- NEVER invent or fabricate addresses, phone numbers, coordinates, or any contact details
- NEVER make up street addresses, zip codes, or lat/lng values
- NEVER create fake hours or price ranges
- Use YOUR_* placeholders for ANY field you do not know with certainty
- Only use the real business name (${biz}) and the real URL (${url})
- The @type MUST be "${schemaType}" (the most specific Schema.org type for this business)

Return ONLY this exact <script> tag structure with YOUR_* placeholders for unknown fields:

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "${schemaType}",
  "name": "${biz}",
  "url": "${url}",
  "telephone": "YOUR_PHONE_NUMBER",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "YOUR_STREET_ADDRESS",
    "addressLocality": "YOUR_CITY",
    "addressRegion": "YOUR_STATE",
    "postalCode": "YOUR_ZIP_CODE",
    "addressCountry": "US"
  },
  "openingHoursSpecification": [],
  "sameAs": []
}
</script>

No explanation. No markdown. Return only the <script> block.`,
        instructions: `⚠️ Replace all YOUR_* placeholders with your real business information before publishing.\n\n1. Copy the entire <script> block above\n2. Replace YOUR_PHONE_NUMBER with your real phone\n3. Replace YOUR_STREET_ADDRESS, YOUR_CITY, YOUR_STATE, YOUR_ZIP_CODE with your real address\n4. Add your opening hours to the openingHoursSpecification array\n5. Add your social profile URLs to the sameAs array\n6. Paste before </head> in your website\n7. Validate at: https://search.google.com/test/rich-results`,
        expectedImpact: `+12–16 AI visibility points. ${schemaType} schema is read by all 12 AI platforms. Without it, AI cannot confidently include you in "best ${type} in ${loc}" recommendations.`,
      }
    }

    case 'title_tag':
      return {
        prompt: `Write an optimized title tag for "${biz}", a ${type} in ${loc}.${currentContent ? `\n\nCurrent title: "${currentContent}"` : ''}

Requirements:
- Maximum 60 characters (count carefully)
- Format: [Primary Service] | [Business Name] [City] — OR — [Business Name] — [Service] in [City]
- Include primary keyword for this business type
- Include ${loc}
- No clickbait, no ALL CAPS, no excessive punctuation

Return ONLY the <title> tag. No explanation.

Format:
<title>...</title>`,
        instructions: `1. Copy the <title> tag\n2. In your website's <head> section, replace the existing <title> tag\n3. The title appears in Google search results and is read by all AI platforms`,
        expectedImpact: '+3–6 AI visibility points. The title tag is the first thing AI platforms read to identify your business type and location.',
      }

    case 'h1_tag':
      return {
        prompt: `Write an optimized H1 heading for "${biz}", a ${type} in ${loc}.

Requirements:
- 5–10 words
- Include primary service type and ${loc}
- Sound like a real business headline, not an SEO keyword list
- Should be what a customer would expect to see as the main heading

Examples of good H1s:
- "Trusted Plumbers in Chicago — 24/7 Emergency Service"
- "Denver's Top-Rated Family Dentist"
- "Auto Repair in Austin You Can Actually Trust"

Return ONLY the <h1> tag. No explanation.

Format:
<h1>...</h1>`,
        instructions: `1. Copy the <h1> tag\n2. Replace the main heading on your homepage with this text\n3. There should be exactly one H1 per page`,
        expectedImpact: '+3–5 AI visibility points. AI platforms extract the H1 to understand your page topic and business category.',
      }

    case 'alt_tags':
      return {
        prompt: `Write optimized alt tag descriptions for images on "${biz}" website, a ${type} in ${loc}.

Generate 8 example alt tag descriptions for common images this type of business would have on their website. Make them descriptive, specific to ${type} in ${loc}, and naturally include relevant keywords.

Format as a ready-to-use reference:

Image: [what image is likely]
Alt text: [optimized alt text]

Then add a general rule at the bottom.`,
        instructions: `1. For each image on your website, add descriptive alt text using the examples above as a guide\n2. In HTML: <img src="photo.jpg" alt="[your description here]">\n3. In WordPress: click each image in Media Library and add description in the Alt Text field`,
        expectedImpact: '+3–5 AI visibility points. Alt text helps AI understand your visual content and confirms your business type and location.',
      }

    case 'google_business':
      return {
        prompt: `Write an optimized Google Business Profile description for "${biz}", a ${type} in ${loc}.

Requirements:
- Exactly 700–750 characters (count carefully — GBP has a 750 char limit)
- Include: business name, primary services, ${loc}, years in business (use "years of experience" if unknown), what makes them different
- Include natural mentions of what customers search for when looking for this type of business
- Include a call to action at the end
- Optimized for AI citation: write as factual statements, not marketing hype
- Do NOT use: hashtags, ALL CAPS, excessive exclamation points, URLs

Return ONLY the description text, no explanation, no character count label.`,
        instructions: `1. Go to Google Business Profile (business.google.com)\n2. Click Edit Profile → Business Information → Add Description\n3. Paste the text above\n4. Save. Changes appear within 24-48 hours.\n5. This description is read by ChatGPT, Gemini, and Perplexity when they look up your business`,
        expectedImpact: '+8–12 AI visibility points. Your GBP description is cited directly by AI platforms in local recommendation queries. This is one of the highest-ROI fixes available.',
      }

    case 'review_response':
    default:
      return {
        prompt: `Write 5 personalized, professional Google review response templates for "${biz}", a ${type} in ${loc}.

Include responses for:
1. Enthusiastic 5-star review (thank by name, reinforce the specific compliment)
2. 5-star review mentioning a specific service
3. 4-star review with a minor complaint (acknowledge, offer to make it right)
4. 3-star review (professional, non-defensive, solution-focused)
5. Follow-up message for a customer who came back after leaving a review

Format each response as:
**Template [number]: [Type]**
[Response text — 60-100 words, include [Customer Name] placeholder]

Make responses sound human, warm, and specific to ${type} in ${loc}. Each response should mention the business name and city naturally.`,
        instructions: `1. Copy each template\n2. In Google Business Profile, click Reviews → Reply\n3. Replace [Customer Name] with the reviewer's first name\n4. Personalize 1-2 sentences to reference their specific review\n5. Posting responses within 48 hours increases your AI trust score`,
        expectedImpact: '+4–8 AI visibility points. Review response rate is a top AI trust signal. Businesses that respond to reviews are 40% more likely to be recommended by ChatGPT and Gemini.',
      }
  }
}

export async function POST(request: NextRequest) {
  // Spends paid AI/search credits — it was unauthenticated. Signed-in users only, metered per user in the shared DB limiter.
  const guard = await guardAiRoute(request, { bucket: 'ai:seo-audit-fix', userLimit: 40 });
  if (!guard.ok) return guard.response;
  const body = await request.json()
  const {
    fix_type,
    business_name,
    business_type,
    city,
    website_url,
    current_content,
  } = body as {
    fix_type: FixType
    business_name: string
    business_type: string
    city: string
    website_url: string
    current_content?: string
  }

  if (!fix_type) return Response.json({ error: 'fix_type required' }, { status: 400 })

  const { prompt, instructions, expectedImpact } = buildPrompt(
    fix_type,
    business_name ?? '',
    business_type ?? '',
    city ?? '',
    website_url ?? '',
    current_content ?? ''
  )

  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!aiRes.ok) {
    const err = await aiRes.text()
    return Response.json({ error: `AI error: ${err}` }, { status: 500 })
  }

  const aiData = await aiRes.json()
  const generated_content: string = aiData.content?.[0]?.text ?? ''

  const validation = validateNoFakeData(generated_content)
  const meta = getFixMetadata(fix_type)

  return Response.json({
    success: true,
    fix_type,
    generated_content,
    instructions,
    expected_impact: expectedImpact,
    metadata: {
      fixType: fix_type,
      businessName: business_name,
      estimatedImpact: meta.estimatedImpact,
      difficulty: meta.difficulty,
      timeToImplement: meta.timeToImplement,
      howToVerify: meta.howToVerify,
      relatedSignals: meta.relatedSignals,
      containsPlaceholders: generated_content.includes('YOUR_'),
      generatedAt: new Date().toISOString(),
    },
    warning: validation.valid ? undefined : '⚠️ Review this content before using — it may contain placeholder data that needs updating.',
    validationIssues: validation.valid ? undefined : validation.issues,
  })
}
