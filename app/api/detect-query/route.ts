import { NextRequest, NextResponse } from 'next/server';
import { detectPersonalProIntent } from '@/lib/queries';
import { inferCountryFromText, resolveCountryFromRequest } from '@/lib/countryConfig';
import { lookupGooglePlace, extractSpecialtySignal } from '@/lib/enrichment';
import { resolveCategory, categoriesInSector, findCategoryByQueryTerm, CATEGORIES, type CategoryConfidence } from '@/lib/categories';

export const dynamic = 'force-dynamic';

export type QueryIntent =
  | 'LOCAL_PRO'
  | 'PERSONAL_PRO'
  | 'PRODUCT_PRO'
  | 'GLOBAL_BRAND'
  | 'GOVERNMENT'
  | 'UNKNOWN';

const ROUTE_FOR_INTENT: Record<QueryIntent, string> = {
  LOCAL_PRO: '/api/scan',
  PERSONAL_PRO: '/api/scan-personal',
  PRODUCT_PRO: 'waitlist',
  GLOBAL_BRAND: 'waitlist',
  GOVERNMENT: 'waitlist',
  UNKNOWN: '/api/scan',
};

export async function POST(req: NextRequest) {
  let input: string | undefined;
  let businessName: string | undefined;
  let city: string | undefined;
  try {
    ({ input, businessName, city } = await req.json());
  } catch {
    return NextResponse.json({
      intent: 'UNKNOWN', route: '/api/scan', customerQuery: '',
      isBusinessName: false, isPersonalPro: false,
    });
  }
  if (!input) {
    return NextResponse.json({
      intent: 'UNKNOWN', route: '/api/scan', customerQuery: input,
      isBusinessName: false, isPersonalPro: false,
    });
  }

  const inferred = inferCountryFromText('', input);
  const countryCode = inferred || resolveCountryFromRequest(req.headers);

  let placesTypes: string[] | null = null;
  let placeWebsite: string | null = null;
  let placePhone: string | null = null;
  let placeAddress: string | null = null;
  // Ticket 7: set when the two_caps Places tiebreaker positively identified
  // a business listing. Callers (homepage Professional mode) must respect
  // this — a firm must route to Local Pro, never be scored as a person.
  let tiebreakerRoutedToBusiness = false;

  const personal = detectPersonalProIntent(input);
  if (personal.isPersonal) {
    if (personal.rule === 'two_caps') {
      const placesResult = await lookupGooglePlace(personal.name, personal.location);
      console.log('[detect-query] Places tiebreaker:', { input, name: personal.name, location: personal.location, hasListing: placesResult.hasListing, placeTypes: placesResult.placeTypes, rule: personal.rule });
      if (placesResult.hasListing) {
        placesTypes = placesResult.placeTypes;
        placeWebsite = placesResult.placeWebsite;
        placePhone = placesResult.placePhone;
        placeAddress = placesResult.placeAddress;
        tiebreakerRoutedToBusiness = true;
        console.log('[detect-query] routed to LOCAL_PRO via Places tiebreaker, types:', placesTypes);
      } else {
        console.log('[detect-query] routed to PERSONAL_PRO via Places tiebreaker (no listing)');
        return NextResponse.json({
          intent: 'PERSONAL_PRO',
          route: ROUTE_FOR_INTENT.PERSONAL_PRO,
          isBusinessName: false,
          isPersonalPro: true,
          entity_name: personal.name,
          category: personal.specialty,
          location_text: personal.location,
          personName: personal.name,
          specialty: personal.specialty,
          location: personal.location,
          country_code: countryCode,
          customerQuery: input,
        });
      }
    } else {
      console.log('[detect-query] routed to PERSONAL_PRO via rule:', personal.rule);
      return NextResponse.json({
        intent: 'PERSONAL_PRO',
        route: ROUTE_FOR_INTENT.PERSONAL_PRO,
        isBusinessName: false,
        isPersonalPro: true,
        entity_name: personal.name,
        category: personal.specialty,
        location_text: personal.location,
        personName: personal.name,
        specialty: personal.specialty,
        location: personal.location,
        country_code: countryCode,
        customerQuery: input,
      });
    }
  }

  // For non-personal inputs that aren't obviously category searches, try Places
  // to get types + website for category resolution before Haiku.
  const looksLikeCategorySearch = /^(best|top|find|recommended|affordable|cheap|near)\b/i.test(input.trim())
    || /\bnear\s+me\b/i.test(input);
  if (!placesTypes && !looksLikeCategorySearch) {
    const placesName = businessName || input;
    const placesLocation = city || '';
    const placesResult = await lookupGooglePlace(placesName, placesLocation);
    if (placesResult.hasListing) {
      placesTypes = placesResult.placeTypes;
      placeWebsite = placesResult.placeWebsite;
      placePhone = placesResult.placePhone;
      placeAddress = placesResult.placeAddress;
      console.log('[detect-query] Places lookup for non-personal input:', { input, placeTypes: placesTypes, placeWebsite, placeAddress });
    }
  }

  // ── Category resolution from signals (before Haiku) ──────────────────────
  let resolvedSlug: string | null = null;
  let resolvedQueryTerm: string | null = null;
  let categoryConfidence: CategoryConfidence | null = null;
  let websiteSignalText: string | null = null;

  if (placesTypes) {
    if (placeWebsite) {
      websiteSignalText = await extractSpecialtySignal(placeWebsite);
    }
    const resolved = resolveCategory(placesTypes, websiteSignalText, countryCode, businessName || input);
    console.log('[detect-query] resolveCategory result:', { resolved: resolved ? { slug: resolved.slug, queryTerm: resolved.entry.queryTerm, confidence: resolved.confidence } : null, placesTypes });
    if (resolved) {
      resolvedSlug = resolved.slug;
      resolvedQueryTerm = resolved.entry.queryTerm;
      categoryConfidence = resolved.confidence;
    }
  }



  // ── Build Haiku prompt with category constraints ─────────────────────────
  let categoryConstraint = '';
  if (resolvedQueryTerm && categoryConfidence !== 'sector_fallback') {
    categoryConstraint = `\nThe business category has been determined from their website: "${resolvedQueryTerm}". Use this EXACT category in your response — do not override it.\n`;
  } else if (resolvedQueryTerm && categoryConfidence === 'sector_fallback') {
    const sectorName = resolvedSlug ? CATEGORIES[resolvedSlug]?.sector : null;
    if (sectorName) {
      const options = categoriesInSector(sectorName, countryCode);
      const optionTerms = options.map(c => c.queryTerm).join(', ');
      categoryConstraint = `\nGoogle Places identifies this as a ${sectorName} business. The category MUST be one of: ${optionTerms}. Pick the most specific one based on the business name or your knowledge. If unsure, use "${resolvedQueryTerm}".\n`;
    }
  } else if (placesTypes) {
    categoryConstraint = `\nGoogle Places classifies this business as: ${placesTypes.join(', ')}. This CONSTRAINS the domain — do NOT guess a different industry from the business name (e.g. "Power" does NOT mean electrical). Within that domain, determine the specific sub-specialty from the business name or your knowledge of the business. If you cannot determine the sub-specialty, use the Places type as-is.\n`;
  }

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
        max_tokens: 250,
        messages: [{
          role: 'user',
          content: `Classify this search input into exactly one intent: "${input}"

Intents:
- LOCAL_PRO: a local business/service search, e.g. "best dentist Chicago IL", "top HVAC Birmingham UK", "best doctor Bandra Mumbai". Also a single local business name like "Hoco Indian Kitchen Schaumburg" or "Clifford Law Offices Chicago".
- PERSONAL_PRO: a named individual professional, optionally with specialty, e.g. "Dr Sarah Johnson cardiologist", "Coach Mike Lee".
- PRODUCT_PRO: a product or app, e.g. "Nike shoes", "Notion app".
- GLOBAL_BRAND: a large multi-location brand, e.g. "McDonald's India", "Starbucks".
- GOVERNMENT: a public/government service, e.g. "NHS dental London", "DMV appointment".
- UNKNOWN: anything that doesn't fit — default to LOCAL_PRO behaviour.

If it is a single business NAME rather than a customer search query, set isBusinessName to true and generate the customer search query a stranger would type (e.g. "best personal injury lawyer in Chicago IL").

IMPORTANT for category: return what a CUSTOMER would search for, not what the business calls itself. The category must be a term real people type into search bars.
- "Chicago Dental Studio" → "dentist" (NOT "dental studio" — customers search for dentists)
- "Clifford Law Offices" → "personal injury lawyer" (NOT "law firm")
- "Bright Smile Pediatric Dentistry" → "pediatric dentist"
- "Kim's Korean BBQ" → "Korean BBQ restaurant"
- "Greenfield Family Medicine" → "family doctor"
- "Apex Commercial Roofing" → "commercial roofer"
If the business name contains a niche branding term (studio, boutique, collective, hub, lab), ignore it — return the generic service type customers actually search for.
If the category CANNOT be confidently determined from the business name or your knowledge, return null. Do NOT guess from words in the business name.
${categoryConstraint}
Respond in JSON only:
{
  "intent": "LOCAL_PRO|PERSONAL_PRO|PRODUCT_PRO|GLOBAL_BRAND|GOVERNMENT|UNKNOWN",
  "entity_name": "the business/person/product/brand name if present, else null",
  "category": "specific practice area or specialty, e.g. personal injury lawyer, pediatric dentist, Korean BBQ restaurant",
  "location_text": "City, ST or City, Country if present, else null",
  "isBusinessName": true/false,
  "customerQuery": "best [specific type] in [city] — the query a customer would use",
  "language": "ISO 639-1 code, e.g. en",
  "confidence": 0.0-1.0,
  "reasoning": "one short sentence"
}`,
        }],
      }),
    });

    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      // When Places already decided this is a business (hasListing=true),
      // lock intent to LOCAL_PRO — Haiku only provides category/customerQuery.
      const intent: QueryIntent = placesTypes
        ? 'LOCAL_PRO'
        : (ROUTE_FOR_INTENT as any)[parsed.intent]
          ? parsed.intent
          : 'LOCAL_PRO';

      // Override Haiku's category with the resolved one when we have high confidence
      if (resolvedQueryTerm && categoryConfidence !== 'sector_fallback') {
        parsed.category = resolvedQueryTerm;
        if (parsed.location_text) {
          parsed.customerQuery = `best ${resolvedQueryTerm} in ${parsed.location_text}`;
        }
      } else if (resolvedQueryTerm && categoryConfidence === 'sector_fallback') {
        // Sector fallback — Haiku's unconstrained answer may be better.
        // Try a global lookup on Haiku's category before falling back to
        // the sector-constrained pick.
        const haikuGlobal = parsed.category
          ? findCategoryByQueryTerm(parsed.category, countryCode)
          : null;
        if (haikuGlobal) {
          resolvedSlug = haikuGlobal.slug;
          resolvedQueryTerm = haikuGlobal.entry.queryTerm;
          categoryConfidence = 'haiku_global';
          parsed.category = haikuGlobal.entry.queryTerm;
        } else {
          // Haiku had the constrained list — check if it picked a valid entry
          const sectorName = resolvedSlug ? CATEGORIES[resolvedSlug]?.sector : null;
          if (sectorName && parsed.category) {
            const haikuMatch = Object.values(CATEGORIES).find(
              c => c.sector === sectorName &&
                   c.queryTerm.toLowerCase() === parsed.category.toLowerCase(),
            );
            if (haikuMatch) {
              const matchSlug = Object.entries(CATEGORIES).find(([, v]) => v === haikuMatch)?.[0];
              resolvedSlug = matchSlug ?? resolvedSlug;
              categoryConfidence = 'haiku_constrained';
            } else {
              parsed.category = resolvedQueryTerm;
            }
          }
        }
        if (parsed.location_text && parsed.category) {
          parsed.customerQuery = `best ${parsed.category} in ${parsed.location_text}`;
        }
      }


      const locCountry = inferCountryFromText(parsed.location_text || '', input);
      return NextResponse.json({
        ...parsed,
        intent,
        route: ROUTE_FOR_INTENT[intent],
        country_code: locCountry || countryCode,
        isPersonalPro: false,
        resolved_category: resolvedSlug,
        category_confidence: categoryConfidence,
        place_website: placeWebsite,
        place_phone: placePhone,
        place_address: placeAddress,
        // Ticket 7: true when the Places tiebreaker identified a business.
        places_tiebreaker_business: tiebreakerRoutedToBusiness,
      });
    }
  } catch (e) {
    console.error('detect-query error:', e);
  }

  return NextResponse.json({
    intent: 'LOCAL_PRO',
    route: ROUTE_FOR_INTENT.LOCAL_PRO,
    isBusinessName: false,
    isPersonalPro: false,
    country_code: countryCode,
    customerQuery: input,
    // Ticket 7: true when the Places tiebreaker identified a business.
    places_tiebreaker_business: tiebreakerRoutedToBusiness,
  });
}
