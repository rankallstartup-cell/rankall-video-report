// lib/fixQuality.ts
// Quality standards for every Fix Engine output: metadata (impact/difficulty/
// verify steps/related signals), industry + country prompt context, and a
// fabricated-data guard. Pure/deterministic — safe to import anywhere.

export interface FixOutput {
  title: string;
  whatThisFixes: string;
  whyItMatters: string;
  estimatedImpact: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  timeToImplement: string;
  generatedContent: string;
  howToVerify: string;
  relatedSignals: string[];
  placeholders: string[];
}

export const FIX_METADATA: Record<string, Partial<FixOutput>> = {
  faq_schema: {
    whatThisFixes: 'Missing FAQ structured data on your website',
    whyItMatters: 'ChatGPT and Gemini pull FAQ answers directly from FAQPage markup. Businesses with it give AI a citable answer to quote.',
    estimatedImpact: '+6 to +10 points', difficulty: 'Easy', timeToImplement: '20-30 minutes',
    howToVerify: 'After adding the code, use Google Rich Results Test at search.google.com/test/rich-results to verify FAQ markup is detected.',
    relatedSignals: ['AI-Friendly FAQ on Website', 'Business Data Markup'],
  },
  local_business_schema: {
    whatThisFixes: 'Missing LocalBusiness structured data markup',
    whyItMatters: 'AI platforms often skip businesses they cannot verify when answering "who should I call?" queries.',
    estimatedImpact: '+8 to +12 points', difficulty: 'Easy', timeToImplement: '15-20 minutes',
    howToVerify: 'Use Google Rich Results Test and the Schema Markup Validator at validator.schema.org.',
    relatedSignals: ['Business Data Markup', 'Phone number on page', 'Address on page'],
  },
  review_response: {
    whatThisFixes: 'Unanswered customer reviews reducing AI trust score',
    whyItMatters: 'AI platforms treat unanswered reviews as a sign of an inactive business. Responding to reviews signals an active, attentive business.',
    estimatedImpact: '+4 to +7 points', difficulty: 'Easy', timeToImplement: '10 minutes per week',
    howToVerify: 'Check your Google Business Profile review response rate. Aim for 100% within 48 hours.',
    relatedSignals: ['Review Response Rate', 'Review mentions', 'Rating mentions'],
  },
  reddit_contribution: {
    whatThisFixes: 'Missing community presence in the AI citation pool',
    whyItMatters: 'ChatGPT trains on Reddit. Businesses mentioned in relevant subreddits appear in AI answers far more often.',
    estimatedImpact: '+3 to +5 points', difficulty: 'Medium', timeToImplement: '30 minutes',
    howToVerify: 'Search your business name on Reddit after 2 weeks.',
    relatedSignals: ['Reddit Mentions', 'Online Forum Mentions'],
  },
  content_optimizer: {
    whatThisFixes: 'Weak or missing page titles, meta descriptions, and on-page signals',
    whyItMatters: 'AI platforms read meta data to understand your business before recommending it.',
    estimatedImpact: '+4 to +8 points', difficulty: 'Easy', timeToImplement: '30-60 minutes',
    howToVerify: 'Check title and meta using browser dev tools (F12) or a tool like Screaming Frog.',
    relatedSignals: ['Meta description', 'Title tag', 'H1 tag', 'Open Graph tags'],
  },
  citation_finder: {
    whatThisFixes: 'Inconsistent or missing business citations across directories',
    whyItMatters: 'AI platforms verify businesses by checking citation consistency across multiple sources. Inconsistent NAP = lower trust.',
    estimatedImpact: '+5 to +8 points', difficulty: 'Medium', timeToImplement: '2-4 hours',
    howToVerify: 'Use Moz Local or BrightLocal citation checker after submitting listings.',
    relatedSignals: ['Directory listings', 'Google Business', 'BBB'],
  },
  knowledge_panel: {
    whatThisFixes: 'Missing Google Knowledge Panel entity verification',
    whyItMatters: 'Knowledge Panels tell AI platforms you are a verified real entity, which helps them recommend you with confidence.',
    estimatedImpact: '+20 to +25 points', difficulty: 'Hard', timeToImplement: '2-3 hours setup (Google decides if and when a panel appears)',
    howToVerify: 'Search your business name on Google. The panel should appear on the right side of results.',
    relatedSignals: ['Google Knowledge Panel', 'Business Data Markup'],
  },
  gbp_optimizer: {
    whatThisFixes: 'Incomplete Google Business Profile',
    whyItMatters: 'Google Business Profile is a key signal AI platforms use for local business recommendations.',
    estimatedImpact: '+8 to +12 points', difficulty: 'Easy', timeToImplement: '45-60 minutes',
    howToVerify: 'Search your business name on Google Maps. The profile should show complete info with photos.',
    relatedSignals: ['Google Business', 'Review mentions', 'Rating mentions'],
  },
};

// Allow common alias fix-type keys to resolve to the same metadata.
const FIX_ALIASES: Record<string, string> = {
  faq: 'faq_schema',
  jsonld: 'local_business_schema',
  schema: 'local_business_schema',
  review: 'review_response',
  reviews: 'review_response',
  reddit: 'reddit_contribution',
  content: 'content_optimizer',
  citations: 'citation_finder',
  directory: 'citation_finder',
  knowledge: 'knowledge_panel',
  gbp: 'gbp_optimizer',
  // Simulator / homepage fix-type names for the same fixes.
  directory_citations: 'citation_finder',
  review_velocity: 'review_response',
  content_optimization: 'content_optimizer',
  website_content: 'content_optimizer',
  google_business: 'gbp_optimizer',
};

export function getFixMetadata(fixType: string): Partial<FixOutput> {
  const key = FIX_METADATA[fixType] ? fixType : (FIX_ALIASES[fixType] ?? fixType);
  return FIX_METADATA[key] ?? {};
}

// ── Industry + country prompt context ──────────────────────────────────────
const INDUSTRY_CONTEXT: Record<string, string> = {
  dentist: 'This is a dental practice. Key services: cleanings, fillings, crowns, implants, whitening, orthodontics, emergency dental. Key AI queries: best dentist, emergency dentist, dental implants, teeth whitening, family dentist. Credentials: DDS, DMD, board certified, ADA member.',
  lawyer: 'This is a law firm or attorney. Practice areas: personal injury, family law, criminal defense, immigration, estate planning, business law. Key AI queries: best lawyer, attorney near me, free consultation. Credentials: bar admission, years experience, case results.',
  hvac: 'This is an HVAC company. Services: AC repair, heating, installation, maintenance, emergency. Key AI queries: HVAC repair, AC not working, furnace repair, emergency HVAC. Credentials: NATE certified, EPA licensed, insured.',
  restaurant: 'This is a restaurant. Aspects: cuisine type, ambiance, dietary options, reservations, delivery, catering. Key AI queries: best restaurant, restaurants near me, Italian food, date night dinner.',
  medical: 'This is a medical practice or clinic. Specialties: primary care, pediatrics, specialists, urgent care. Key AI queries: doctor near me, primary care physician, specialist. Credentials: MD, DO, board certified, hospital affiliations.',
  real_estate: 'This is a real estate agent or agency. Services: buying, selling, rentals, commercial, investment. Key AI queries: real estate agent, homes for sale, sell my house, realtor near me. Credentials: licensed realtor, years in market, sales volume.',
  gym: 'This is a gym or fitness center. Services: weights, cardio, classes, personal training, nutrition coaching. Key AI queries: gym near me, fitness center, personal trainer, yoga classes.',
  salon: 'This is a hair salon or spa. Services: haircuts, color, styling, treatments, nails, massage, facials. Key AI queries: hair salon near me, hair color, best salon, spa day.',
  plumber: 'This is a plumbing company. Services: emergency plumbing, drain cleaning, pipe repair, water heater, leak detection. Key AI queries: plumber near me, emergency plumber, drain clog. Credentials: licensed plumber, insured, 24/7 service.',
  electrician: 'This is an electrical contractor. Services: wiring, panel upgrades, EV charger, lighting, emergency. Key AI queries: electrician near me, emergency electrician, panel upgrade. Credentials: licensed electrician, insured, permits pulled.',
};

export function getCountrySpecificContext(industry: string, countryCode: string): string {
  switch (countryCode) {
    case 'GB':
      return ' UK-SPECIFIC: Trust sources: NHS (medical), CQC (care quality), Law Society (legal), Which?, Trustpilot, Checkatrade (trades). Only reference these UK platforms — never reference US-only platforms. Use UK spelling. Reference GDPR compliance.';
    case 'IN':
      return ' INDIA-SPECIFIC: Trust sources: Practo (medical), JustDial, Sulekha, IndiaMART. Payment: UPI/online options. Mention Hindi/regional language support if applicable. Only reference these India platforms — never reference US-only platforms.';
    case 'AU':
      return ' AUSTRALIA-SPECIFIC: Trust sources: HealthEngine (medical), hipages (trades), TrueLocal, Houzz, ServiceSeeking. Mention Medicare bulk billing (medical), HIA membership (trades). Only reference these Australian platforms — never reference US-only platforms.';
    case 'CA':
      return ' CANADA-SPECIFIC: Trust sources: RateMDs (medical), HomeStars (trades), Houzz. Mention provincial licensing, OHIP (Ontario medical).';
    default:
      return ' US-SPECIFIC: Trust sources: Google Business, Yelp, Healthgrades (medical), Zocdoc (medical), BBB, HomeAdvisor (trades), Avvo (legal).';
  }
}

export function getIndustryContext(industry: string, countryCode: string): string {
  const i = (industry || '').toLowerCase();
  let base = `This is a ${industry || 'local'} business.`;
  for (const key of Object.keys(INDUSTRY_CONTEXT)) {
    if (i.includes(key) || (key === 'dentist' && i.includes('dent')) || (key === 'lawyer' && (i.includes('law') || i.includes('legal'))) || (key === 'medical' && (i.includes('doctor') || i.includes('clinic')))) {
      base = INDUSTRY_CONTEXT[key];
      break;
    }
  }
  return base + getCountrySpecificContext(industry, countryCode);
}

// Correct schema.org @type per industry.
export function detectSchemaType(industry: string): string {
  const i = (industry || '').toLowerCase();
  if (i.includes('dent')) return 'DentalClinic';
  if (i.includes('law') || i.includes('legal') || i.includes('attorney')) return 'LegalService';
  if (i.includes('hvac') || i.includes('heat') || i.includes('cool') || i.includes('plumb') || i.includes('electric') || i.includes('construct') || i.includes('contractor')) return 'HomeAndConstructionBusiness';
  if (i.includes('restaurant') || i.includes('cafe') || i.includes('food')) return 'Restaurant';
  if (i.includes('medical') || i.includes('doctor') || i.includes('clinic') || i.includes('physician')) return 'MedicalClinic';
  if (i.includes('gym') || i.includes('fitness')) return 'ExerciseGym';
  if (i.includes('salon') || i.includes('hair') || i.includes('spa')) return 'HairSalon';
  return 'LocalBusiness';
}

// ── Fabricated-data guard ──────────────────────────────────────────────────
export function validateNoFakeData(content: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const c = content || '';

  const fakePhones = ['555-0', '555-1', '555-2', '(555)', '+1-555', '555-555'];
  if (fakePhones.some((p) => c.includes(p))) issues.push('Contains a fake phone number');

  const fakeStreets = ['123 Main St', '456 Oak Ave', 'Lincoln Ave', 'Insurance Plaza', '789 Elm'];
  if (fakeStreets.some((a) => c.includes(a))) issues.push('Contains a fabricated address');

  // Hardcoded coordinates that aren't placeholders.
  if ((/"latitude"\s*:\s*[0-9]/.test(c) || /"longitude"\s*:\s*-?[0-9]/.test(c)) && !c.includes('YOUR_')) {
    issues.push('Contains hardcoded coordinates');
  }

  return { valid: issues.length === 0, issues };
}
