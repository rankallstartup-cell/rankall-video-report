// lib/trustSignals.ts
// Canonical definition of all 35 trust signals: specific copy, correct fix-tool
// routing, impact points (for prioritization), and country/industry applicability
// (so US users never see NHS, UK users never see Healthgrades, etc.).
//
// fixEngineUrl uses the signal label as the ?signal= param — getToolIdForSignal
// (in app/dashboard/fix/page.tsx) maps that label to relatedFixTool.

export type SignalCategory = 'Technical' | 'Directory' | 'Review' | 'Community' | 'Entity' | 'Content';
export type ImpactLevel = 'High' | 'Medium' | 'Low';

export interface TrustSignalDef {
  id: string;
  label: string;
  category: SignalCategory;
  impactLevel: ImpactLevel;
  impactPoints: number;
  whatItMeans: string;
  whyItMatters: string;
  quickAction: string;
  maintenanceTip: string;
  relatedFixTool: string;
  fixEngineUrl: string;
  countriesApplicable: string[] | 'all';
  industriesApplicable: string[] | 'all';
  // When set, THIS predicate decides industry applicability (whole-word,
  // shared with detection) instead of the industriesApplicable list.
  industryFilter?: (industry: string) => boolean;
}

const url = (label: string) => `/dashboard/fix?signal=${encodeURIComponent(label)}`;

// ax88: THE definition of "human-healthcare provider industry" —
// the single source of truth used by BOTH the catalog
// (signalsForCountry, via the healthgrades def's industryFilter) AND
// detection (isMedicalIndustry in trust.ts), so a signal is never
// scored on the report page but hidden on the dashboard (or vice versa).
// Human-healthcare only: vets are NOT on Healthgrades/Zocdoc/RateMDs,
// and neither are pharmacies or med-spas.
//
// ax88 residual: matching is WHOLE-WORD. The old substring tokens
// matched inside unrelated words — 'dent' in "accident lawyer",
// 'nurse' in "plant nursery", 'counsel' in "legal counsel" — so a
// personal-injury lawyer got medical directories.
// Industry KEYS from lib/industry-config detectIndustry (exact match).
const MEDICAL_INDUSTRY_KEYS = new Set([
  'dentist', 'doctor', 'specialist', 'chiropractor', 'therapist', 'physicaltherapy', 'optometrist',
]);
const MEDICAL_INDUSTRY_WORDS = /\b(?:dentists?|dental|dentistry|orthodont(?:ist|ists|ics)|periodont(?:ist|ists|ics)|endodont(?:ist|ists|ics)|doctors?|physicians?|gp|general practitioners?|primary care|chiropract(?:or|ors|ic)|medical|healthcare|optometr(?:ist|ists|y)|ophthalmolog(?:ist|ists|y)|eye doctors?|dermatolog(?:ist|ists|y)|pa?ediatric(?:s|ian|ians)?|therapists?|psychotherapists?|physiotherap(?:ist|ists|y)|physio|physical therap(?:y|ist|ists)|orthopa?edic(?:s)?|cardiolog(?:ist|ists|y)|oncolog(?:ist|ists|y)|neurolog(?:ist|ists|y)|psycholog(?:ist|ists|y)|psychiatr(?:ist|ists|y)|counsell?(?:or|ors|ing)|mental health|hospitals?|urgent care|surgeons?|surgery|surgeries|nurses?|nursing|podiatr(?:ist|ists|y)|audiolog(?:ist|ists|y)|gyn(?:a)?ecolog(?:ist|ists|y)|obgyn|urolog(?:ist|ists|y)|gastroenterolog(?:ist|ists|y)|specialist (?:doctor|physician)s?)\b/i;
// Contexts that are NOT human healthcare even when a medical word appears.
const NON_HUMAN_HEALTHCARE = /\b(?:vets?|veterinar(?:y|ian|ians)|animal|pets?|tree surgeons?|tree surgery|massage)\b/i;
// Descriptive list (catalog/QA display only — matching uses isMedicalIndustryName).
export const MEDICAL_INDUSTRY_TOKENS = [
  'dentist', 'doctor', 'chiropractor', 'medical', 'healthcare', 'optometrist',
  'dermatologist', 'pediatrician', 'therapist', 'physiotherapist', 'orthopedic', 'cardiologist',
  'oncologist', 'neurologist', 'psychologist', 'counselor', 'hospital', 'urgent care', 'surgeon', 'nurse',
  'specialist',
];

// ax89: 'general' (detectIndustry's fallback) and similar placeholders
// mean "unclassified", NOT a known non-medical industry. Treating them
// as known hid Healthgrades/Avvo for every unclassified business.
const UNKNOWN_INDUSTRY_VALUES = new Set(['', 'general', 'unknown', 'other', 'none', 'n/a', 'business']);
export function isKnownIndustry(industry: string | undefined | null): boolean {
  if (!industry) return false;
  return !UNKNOWN_INDUSTRY_VALUES.has(industry.trim().toLowerCase());
}

export function isMedicalIndustryName(industry: string | undefined | null): boolean {
  if (!industry) return false;
  const ind = industry.trim().toLowerCase();
  if (MEDICAL_INDUSTRY_KEYS.has(ind)) return true;
  if (NON_HUMAN_HEALTHCARE.test(ind)) return false;
  return MEDICAL_INDUSTRY_WORDS.test(ind);
}

const LEGAL_INDUSTRY_WORDS = /\b(?:law|laws|lawyers?|attorneys?|legal|solicitors?|barristers?|law firms?|advocates?)\b/i;
const NON_LEGAL_CONTEXT = /\b(?:lawn|lawns)\b/i;
export function isLegalIndustryName(industry: string | undefined | null): boolean {
  if (!industry) return false;
  const ind = industry.trim().toLowerCase();
  if (ind === 'lawyer') return true;
  if (NON_LEGAL_CONTEXT.test(ind) && !/\b(?:lawyers?|attorneys?|solicitors?)\b/i.test(ind)) return false;
  return LEGAL_INDUSTRY_WORDS.test(ind);
}

export const TRUST_SIGNALS: Record<string, TrustSignalDef> = {
  faq_schema: { id: 'faq_schema', label: 'AI-Friendly FAQ on Website', category: 'Technical', impactLevel: 'High', impactPoints: 10,
    whatItMeans: 'A structured FAQ code block on your website that lets AI platforms read your most common questions and answers directly.',
    whyItMatters: 'ChatGPT and Gemini pull FAQ answers directly from FAQPage markup. Businesses with this are cited more often in AI responses.',
    quickAction: 'Add a FAQ section to your homepage with FAQPage JSON-LD schema. Generate the exact code using the Fix Engine below.',
    maintenanceTip: 'Update FAQ questions quarterly with new customer questions.', relatedFixTool: 'faq', fixEngineUrl: url('AI-Friendly FAQ on Website'), countriesApplicable: 'all', industriesApplicable: 'all' },
  business_data_markup: { id: 'business_data_markup', label: 'Business Data Markup', category: 'Technical', impactLevel: 'High', impactPoints: 12,
    whatItMeans: 'Hidden JSON-LD code on your website that tells AI your exact business name, address, phone, hours, and services.',
    whyItMatters: 'AI platforms often skip businesses without structured data when answering "who should I call?" queries.',
    quickAction: 'Add LocalBusiness JSON-LD to your homepage head tag. Takes 15 minutes. Generate the exact code in the Fix Engine.',
    maintenanceTip: 'Update schema when hours, address, or services change.', relatedFixTool: 'schema', fixEngineUrl: url('Business Data Markup'), countriesApplicable: 'all', industriesApplicable: 'all' },
  https_secure: { id: 'https_secure', label: 'Secure Website (HTTPS)', category: 'Technical', impactLevel: 'Medium', impactPoints: 5,
    whatItMeans: 'Whether your website uses an encrypted HTTPS connection shown by the padlock in the browser.',
    whyItMatters: 'Google AI and Perplexity apply a trust penalty to HTTP sites. AI rarely recommends insecure websites.',
    quickAction: "Contact your web host and enable an SSL/TLS certificate. Free via Let's Encrypt. Usually one click in the hosting dashboard.",
    maintenanceTip: 'Check SSL expiry monthly. Most auto-renew but verify.', relatedFixTool: 'content', fixEngineUrl: url('Secure Website (HTTPS)'), countriesApplicable: 'all', industriesApplicable: 'all' },
  meta_description: { id: 'meta_description', label: 'Meta Description', category: 'Content', impactLevel: 'Medium', impactPoints: 5,
    whatItMeans: 'The 155-160 character summary of your page that appears in search results and is read by AI to understand your business.',
    whyItMatters: 'AI platforms use meta descriptions to quickly understand what your business offers and whether it matches a search query.',
    quickAction: 'Write a 155-160 char meta description including your service, city, and a CTA. Generate one in the Fix Engine.',
    maintenanceTip: 'Review meta description every 6 months for relevance.', relatedFixTool: 'content', fixEngineUrl: url('Meta description'), countriesApplicable: 'all', industriesApplicable: 'all' },
  open_graph: { id: 'open_graph', label: 'Open Graph Tags', category: 'Technical', impactLevel: 'Medium', impactPoints: 4,
    whatItMeans: 'Meta tags that control how your website appears when shared on social media and read by AI.',
    whyItMatters: 'Open Graph data helps AI understand your business identity and increases click-through when your site appears in AI results.',
    quickAction: 'Add og:title, og:description, og:image to your homepage head. Generate tags in the Fix Engine.',
    maintenanceTip: 'Update OG image when rebranding or running seasonal campaigns.', relatedFixTool: 'content', fixEngineUrl: url('Open Graph tags'), countriesApplicable: 'all', industriesApplicable: 'all' },
  twitter_card: { id: 'twitter_card', label: 'Twitter/X Preview Card', category: 'Technical', impactLevel: 'Low', impactPoints: 2,
    whatItMeans: 'Meta tags that control how your website appears when shared on Twitter/X with a rich card preview.',
    whyItMatters: 'Rich previews make your links look complete and maintained when they are shared.',
    quickAction: 'Add twitter:card, twitter:title, twitter:description meta tags. Generate in the Fix Engine.',
    maintenanceTip: 'Twitter cards rarely need updating once set.', relatedFixTool: 'content', fixEngineUrl: url('Twitter/X Preview Card'), countriesApplicable: 'all', industriesApplicable: 'all' },
  canonical_url: { id: 'canonical_url', label: 'Preferred Page Address', category: 'Technical', impactLevel: 'Medium', impactPoints: 3,
    whatItMeans: 'A tag telling search engines which URL is the official version of your page, preventing duplicate content issues.',
    whyItMatters: 'Without canonical tags, AI may index multiple versions of your URL and dilute your trust signals across them.',
    quickAction: 'Add <link rel="canonical" href="https://yourdomain.com"> to your homepage head section.',
    maintenanceTip: 'Verify canonical on all key pages, not just the homepage.', relatedFixTool: 'content', fixEngineUrl: url('Canonical URL'), countriesApplicable: 'all', industriesApplicable: 'all' },
  h1_tag: { id: 'h1_tag', label: 'H1 Heading Tag', category: 'Content', impactLevel: 'Medium', impactPoints: 4,
    whatItMeans: 'The main heading on your webpage that AI reads first to understand what your business does and where you are located.',
    whyItMatters: 'Businesses with city and service in their H1 tag appear in AI recommendations more often than those with generic headings.',
    quickAction: 'Update your homepage H1 to include service + city. Example: "Best Dentist in [City] — Accepting New Patients".',
    maintenanceTip: 'Keep H1 consistent with your primary service and city.', relatedFixTool: 'content', fixEngineUrl: url('H1 tag'), countriesApplicable: 'all', industriesApplicable: 'all' },
  image_alt_text: { id: 'image_alt_text', label: 'Image Alt Text', category: 'Technical', impactLevel: 'Medium', impactPoints: 3,
    whatItMeans: 'Text descriptions on your website images that AI and search engines read when they cannot see the images themselves.',
    whyItMatters: 'AI platforms index image alt text to understand your business context. Missing alt text means AI misses visual proof of your services.',
    quickAction: 'Add descriptive alt text to every image. Format: "[service] at [business] in [city]".',
    maintenanceTip: 'Add alt text to new images whenever you update your site.', relatedFixTool: 'content', fixEngineUrl: url('Image alt text'), countriesApplicable: 'all', industriesApplicable: 'all' },
  phone_on_page: { id: 'phone_on_page', label: 'Phone Number on Page', category: 'Technical', impactLevel: 'Medium', impactPoints: 4,
    whatItMeans: 'Whether your phone number appears as readable text on your website homepage, not just as an image or hidden element.',
    whyItMatters: 'AI platforms verify business legitimacy by checking visible contact information. A missing phone reduces trust score.',
    quickAction: 'Add your phone number in text format to your homepage header and footer. Make it clickable with a tel: link.',
    maintenanceTip: 'Ensure the phone matches your Google Business Profile exactly.', relatedFixTool: 'schema', fixEngineUrl: url('Phone number on page'), countriesApplicable: 'all', industriesApplicable: 'all' },
  address_on_page: { id: 'address_on_page', label: 'Address on Page', category: 'Technical', impactLevel: 'Medium', impactPoints: 4,
    whatItMeans: 'Whether your physical address appears as readable text on your website.',
    whyItMatters: 'AI platforms use a visible address to confirm where a business is located, which matters for local searches.',
    quickAction: 'Add your full address in text to your homepage footer. Match it exactly to your Google Business Profile address.',
    maintenanceTip: 'Never change address format across platforms — consistency is critical for AI trust.', relatedFixTool: 'schema', fixEngineUrl: url('Address on page'), countriesApplicable: 'all', industriesApplicable: 'all' },
  blog_section: { id: 'blog_section', label: 'Blog or News Section', category: 'Content', impactLevel: 'Medium', impactPoints: 4,
    whatItMeans: 'Whether your website has a regularly updated blog or news section with relevant content.',
    whyItMatters: 'AI platforms favor businesses that publish helpful content. Fresh content signals an active, credible business and creates more citation opportunities.',
    quickAction: 'Publish one blog post per month answering a common customer question in your industry. Use the Content Optimizer for ideas.',
    maintenanceTip: 'Consistency matters more than frequency. One post a month beats ten then silence.', relatedFixTool: 'content', fixEngineUrl: url('Blog section'), countriesApplicable: 'all', industriesApplicable: 'all' },
  services_page: { id: 'services_page', label: 'Services Page', category: 'Content', impactLevel: 'Medium', impactPoints: 4,
    whatItMeans: 'Whether your website has a dedicated page listing all your services with descriptions.',
    whyItMatters: 'AI platforms pull service information directly from your services page when answering "what does this business offer?" queries.',
    quickAction: 'Create a /services page listing each service with a 2-3 sentence description. Include your city in the page title.',
    maintenanceTip: 'Update the services page when you add or change offerings.', relatedFixTool: 'content', fixEngineUrl: url('Services page'), countriesApplicable: 'all', industriesApplicable: 'all' },
  contact_page: { id: 'contact_page', label: 'Contact Page', category: 'Technical', impactLevel: 'Medium', impactPoints: 3,
    whatItMeans: 'Whether your website has a dedicated contact page with address, phone, email, and ideally a Google Maps embed.',
    whyItMatters: 'AI platforms verify business legitimacy by checking for accessible contact information. Businesses without clear contact pages are treated as less credible.',
    quickAction: 'Create a /contact page with full NAP (Name, Address, Phone), a Google Maps embed, and a contact form.',
    maintenanceTip: 'Test the contact form quarterly to ensure it works.', relatedFixTool: 'schema', fixEngineUrl: url('Contact page'), countriesApplicable: 'all', industriesApplicable: 'all' },
  title_tag: { id: 'title_tag', label: 'Title Tag', category: 'Content', impactLevel: 'Medium', impactPoints: 5,
    whatItMeans: 'The text in your browser tab and search results. This is the first thing AI reads to understand what your business does.',
    whyItMatters: 'Optimized title tags that include service and city appear in AI recommendations more often than business-name-only titles.',
    quickAction: 'Update homepage title to "[Business Name] — [Service] in [City], [State]". Keep under 60 chars. Generate in the Fix Engine.',
    maintenanceTip: 'Review title tags when adding new primary services.', relatedFixTool: 'content', fixEngineUrl: url('Title tag'), countriesApplicable: 'all', industriesApplicable: 'all' },

  google_business: { id: 'google_business', label: 'Google Business Profile', category: 'Directory', impactLevel: 'High', impactPoints: 15,
    whatItMeans: 'Your free business profile on Google that appears in Maps, Search, and AI Overviews.',
    whyItMatters: 'Google Business Profile is one of the main sources of local business data (hours, location, reviews) that search and AI features read. An incomplete profile gives them less to work with.',
    quickAction: 'Claim at business.google.com. Complete every field: hours, photos, services, description. Verify by postcard or phone.',
    maintenanceTip: 'Post weekly updates, add new photos monthly, respond to all reviews within 48 hours.', relatedFixTool: 'gbp', fixEngineUrl: url('Google Business'), countriesApplicable: 'all', industriesApplicable: 'all' },
  yelp: { id: 'yelp', label: 'Yelp Profile', category: 'Directory', impactLevel: 'High', impactPoints: 8,
    whatItMeans: 'Your business listing on Yelp, one of the most cited review platforms by AI systems.',
    whyItMatters: 'ChatGPT and Gemini frequently cite Yelp ratings when recommending local businesses. Estimated Domain Authority ~94.',
    quickAction: 'Claim at biz.yelp.com. Complete the profile, add photos, and respond to reviews.',
    maintenanceTip: 'Respond to every Yelp review. Yelp sends traffic to AI.', relatedFixTool: 'directory', fixEngineUrl: url('Yelp'), countriesApplicable: ['US', 'CA'], industriesApplicable: 'all' },
  bbb: { id: 'bbb', label: 'Better Business Bureau', category: 'Directory', impactLevel: 'Medium', impactPoints: 6,
    whatItMeans: 'Your BBB listing and accreditation status, a trust signal frequently cited by AI for service businesses.',
    whyItMatters: 'BBB accreditation is cited by AI platforms as proof of business legitimacy, especially for service and home-improvement businesses.',
    quickAction: 'Register free at bbb.org. Accreditation is optional and paid (pricing varies by local BBB); a complete free listing is enough to be present.',
    maintenanceTip: 'Respond to any BBB complaints quickly — unresolved complaints hurt AI recommendations.', relatedFixTool: 'directory', fixEngineUrl: url('BBB'), countriesApplicable: ['US', 'CA'], industriesApplicable: 'all' },
  healthgrades: { id: 'healthgrades', label: 'Healthgrades Profile', category: 'Directory', impactLevel: 'Medium', impactPoints: 7,
    whatItMeans: 'Your profile on Healthgrades, the primary medical directory cited by AI for doctor and dental recommendations.',
    whyItMatters: 'When patients ask AI for doctors or dentists, Healthgrades is one of the most cited sources. Incomplete profiles lose patients.',
    quickAction: 'Claim at healthgrades.com. Add all credentials, specialties, insurance accepted, and a photo.',
    maintenanceTip: 'Update credentials when board certifications renew.', relatedFixTool: 'directory', fixEngineUrl: url('Healthgrades'), countriesApplicable: ['US'], industriesApplicable: MEDICAL_INDUSTRY_TOKENS, industryFilter: isMedicalIndustryName },
  facebook: { id: 'facebook', label: 'Facebook Business Page', category: 'Directory', impactLevel: 'Medium', impactPoints: 5,
    whatItMeans: 'Your Facebook Business Page with reviews, hours, and contact information.',
    whyItMatters: 'AI platforms cite Facebook reviews and ratings as social proof. An active page with reviews increases recommendation likelihood.',
    quickAction: 'Claim your Facebook Business Page at facebook.com/pages. Complete all info and enable reviews.',
    maintenanceTip: 'Post 2-3 times per week. Respond to all messages and reviews within 24 hours.', relatedFixTool: 'content', fixEngineUrl: url('Facebook'), countriesApplicable: 'all', industriesApplicable: 'all' },
  reddit: { id: 'reddit', label: 'Reddit Presence', category: 'Community', impactLevel: 'Medium', impactPoints: 5,
    whatItMeans: 'Whether your business or industry expertise is mentioned in relevant Reddit communities.',
    whyItMatters: 'Reddit discussions are a common source for AI answers about local businesses, so organic mentions in relevant subreddits can surface in AI responses.',
    quickAction: 'Have satisfied customers share their experience in local subreddits naturally. Generate expert contribution posts in the Fix Engine.',
    maintenanceTip: 'Contribute genuinely to industry subreddits monthly. Never spam or self-promote.', relatedFixTool: 'reddit', fixEngineUrl: url('Reddit'), countriesApplicable: 'all', industriesApplicable: 'all' },
  nextdoor: { id: 'nextdoor', label: 'Nextdoor Presence', category: 'Community', impactLevel: 'Medium', impactPoints: 4,
    whatItMeans: 'Whether your business is active and recommended on Nextdoor, the neighborhood app.',
    whyItMatters: 'Perplexity and Claude increasingly cite Nextdoor for local business recommendations. Neighbor recommendations are highly trusted.',
    quickAction: 'Claim your business at business.nextdoor.com. Ask happy customers to recommend you on their neighborhood feed.',
    maintenanceTip: 'Respond to Nextdoor recommendations and post seasonal offers monthly.', relatedFixTool: 'directory', fixEngineUrl: url('Nextdoor'), countriesApplicable: ['US', 'GB', 'AU', 'CA', 'NL', 'DE', 'FR'], industriesApplicable: 'all' },

  review_mentions: { id: 'review_mentions', label: 'Review Mentions', category: 'Review', impactLevel: 'High', impactPoints: 10,
    whatItMeans: 'Whether AI platforms are citing reviews about your business when answering queries.',
    whyItMatters: 'Review mentions are one of the strongest signals in AI recommendations. Businesses with reviews cited by AI receive more recommendations.',
    quickAction: 'Encourage recent customers to leave Google reviews. Send a direct link to your review page.',
    maintenanceTip: 'Aim for 2-4 new reviews per month minimum.', relatedFixTool: 'review', fixEngineUrl: url('Review mentions'), countriesApplicable: 'all', industriesApplicable: 'all' },
  rating_mentions: { id: 'rating_mentions', label: 'Rating Score', category: 'Review', impactLevel: 'High', impactPoints: 8,
    whatItMeans: 'The star rating score that AI platforms see and cite when recommending your business.',
    whyItMatters: 'AI recommendations often quote star ratings, so your rating shapes how you compare with nearby competitors.',
    quickAction: 'Respond to negative reviews professionally. Encourage happy customers to review. Generate response templates in the Fix Engine.',
    maintenanceTip: 'Monitor your rating regularly and respond quickly when it drops.', relatedFixTool: 'review', fixEngineUrl: url('Rating mentions'), countriesApplicable: 'all', industriesApplicable: 'all' },
  review_count: { id: 'review_count', label: 'Review Count', category: 'Review', impactLevel: 'High', impactPoints: 8,
    whatItMeans: 'The total number of public reviews your business has across all platforms.',
    whyItMatters: 'Review volume is a common proxy for how established a business is. A very small number of reviews gives AI little to go on.',
    quickAction: 'Focus on getting 25+ Google reviews as your first goal. Send review request emails after every customer interaction.',
    maintenanceTip: 'Set a monthly review goal and track progress in the dashboard.', relatedFixTool: 'review', fixEngineUrl: url('Review Count Visibility'), countriesApplicable: 'all', industriesApplicable: 'all' },
  review_recency: { id: 'review_recency', label: 'Review Recency', category: 'Review', impactLevel: 'Medium', impactPoints: 5,
    whatItMeans: 'How recently your business has received new reviews. AI prefers businesses with fresh, ongoing social proof.',
    whyItMatters: 'Recent reviews show the business is active today; a profile with no new reviews looks stale to customers and to AI.',
    quickAction: 'Set up a post-service review request sequence. Ask every customer within 24 hours of service.',
    maintenanceTip: 'Never pay for reviews. Create a simple email template for review requests after service.', relatedFixTool: 'review', fixEngineUrl: url('Review recency'), countriesApplicable: 'all', industriesApplicable: 'all' },
  review_keywords: { id: 'review_keywords', label: 'Review Keywords', category: 'Review', impactLevel: 'Medium', impactPoints: 4,
    whatItMeans: 'The specific words customers use in reviews that AI platforms pick up and cite in their recommendations.',
    whyItMatters: 'AI looks for keywords in reviews that match search queries. Reviews mentioning specific services and positive attributes increase recommendation relevance.',
    quickAction: 'When asking for reviews, mention specific services. Example: "If you can, mention [service] in your review to help others."',
    maintenanceTip: 'Track which keywords appear in your best reviews and highlight those services.', relatedFixTool: 'content', fixEngineUrl: url('Review keywords'), countriesApplicable: 'all', industriesApplicable: 'all' },
  multi_platform_reviews: { id: 'multi_platform_reviews', label: 'Reviews on Multiple Sites', category: 'Review', impactLevel: 'Medium', impactPoints: 5,
    whatItMeans: 'Whether you have reviews on more than one platform (Google, Yelp, Facebook, industry-specific).',
    whyItMatters: 'Reviews on more than one platform corroborate each other and give AI more independent sources to draw on.',
    quickAction: 'After maximizing Google reviews, encourage customers to also leave Yelp or Facebook reviews.',
    maintenanceTip: 'Maintain minimum activity on all review platforms where you have a presence.', relatedFixTool: 'directory', fixEngineUrl: url('Reviews on Multiple Sites'), countriesApplicable: 'all', industriesApplicable: 'all' },
  review_response_rate: { id: 'review_response_rate', label: 'Review Response Rate', category: 'Review', impactLevel: 'Medium', impactPoints: 5,
    whatItMeans: 'How consistently you reply to customer reviews on Google, Yelp, and other platforms.',
    whyItMatters: 'Replying to reviews shows an active, engaged business to customers and to platforms that read review data.',
    quickAction: 'Reply to your last 10 unanswered Google reviews today. Use the Fix Engine to generate response templates for your industry.',
    maintenanceTip: 'Set a Monday calendar reminder to check and respond to all new reviews from the week.', relatedFixTool: 'review', fixEngineUrl: url('Review Response Rate'), countriesApplicable: 'all', industriesApplicable: 'all' },

  reddit_mentions: { id: 'reddit_mentions', label: 'Reddit Mentions', category: 'Community', impactLevel: 'Medium', impactPoints: 5,
    whatItMeans: 'Whether your business has been mentioned organically in Reddit communities relevant to your area or industry.',
    whyItMatters: 'Reddit threads are a common source for AI answers, so organic mentions of your business there can be picked up in AI responses.',
    quickAction: 'Generate a Reddit contribution strategy in the Fix Engine. Focus on providing genuine value in local and industry subreddits.',
    maintenanceTip: 'Participate monthly in relevant subreddits. Answer questions. Never spam.', relatedFixTool: 'reddit', fixEngineUrl: url('Reddit Mentions'), countriesApplicable: 'all', industriesApplicable: 'all' },
  nextdoor_presence: { id: 'nextdoor_presence', label: 'Nextdoor Community Presence', category: 'Community', impactLevel: 'Medium', impactPoints: 4,
    whatItMeans: 'Whether neighbors are actively recommending your business on Nextdoor in your local area.',
    whyItMatters: 'AI platforms are increasingly citing Nextdoor recommendations for local service providers. Neighbor trust = AI trust.',
    quickAction: 'Ask your best local customers to recommend you on their Nextdoor neighborhood page. One recommendation starts a chain.',
    maintenanceTip: 'Thank customers who recommend you on Nextdoor. Engage with local community posts.', relatedFixTool: 'directory', fixEngineUrl: url('Nextdoor Community Presence'), countriesApplicable: ['US', 'GB', 'AU', 'CA'], industriesApplicable: 'all' },
  local_news: { id: 'local_news', label: 'Local News Mentions', category: 'Community', impactLevel: 'Medium', impactPoints: 6,
    whatItMeans: 'Whether your business has been mentioned in local news articles, press releases, or media coverage.',
    whyItMatters: 'Coverage from a news outlet is an independent, third-party source that AI answers can cite about your business.',
    quickAction: 'Use the Press Outreach Templates in the Fix Engine to pitch your local news. Focus on a community angle, not self-promotion.',
    maintenanceTip: 'Send a press release for significant milestones, community involvement, or local data.', relatedFixTool: 'outreach', fixEngineUrl: url('Local news mentions'), countriesApplicable: 'all', industriesApplicable: 'all' },
  awards_recognition: { id: 'awards_recognition', label: 'Awards and Recognition', category: 'Community', impactLevel: 'Low', impactPoints: 4,
    whatItMeans: 'Whether your business has received industry awards, certifications, or community recognition mentioned by AI.',
    whyItMatters: 'Awards and recognition are strong differentiators in AI recommendations. When two businesses are similar, awards tip the balance.',
    quickAction: 'Apply for local business awards in your area. Display existing awards prominently on your website with schema markup.',
    maintenanceTip: 'Apply for new awards annually. Add award schema markup to your LocalBusiness JSON-LD.', relatedFixTool: 'outreach', fixEngineUrl: url('Awards or recognition'), countriesApplicable: 'all', industriesApplicable: 'all' },
  forum_mentions: { id: 'forum_mentions', label: 'Online Forum Mentions', category: 'Community', impactLevel: 'Low', impactPoints: 3,
    whatItMeans: 'Whether people discuss your business in online communities outside Reddit such as Quora, niche forums, or industry communities.',
    whyItMatters: 'Forum mentions from real users signal genuine trust. Quora answers citing your business appear in AI responses directly.',
    quickAction: 'Answer 3-5 questions on Quora relevant to your industry. Mention your business naturally when it helps the person.',
    maintenanceTip: 'Answer one Quora question per month in your industry. Focus on genuine help.', relatedFixTool: 'reddit', fixEngineUrl: url('Online Forum Mentions'), countriesApplicable: 'all', industriesApplicable: 'all' },

  knowledge_panel_signal: { id: 'knowledge_panel_signal', label: 'Google Knowledge Panel', category: 'Entity', impactLevel: 'High', impactPoints: 25,
    whatItMeans: 'Whether your business or personal brand has a verified Google Knowledge Panel showing on the right side of search results.',
    whyItMatters: 'Knowledge Panels tell AI you are a verified real entity. Businesses with panels appear more often in AI recommendations than those without.',
    quickAction: 'Generate your complete Knowledge Panel creation kit in the Fix Engine. Includes a Wikidata template, citation strategy, and step-by-step guide.',
    maintenanceTip: 'Once the panel exists, claim it via Google Search Console and keep information updated.', relatedFixTool: 'knowledge', fixEngineUrl: url('Google Knowledge Panel'), countriesApplicable: 'all', industriesApplicable: 'all' },
};

export const ALL_SIGNALS: TrustSignalDef[] = Object.values(TRUST_SIGNALS);

// Filter signals applicable to a given country (+ optional industry).
export function signalsForCountry(countryCode: string, industry?: string): TrustSignalDef[] {
  const cc = (countryCode || 'US').toUpperCase();
  // ax89: an unknown/'general' industry filters nothing (no false hiding) —
  // the same rule buildDirectorySignals applies, so display == scoring.
  const ind = isKnownIndustry(industry) ? (industry as string).toLowerCase() : '';
  return ALL_SIGNALS.filter((s) => {
    if (s.countriesApplicable !== 'all' && !s.countriesApplicable.includes(cc)) return false;
    if (ind && s.industryFilter) return s.industryFilter(ind);
    if (s.industriesApplicable !== 'all' && ind && !s.industriesApplicable.some((i) => ind.includes(i))) return false;
    return true;
  });
}

export const SIGNAL_CATEGORIES: SignalCategory[] = ['Technical', 'Directory', 'Review', 'Community', 'Entity', 'Content'];
