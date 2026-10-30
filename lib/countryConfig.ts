export type CountryCode =
  | 'US' | 'GB' | 'AU' | 'CA' | 'IE' | 'NZ' | 'SG' | 'AE'
  | 'ZA' | 'NG' | 'KE' | 'GH' | 'IN' | 'PH';

interface TierPricing {
  monthly: number;
  annual: number;
}

export interface CountryConfig {
  code: CountryCode;
  currency: string;
  // Charge/pricing symbol. For growth markets Stripe charges in USD so this
  // stays '$' — use revenueSymbol (below) for revenue/leak figures.
  symbol: string;
  monthly: number;
  annual: number;
  tier: 'premium' | 'mid' | 'growth';
  // Local-currency symbol for REVENUE figures (leak calculator, customer value).
  // Defaults to `symbol` when unset; growth markets that price in USD override
  // this with their local symbol (₹, ₱, R, ₦, KSh, ₵). Read via getRevenueSymbol().
  revenueSymbol?: string;
  // Optional "≈ ₹1,599/mo" note shown next to the USD price on the pricing page
  // for markets that are charged in USD but think in local currency.
  localPriceNote?: string;
  exampleQueries: [string, string, string];
  // Search-bar helper text: frames the search around the customer's intent
  // ("Search how CUSTOMERS find businesses …"), not the score.
  searchHelperText: string;
  trustSources: string[];
  competitorBlacklist: string[];
  agencyPerSite: number;
  // Market-realistic average customer/patient value (in the country's currency
  // units) used by revenue-leak calculators. Base = dental; scaled per industry
  // via getAvgCustomerValue().
  avgCustomerValue: number;
  // Rough number of monthly AI-driven inquiries for a local business in this
  // market — drives revenue-gap estimates.
  monthlyAIInquiries: number;
  tiers: {
    personalPro: TierPricing;
    productPro: TierPricing;
    agency: TierPricing;
    agencySeo: TierPricing;
    publisherPro: TierPricing;
    seoAutopilot: TierPricing;
  };
}

const US_TIERS     = { personalPro: { monthly: 15,  annual: 144  }, productPro: { monthly: 45,  annual: 432  }, agency: { monthly: 259, annual: 2486 }, agencySeo: { monthly: 799, annual: 6590 }, publisherPro: { monthly: 199, annual: 1650 }, seoAutopilot: { monthly: 39, annual: 374 } };
// Round 2: US seoAutopilot = the founder 'SEO' tier in lib/publicStats ($39,
// annual at the same 20% discount as the other US tiers). publisherPro is NOT
// a founder tier — it is never displayed with a price (homepage: 'Coming soon').
const GB_TIERS     = { personalPro: { monthly: 32,  annual: 249  }, productPro: { monthly: 99,  annual: 820  }, agency: { monthly: 469, annual: 3900 }, agencySeo: { monthly: 625, annual: 5190 }, publisherPro: { monthly: 155, annual: 1290 }, seoAutopilot: { monthly: 135, annual: 1099 } };
const AU_TIERS     = { personalPro: { monthly: 59,  annual: 459  }, productPro: { monthly: 189, annual: 1570 }, agency: { monthly: 899, annual: 7490 }, agencySeo: { monthly: 1199, annual: 9990 }, publisherPro: { monthly: 299, annual: 2490 }, seoAutopilot: { monthly: 255, annual: 2090 } };
const CA_TIERS     = { personalPro: { monthly: 52,  annual: 399  }, productPro: { monthly: 169, annual: 1390 }, agency: { monthly: 799, annual: 6590 }, agencySeo: { monthly: 1059, annual: 8790 }, publisherPro: { monthly: 265, annual: 2190 }, seoAutopilot: { monthly: 225, annual: 1850 } };
const IE_TIERS     = { personalPro: { monthly: 36,  annual: 279  }, productPro: { monthly: 119, annual: 979  }, agency: { monthly: 549, annual: 4490 }, agencySeo: { monthly: 729, annual: 5990 }, publisherPro: { monthly: 179, annual: 1490 }, seoAutopilot: { monthly: 155, annual: 1269 } };
const NZ_TIERS     = { personalPro: { monthly: 55,  annual: 429  }, productPro: { monthly: 179, annual: 1490 }, agency: { monthly: 849, annual: 6990 }, agencySeo: { monthly: 1129, annual: 9290 }, publisherPro: { monthly: 279, annual: 2290 }, seoAutopilot: { monthly: 239, annual: 1950 } };
const SG_TIERS     = { personalPro: { monthly: 52,  annual: 399  }, productPro: { monthly: 169, annual: 1390 }, agency: { monthly: 799, annual: 6590 }, agencySeo: { monthly: 1059, annual: 8790 }, publisherPro: { monthly: 265, annual: 2190 }, seoAutopilot: { monthly: 225, annual: 1850 } };
const MID_TIERS    = { personalPro: { monthly: 12,  annual: 99   }, productPro: { monthly: 39,  annual: 320  }, agency: { monthly: 199, annual: 1650 }, agencySeo: { monthly: 269, annual: 2190 }, publisherPro: { monthly: 59,  annual: 490  }, seoAutopilot: { monthly: 68,  annual: 549  } };
const GROWTH_TIERS = { personalPro: { monthly: 9,   annual: 69   }, productPro: { monthly: 24,  annual: 199  }, agency: { monthly: 99,  annual: 820  }, agencySeo: { monthly: 139, annual: 1090 }, publisherPro: { monthly: 29,  annual: 240  }, seoAutopilot: { monthly: 31,  annual: 248  } };

const US_BLACKLIST = [
  'psychology today', 'yelp', 'healthgrades', 'tripadvisor', 'google',
  'facebook', 'linkedin', 'bbb', 'angi', 'homeadvisor', 'thumbtack',
  'zocdoc', 'vitals', 'webmd', 'avvo', 'martindale', 'zillow', 'realtor',
  'booking', 'expedia', 'weddingwire', 'theknot', 'zola', 'mindbody',
  'repairpal', 'vetstreet', 'petmd', 'classpass', 'instagram', 'twitter',
  'youtube', 'reddit', 'bing', 'yahoo', 'amazon', 'trustpilot', 'opentable',
  'zomato', 'doordash', 'grubhub', 'houzz', 'nextdoor', 'justia', 'findlaw',
  'angieslist', 'angie', 'bark.com', 'bark', 'fixr', 'porch', 'networx',
  'care.com', 'care', 'rover', 'wag', 'superpages', 'yellowpages',
  'manta', 'mapquest', 'foursquare', 'glassdoor', 'indeed', 'healthline',
  'mayo clinic', 'nerdwallet', 'bankrate',
];

const COUNTRY_CONFIGS: Record<CountryCode, CountryConfig> = {
  US: {
    code: 'US', currency: 'USD', symbol: '$', monthly: 39, annual: 374, tier: 'premium', agencyPerSite: 60, avgCustomerValue: 800, monthlyAIInquiries: 120,
    exampleQueries: ['best dentist in Chicago IL', 'Dr. Sarah Johnson cardiologist', 'top HVAC company Houston TX'],
    searchHelperText: 'Search how CUSTOMERS find businesses near you',
    trustSources: ['google.com/maps', 'yelp.com', 'bbb.org', 'healthgrades.com', 'facebook.com'],
    competitorBlacklist: US_BLACKLIST,
    tiers: US_TIERS,
  },
  GB: {
    code: 'GB', currency: 'GBP', symbol: '£', monthly: 95, annual: 790, tier: 'premium', agencyPerSite: 60, avgCustomerValue: 350, monthlyAIInquiries: 80,
    exampleQueries: ['best dentist in Manchester', 'Dr. James Wilson GP London', 'top solicitor in Birmingham UK'],
    searchHelperText: 'Search how CUSTOMERS find businesses in the UK',
    trustSources: ['trustpilot.com', 'checkatrade.com', 'which.co.uk', 'cqc.org.uk', 'nhs.uk'],
    competitorBlacklist: [...new Set([...US_BLACKLIST, 'nhs.uk', 'yell.com', 'thomsonlocal.com'])],
    tiers: GB_TIERS,
  },
  AU: {
    code: 'AU', currency: 'AUD', symbol: 'A$', monthly: 179, annual: 1490, tier: 'premium', agencyPerSite: 60, avgCustomerValue: 450, monthlyAIInquiries: 60,
    exampleQueries: ['best dentist in Sydney', 'Dr. Emma Chen GP Melbourne', 'top plumber in Brisbane'],
    searchHelperText: 'Search how CUSTOMERS find businesses in Australia',
    trustSources: ['healthengine.com.au', 'truelocal.com.au', 'hipages.com.au', 'trustpilot.com'],
    competitorBlacklist: [...new Set([...US_BLACKLIST, 'healthengine.com.au', 'yellowpages.com.au'])],
    tiers: AU_TIERS,
  },
  CA: {
    code: 'CA', currency: 'CAD', symbol: 'C$', monthly: 159, annual: 1290, tier: 'premium', agencyPerSite: 60, avgCustomerValue: 400, monthlyAIInquiries: 70,
    exampleQueries: ['best dentist in Toronto', 'Dr. Michael Lee cardiologist Vancouver', 'top lawyer in Montreal'],
    searchHelperText: 'Search how CUSTOMERS find businesses in Canada',
    trustSources: ['ratemds.com', 'homestars.com', 'trustpilot.com', 'bbb.org'],
    competitorBlacklist: [...new Set([...US_BLACKLIST, 'yellowpages.ca', 'canada411.ca'])],
    tiers: CA_TIERS,
  },
  IE: {
    code: 'IE', currency: 'EUR', symbol: '€', monthly: 109, annual: 890, tier: 'premium', agencyPerSite: 60, avgCustomerValue: 300, monthlyAIInquiries: 50,
    exampleQueries: ['best dentist Dublin', 'Dr. Sean Murphy GP Cork', 'top solicitor Galway'],
    searchHelperText: 'Search how CUSTOMERS find businesses in Ireland',
    trustSources: ['trustpilot.com', 'goldenpages.ie', 'boards.ie', 'hse.ie', 'lawsociety.ie', 'google.com/maps', 'facebook.com'],
    competitorBlacklist: [...new Set([...US_BLACKLIST, 'goldenpages.ie', 'eircom.net', 'kompass.ie'])],
    tiers: IE_TIERS,
  },
  NZ: {
    code: 'NZ', currency: 'NZD', symbol: 'NZ$', monthly: 169, annual: 1390, tier: 'premium', agencyPerSite: 60, avgCustomerValue: 380, monthlyAIInquiries: 40,
    exampleQueries: ['best dentist Auckland', 'Dr. James Tane GP Wellington', 'top lawyer Christchurch'],
    searchHelperText: 'Search how CUSTOMERS find businesses in New Zealand',
    trustSources: ['healthpoint.co.nz', 'nocowboys.co.nz', 'neighbourly.co.nz', 'trustpilot.com', 'google.com/maps', 'facebook.com', 'yellow.co.nz'],
    competitorBlacklist: [...new Set([...US_BLACKLIST, 'yellow.co.nz', 'finda.co.nz', 'yellowpages.co.nz'])],
    tiers: NZ_TIERS,
  },
  SG: {
    code: 'SG', currency: 'SGD', symbol: 'S$', monthly: 159, annual: 1290, tier: 'premium', agencyPerSite: 60, avgCustomerValue: 500, monthlyAIInquiries: 60,
    exampleQueries: ['best dentist Singapore', 'Dr. Li Wei cardiologist Singapore', 'top accounting firm Singapore'],
    searchHelperText: 'Search how CUSTOMERS find businesses in Singapore',
    trustSources: ['healthhub.sg', 'casetrust.org.sg', 'sma.org.sg', 'google.com/maps', 'facebook.com', 'trustpilot.com', 'singaporelegaladvice.com'],
    competitorBlacklist: [...new Set([...US_BLACKLIST, 'yellowpages.com.sg', 'sg.showmelocal.com', 'streetdirectory.com', 'businesslist.sg'])],
    tiers: SG_TIERS,
  },
  AE: {
    code: 'AE', currency: 'USD', symbol: '$', revenueSymbol: 'AED ', monthly: 39, annual: 374, tier: 'premium', agencyPerSite: 60, avgCustomerValue: 600, monthlyAIInquiries: 70,
    exampleQueries: ['best dentist in Dubai', 'Dr. Ahmed specialist Dubai', 'top law firm Abu Dhabi'],
    searchHelperText: 'Search how CUSTOMERS find businesses in the UAE',
    trustSources: ['trustpilot.com', 'bayut.com', 'dubizzle.com'],
    competitorBlacklist: [...new Set([...US_BLACKLIST, 'bayut.com', 'dubizzle.com'])],
    tiers: US_TIERS,
  },
  ZA: {
    code: 'ZA', currency: 'USD', symbol: '$', revenueSymbol: 'R', localPriceNote: '≈ R540/mo', monthly: 29, annual: 240, tier: 'mid', agencyPerSite: 20, avgCustomerValue: 2800, monthlyAIInquiries: 40,
    exampleQueries: ['best dentist Cape Town', 'Dr. Thabo Nkosi GP Johannesburg', 'top attorney Durban'],
    searchHelperText: 'Search how CUSTOMERS find businesses in South Africa',
    trustSources: ['hellopeter.com', 'privateproperty.co.za', 'healthdirectory.co.za', 'trustedreviews.co.za', 'google.com/maps', 'facebook.com', 'trustpilot.com'],
    competitorBlacklist: [...new Set([...US_BLACKLIST, 'yellowpages.co.za', 'cylex.co.za', 'hotfrog.co.za'])],
    tiers: MID_TIERS,
  },
  NG: {
    code: 'NG', currency: 'USD', symbol: '$', revenueSymbol: '₦', localPriceNote: '≈ ₦46,000/mo', monthly: 29, annual: 240, tier: 'mid', agencyPerSite: 20, avgCustomerValue: 45000, monthlyAIInquiries: 50,
    exampleQueries: ['best hospital Lagos', 'Dr. Emeka Okafor physician Abuja', 'top law firm Lagos'],
    searchHelperText: 'Search how CUSTOMERS find businesses in Nigeria',
    trustSources: ['google.com/maps', 'facebook.com', 'jumia.com.ng', 'businesslist.com.ng', 'connectnigeria.com', 'trustpilot.com', 'vconnect.com'],
    competitorBlacklist: [...new Set([...US_BLACKLIST, 'businesslist.com.ng', 'vconnect.com', 'ngcareers.com', 'ngoceans.com'])],
    tiers: MID_TIERS,
  },
  KE: {
    code: 'KE', currency: 'USD', symbol: '$', revenueSymbol: 'KSh', localPriceNote: '≈ KSh3,800/mo', monthly: 29, annual: 240, tier: 'mid', agencyPerSite: 20, avgCustomerValue: 5200, monthlyAIInquiries: 40,
    exampleQueries: ['best hospital Nairobi', 'Dr. Wanjiku Kamau GP Nairobi', 'top advocate Mombasa'],
    searchHelperText: 'Search how CUSTOMERS find businesses in Kenya',
    trustSources: ['google.com/maps', 'facebook.com', 'trustpilot.com', 'myjoyonline.co.ke', 'pigiame.co.ke', 'jiji.co.ke', 'kenyayp.com'],
    competitorBlacklist: [...new Set([...US_BLACKLIST, 'yellowpages.co.ke', 'kenyayp.com', 'cylex-kenya.com'])],
    tiers: MID_TIERS,
  },
  GH: {
    code: 'GH', currency: 'USD', symbol: '$', revenueSymbol: 'GH₵', localPriceNote: '≈ ₵360/mo', monthly: 29, annual: 240, tier: 'mid', agencyPerSite: 20, avgCustomerValue: 600, monthlyAIInquiries: 35,
    exampleQueries: ['best hospital Accra', 'Dr. Kwame Mensah physician Kumasi', 'top lawyer Accra'],
    searchHelperText: 'Search how CUSTOMERS find businesses in Ghana',
    trustSources: ['google.com/maps', 'facebook.com', 'trustpilot.com', 'tonaton.com', 'ghanapostgps.com', 'businessghana.com', 'meqasa.com'],
    competitorBlacklist: [...new Set([...US_BLACKLIST, 'yellowpages.com.gh', 'ghanapostgps.com', 'businessghana.com'])],
    tiers: MID_TIERS,
  },
  IN: {
    code: 'IN', currency: 'USD', symbol: '$', revenueSymbol: '₹', localPriceNote: '≈ ₹1,599/mo', monthly: 19, annual: 149, tier: 'growth', agencyPerSite: 12, avgCustomerValue: 2000, monthlyAIInquiries: 80,
    exampleQueries: ['best doctor in Bandra Mumbai', 'Dr. Priya Sharma cardiologist Delhi', 'top CA firm in Bangalore'],
    searchHelperText: 'Search how CUSTOMERS find businesses in India',
    trustSources: ['practo.com', 'justdial.com', 'sulekha.com', 'indiamart.com'],
    competitorBlacklist: [...new Set([...US_BLACKLIST, 'justdial.com', 'sulekha.com', 'indiamart.com'])],
    tiers: GROWTH_TIERS,
  },
  PH: {
    code: 'PH', currency: 'USD', symbol: '$', revenueSymbol: '₱', localPriceNote: '≈ ₱1,100/mo', monthly: 19, annual: 149, tier: 'growth', agencyPerSite: 12, avgCustomerValue: 1500, monthlyAIInquiries: 60,
    exampleQueries: ['best dentist Manila', 'Dr. Maria Santos cardiologist Cebu', 'top lawyer Manila'],
    searchHelperText: 'Search how CUSTOMERS find businesses in the Philippines',
    trustSources: ['google.com/maps', 'facebook.com', 'trustpilot.com', 'philhealthcare.com', 'booky.ph', 'zomato.com', 'olx.ph'],
    competitorBlacklist: [...new Set([...US_BLACKLIST, 'yellowpages.com.ph', 'businesslist.ph', 'pinoylistings.com'])],
    tiers: GROWTH_TIERS,
  },
};

export const DEFAULT_COUNTRY: CountryCode = 'US';

export function getCountryConfig(code: string): CountryConfig {
  return COUNTRY_CONFIGS[(code as CountryCode)] ?? COUNTRY_CONFIGS[DEFAULT_COUNTRY];
}

// Average customer value scaled by industry, in the market's currency units.
// Base is the country's dental patient value; multipliers reflect how much a
// single customer is worth in each vertical relative to dental.
// Keys match lib/industry-config.ts INDUSTRY_CONFIG exactly (one canonical
// key per industry, no hyphens) so detectIndustry() output feeds straight in.
const AVG_VALUE_MULTIPLIERS: Record<string, number> = {
  // Health & Medical
  dentist: 1.0,
  doctor: 1.2,
  specialist: 2.0,
  chiropractor: 0.8,
  therapist: 0.9,
  physicaltherapy: 0.8,
  optometrist: 0.9,
  medspa: 1.5,
  pharmacy: 0.3,
  veterinarian: 1.1,

  // Legal
  lawyer: 4.0,

  // Home Services
  plumber: 1.5,
  hvac: 2.0,
  electrician: 1.8,
  landscaping: 0.8,
  cleaning: 0.4,
  roofing: 3.0,
  painting: 0.7,
  moving: 1.2,
  pestcontrol: 0.6,
  locksmith: 0.5,

  // Automotive
  autorepair: 1.3,
  carwash: 0.2,
  cardealership: 15.0,

  // Food & Beverage
  restaurant: 0.3,
  bakery: 0.2,
  catering: 2.0,

  // Fitness & Wellness
  gym: 0.5,
  spa: 0.6,
  hairsalon: 0.4,
  nailsalon: 0.3,
  tattoo: 0.5,

  // Real Estate & Finance
  realestate: 5.0,
  mortgage: 8.0,
  insurance: 3.0,
  accountant: 2.0,
  financialadvisor: 4.0,

  // Hospitality & Travel
  hotel: 0.8,
  travelagency: 2.0,

  // Education
  tutor: 0.5,
  school: 1.0,
  childcare: 0.6,

  // Events & Entertainment
  photographer: 1.5,
  weddingvenue: 5.0,
  entertainment: 0.4,

  // Professional Services
  marketing: 3.0,
  itservices: 3.0,
  consulting: 4.0,
  recruitment: 5.0,

  // Retail
  retail: 0.5,
  florist: 0.3,

  // Construction
  contractor: 4.0,

  // Country-specific
  astrologer: 0.3,
  concierge: 3.0,
  mobile: 0.2,

  // Fallback
  general: 1.0,
};

// Local-currency symbol for REVENUE figures (leak calculator, customer value,
// marketing spend). Falls back to the charge symbol when no override is set.
export function getRevenueSymbol(c: CountryConfig): string {
  return c.revenueSymbol ?? c.symbol;
}

export function getAvgCustomerValue(industry: string, countryCode: string): number {
  const base = getCountryConfig(countryCode).avgCustomerValue;
  const mult = AVG_VALUE_MULTIPLIERS[industry] ?? 1.0;
  return Math.round(base * mult);
}

export function getCountryFromRequest(headers: Headers): CountryCode {
  const raw = headers.get('x-vercel-ip-country') ?? '';
  return (COUNTRY_CONFIGS[raw as CountryCode] ? raw : DEFAULT_COUNTRY) as CountryCode;
}

// Cookie-first country resolution: honour the user's rankall_country override
// (set by proxy.ts / country switcher) before falling back to IP geo, so the
// market shown in the UI always matches the market used by scans and fixes.
export function resolveCountryFromRequest(headers: Headers): CountryCode {
  const cookieHeader = headers.get('cookie') || '';
  const cookieMatch = cookieHeader.match(/rankall_country=([^;]+)/);
  const cookieCountry = cookieMatch?.[1]?.toUpperCase();
  if (cookieCountry && COUNTRY_CONFIGS[cookieCountry as CountryCode]) {
    return cookieCountry as CountryCode;
  }
  const ipCountry = headers.get('x-vercel-ip-country')?.toUpperCase();
  if (ipCountry && COUNTRY_CONFIGS[ipCountry as CountryCode]) {
    return ipCountry as CountryCode;
  }
  return DEFAULT_COUNTRY;
}

// ── Location → country inference ───────────────────────────────────────────
// Shared by the scan route (to save the correct country_code) and the report
// page (to display the correct currency). An explicit location signal in the
// query — e.g. a US state abbreviation like "IL" — is the most reliable source
// and must win over any geo/override cookie ("Elgin IL shows £" bug).

export const US_STATE_ABBREVS = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS',
  'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
  'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV',
  'WI','WY','DC',
]);

export const US_STATE_NAMES = new Set([
  'alabama','alaska','arizona','arkansas','california','colorado','connecticut',
  'delaware','florida','georgia','hawaii','idaho','illinois','indiana','iowa',
  'kansas','kentucky','louisiana','maine','maryland','massachusetts','michigan',
  'minnesota','mississippi','missouri','montana','nebraska','nevada',
  'new hampshire','new jersey','new mexico','new york','north carolina',
  'north dakota','ohio','oklahoma','oregon','pennsylvania','rhode island',
  'south carolina','south dakota','tennessee','texas','utah','vermont','virginia',
  'washington','west virginia','wisconsin','wyoming',
]);

// Major US cities (incl. Illinois suburbs like Elgin/Naperville) so an all
// lowercase query without a state still resolves to US.
export const US_CITIES = new Set([
  'chicago','houston','phoenix','philadelphia','san antonio','san diego','dallas',
  'san jose','austin','jacksonville','fort worth','columbus','charlotte',
  'indianapolis','san francisco','seattle','denver','nashville','boston',
  'las vegas','portland','memphis','louisville','baltimore','milwaukee',
  'albuquerque','tucson','fresno','sacramento','mesa','kansas city','atlanta',
  'omaha','colorado springs','raleigh','long beach','virginia beach',
  'minneapolis','tampa','new orleans','arlington','bakersfield','honolulu',
  'anaheim','aurora','santa ana','corpus christi','riverside','lexington',
  'st. louis','st louis','pittsburgh','anchorage','stockton','cincinnati',
  'st. paul','st paul','toledo','greensboro','newark','plano','henderson',
  'lincoln','buffalo','fort wayne','jersey city','chula vista','orlando',
  'st. petersburg','norfolk','chandler','laredo','madison','durham','lubbock',
  'winston-salem','garland','glendale','hialeah','reno','baton rouge','irvine',
  'chesapeake','scottsdale','north las vegas','fremont','gilbert',
  'san bernardino','rochester','richmond','elgin','naperville','schaumburg',
  'joliet','rockford','springfield','peoria','waukegan',
]);

// Tracked international cities/countries → code.
const INTL_LOCATION_TO_COUNTRY: Record<string, string> = {
  london:'GB', manchester:'GB', birmingham:'GB', leeds:'GB', glasgow:'GB',
  sheffield:'GB', liverpool:'GB', edinburgh:'GB', bristol:'GB', cardiff:'GB',
  leicester:'GB', coventry:'GB', nottingham:'GB', newcastle:'GB', belfast:'GB',
  uk:'GB', england:'GB', scotland:'GB', wales:'GB', britain:'GB',
  toronto:'CA', vancouver:'CA', montreal:'CA', calgary:'CA', ottawa:'CA',
  edmonton:'CA', winnipeg:'CA', quebec:'CA', hamilton:'CA', kitchener:'CA', canada:'CA',
  sydney:'AU', melbourne:'AU', brisbane:'AU', perth:'AU', adelaide:'AU',
  'gold coast':'AU', goldcoast:'AU', canberra:'AU', hobart:'AU', australia:'AU',
  mumbai:'IN', delhi:'IN', bangalore:'IN', hyderabad:'IN', chennai:'IN',
  kolkata:'IN', pune:'IN', ahmedabad:'IN', jaipur:'IN', surat:'IN', india:'IN',
  dublin:'IE', cork:'IE', galway:'IE', limerick:'IE', waterford:'IE', ireland:'IE',
  auckland:'NZ', wellington:'NZ', christchurch:'NZ', tauranga:'NZ', 'new zealand':'NZ',
  singapore:'SG',
  dubai:'AE', 'abu dhabi':'AE', abudhabi:'AE', sharjah:'AE', uae:'AE',
  johannesburg:'ZA', 'cape town':'ZA', capetown:'ZA', durban:'ZA', pretoria:'ZA', 'south africa':'ZA',
  manila:'PH', cebu:'PH', davao:'PH', 'quezon city':'PH', philippines:'PH',
  lagos:'NG', abuja:'NG', kano:'NG', ibadan:'NG', 'port harcourt':'NG', nigeria:'NG',
  nairobi:'KE', mombasa:'KE', kisumu:'KE', kenya:'KE',
  accra:'GH', kumasi:'GH', tamale:'GH', ghana:'GH',
};

/** True when `phrase` is EXACTLY a known city / US state / tracked
 *  international place (case-insensitive, commas and extra spaces ignored).
 *  Unlike inferCountryFromText this is not a substring search: "Bright
 *  Smiles Austin" is not a place even though it contains "austin". */
export function isKnownPlaceName(phrase: string): boolean {
  const p = (phrase || '').toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  if (!p) return false;
  return US_CITIES.has(p) || US_STATE_NAMES.has(p) || Object.prototype.hasOwnProperty.call(INTL_LOCATION_TO_COUNTRY, p);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Returns a country code when the text contains a confident location signal,
// otherwise null. US detection runs FIRST. Abbreviation matching is case-aware
// (only an UPPERCASE token like "IL" counts) to avoid the "in" → "IN" (Indiana)
// collision that the preposition would otherwise cause.
export function inferCountryFromText(location: string, input: string): string | null {
  const raw = `${location || ''} ${input || ''}`;
  const lower = raw.toLowerCase();

  // 1. US state full names
  for (const stateName of US_STATE_NAMES) {
    if (lower.includes(stateName)) return 'US';
  }

  // 2. US state abbreviations — uppercase token only
  for (const token of raw.split(/\s+/)) {
    const clean = token.replace(/[^A-Za-z]/g, '');
    if (clean.length === 2 && clean === clean.toUpperCase() && US_STATE_ABBREVS.has(clean)) {
      return 'US';
    }
  }

  // 3. Major US cities (word-boundary match)
  for (const city of US_CITIES) {
    const re = new RegExp(`(?:^|\\b)${escapeRegExp(city)}(?:\\b|$)`, 'i');
    if (re.test(raw)) return 'US';
  }

  // 4. Tracked international cities/countries (word-boundary match)
  for (const [key, code] of Object.entries(INTL_LOCATION_TO_COUNTRY)) {
    const re = new RegExp(`(?:^|\\b)${escapeRegExp(key)}(?:\\b|$)`, 'i');
    if (re.test(raw)) return code;
  }

  return null;
}

export { COUNTRY_CONFIGS };
