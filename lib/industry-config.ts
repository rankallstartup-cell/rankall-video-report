interface IndustryConfig {
  keywords: string[];
  trustSources: string[];
  directories: string[];
}

const INDUSTRY_CONFIG: Record<string, IndustryConfig> = {

  // HEALTH & MEDICAL
  dentist: {
    keywords: ['dentist', 'dental', 'orthodon', 'periodon', 'endodon', 'oral surg', 'teeth whitening', 'dental implant', 'cosmetic dent'],
    trustSources: ['healthgrades', 'zocdoc', 'google'],
    directories: ['healthgrades', 'zocdoc', 'vitals', 'yelp'],
  },
  doctor: {
    keywords: ['doctor', 'physician', 'medical doctor', 'md ', 'gp ', 'general practitioner', 'internist', 'family doctor', 'primary care'],
    trustSources: ['healthgrades', 'zocdoc', 'google'],
    directories: ['healthgrades', 'zocdoc', 'vitals'],
  },
  specialist: {
    keywords: ['specialist', 'cardiolog', 'dermatolog', 'neurolog', 'oncolog', 'gastroenterolog', 'rheumatolog', 'endocrinolog', 'ophthalmolog', 'urolog'],
    trustSources: ['healthgrades', 'zocdoc', 'google'],
    directories: ['healthgrades', 'zocdoc', 'vitals'],
  },
  chiropractor: {
    keywords: ['chiropractor', 'chiropractic', 'spine', 'back pain', 'adjustment'],
    trustSources: ['healthgrades', 'google', 'yelp'],
    directories: ['healthgrades', 'yelp', 'google'],
  },
  therapist: {
    keywords: ['therapist', 'counselor', 'psychologist', 'mental health', 'therapy', 'counseling', 'psychiatrist', 'behavioural'],
    trustSources: ['psychology today', 'zocdoc', 'google'],
    directories: ['psychologytoday', 'zocdoc', 'healthgrades'],
  },
  physicaltherapy: {
    keywords: ['physical therapy', 'physiotherapy', 'physio', 'physical therapist', 'rehab', 'sports therapy', 'occupational'],
    trustSources: ['healthgrades', 'google', 'yelp'],
    directories: ['healthgrades', 'yelp', 'google'],
  },
  optometrist: {
    keywords: ['optometrist', 'optometry', 'eye doctor', 'eye care', 'vision', 'glasses', 'contacts', 'lasik'],
    trustSources: ['healthgrades', 'google', 'yelp'],
    directories: ['healthgrades', 'yelp', 'google'],
  },
  medspa: {
    keywords: ['med spa', 'medspa', 'botox', 'filler', 'laser', 'aesthetics', 'cosmetic', 'microneedling', 'coolsculpting', 'prp treatment'],
    trustSources: ['realself', 'google', 'yelp'],
    directories: ['realself', 'yelp', 'google'],
  },
  pharmacy: {
    keywords: ['pharmacy', 'chemist', 'pharmacist', 'drugstore', 'dispensary'],
    trustSources: ['google', 'yelp'],
    directories: ['google', 'yelp'],
  },
  veterinarian: {
    keywords: ['vet', 'veterinarian', 'animal hospital', 'pet clinic', 'veterinary', 'animal care', 'pet hospital'],
    trustSources: ['google', 'yelp'],
    directories: ['yelp', 'google'],
  },

  // LEGAL
  lawyer: {
    keywords: ['lawyer', 'attorney', 'law firm', 'legal', 'counsel', 'solicitor', 'barrister', 'advocate', 'legal services'],
    trustSources: ['avvo', 'martindale', 'google', 'yelp'],
    directories: ['avvo', 'martindale', 'justia', 'yelp'],
  },

  // HOME SERVICES
  plumber: {
    keywords: ['plumber', 'plumbing', 'pipe', 'drain', 'water heater', 'leak repair', 'blocked drain', 'sewer', 'tap repair'],
    trustSources: ['angi', 'google', 'yelp', 'thumbtack'],
    directories: ['angi', 'homeadvisor', 'yelp', 'thumbtack'],
  },
  hvac: {
    keywords: ['hvac', 'heating', 'cooling', 'air conditioning', 'furnace', 'ac repair', 'air con', 'boiler', 'heat pump'],
    trustSources: ['angi', 'google', 'yelp', 'thumbtack'],
    directories: ['angi', 'homeadvisor', 'yelp', 'thumbtack'],
  },
  electrician: {
    keywords: ['electrician', 'electrical', 'wiring', 'electrical repair', 'electric contractor', 'power', 'circuit'],
    trustSources: ['angi', 'google', 'yelp', 'thumbtack'],
    directories: ['angi', 'homeadvisor', 'yelp', 'thumbtack'],
  },
  landscaping: {
    keywords: ['landscaping', 'lawn care', 'lawn mowing', 'garden', 'tree service', 'sprinkler', 'gardener', 'grounds maintenance'],
    trustSources: ['angi', 'google', 'yelp', 'thumbtack'],
    directories: ['angi', 'homeadvisor', 'yelp', 'thumbtack'],
  },
  cleaning: {
    keywords: ['cleaning service', 'house cleaning', 'maid', 'janitorial', 'carpet cleaning', 'window cleaning', 'domestic', 'commercial cleaning'],
    trustSources: ['angi', 'google', 'yelp', 'thumbtack'],
    directories: ['angi', 'yelp', 'thumbtack', 'google'],
  },
  roofing: {
    keywords: ['roofing', 'roofer', 'roof repair', 'roof replacement', 'gutter', 'siding'],
    trustSources: ['angi', 'google', 'yelp', 'thumbtack'],
    directories: ['angi', 'homeadvisor', 'yelp', 'thumbtack'],
  },
  painting: {
    keywords: ['painting', 'painter', 'house painter', 'interior paint', 'exterior paint', 'decorating'],
    trustSources: ['angi', 'google', 'yelp', 'thumbtack'],
    directories: ['angi', 'yelp', 'thumbtack', 'google'],
  },
  moving: {
    keywords: ['moving company', 'movers', 'removals', 'relocation', 'moving service', 'packers'],
    trustSources: ['google', 'yelp', 'angi'],
    directories: ['yelp', 'angi', 'google'],
  },
  pestcontrol: {
    keywords: ['pest control', 'exterminator', 'termite', 'rodent', 'bug control', 'insect control'],
    trustSources: ['angi', 'google', 'yelp'],
    directories: ['angi', 'yelp', 'google'],
  },
  locksmith: {
    keywords: ['locksmith', 'lock', 'key cutting', 'lockout', 'security locksmith'],
    trustSources: ['google', 'yelp', 'angi'],
    directories: ['yelp', 'angi', 'google'],
  },

  // AUTOMOTIVE
  autorepair: {
    keywords: ['auto repair', 'mechanic', 'car repair', 'oil change', 'tire shop', 'automotive', 'car service', 'mot ', 'vehicle repair'],
    trustSources: ['google', 'yelp', 'carfax'],
    directories: ['yelp', 'google', 'carfax'],
  },
  carwash: {
    keywords: ['car wash', 'auto detailing', 'car detailing', 'valeting'],
    trustSources: ['google', 'yelp'],
    directories: ['yelp', 'google'],
  },
  cardealership: {
    keywords: ['car dealer', 'dealership', 'used cars', 'new cars', 'auto sales', 'car lot'],
    trustSources: ['google', 'yelp', 'cars.com'],
    directories: ['cars.com', 'yelp', 'google'],
  },

  // FOOD & BEVERAGE
  restaurant: {
    keywords: ['restaurant', 'cafe', 'food', 'dining', 'pizza', 'sushi', 'bistro', 'eatery', 'diner', 'takeaway', 'takeout', 'curry house', 'noodle', 'bbq restaurant', 'sports bar', 'wine bar', 'cocktail bar', 'dive bar', 'gastropub', 'public house'],
    trustSources: ['yelp', 'google', 'tripadvisor', 'opentable'],
    directories: ['yelp', 'google', 'tripadvisor', 'opentable'],
  },
  bakery: {
    keywords: ['bakery', 'baker', 'bread', 'pastry', 'cake shop', 'patisserie', 'confectionery'],
    trustSources: ['yelp', 'google', 'tripadvisor'],
    directories: ['yelp', 'google', 'tripadvisor'],
  },
  catering: {
    keywords: ['catering', 'caterer', 'event catering', 'wedding catering', 'corporate catering'],
    trustSources: ['yelp', 'google', 'thumbtack'],
    directories: ['yelp', 'google', 'thumbtack'],
  },

  // FITNESS & WELLNESS
  gym: {
    keywords: ['gym', 'fitness', 'crossfit', 'yoga', 'pilates', 'personal trainer', 'workout', 'health club', 'spin class', 'bootcamp', 'martial arts'],
    trustSources: ['google', 'yelp', 'mindbody'],
    directories: ['yelp', 'google', 'mindbody'],
  },
  spa: {
    keywords: ['spa', 'massage', 'relaxation', 'wellness center', 'day spa', 'hot springs', 'sauna', 'float tank'],
    trustSources: ['google', 'yelp', 'mindbody'],
    directories: ['yelp', 'google', 'mindbody'],
  },
  hairsalon: {
    keywords: ['hair salon', 'hairdresser', 'barber', 'hair cut', 'haircut', 'stylist', 'blowout', 'color', 'hair extensions', 'barbershop'],
    trustSources: ['yelp', 'google', 'styleseat'],
    directories: ['yelp', 'google', 'styleseat'],
  },
  nailsalon: {
    keywords: ['nail salon', 'manicure', 'pedicure', 'nail art', 'gel nails', 'acrylic nails', 'nail technician'],
    trustSources: ['yelp', 'google'],
    directories: ['yelp', 'google'],
  },
  tattoo: {
    keywords: ['tattoo', 'piercing', 'tattoo parlor', 'ink', 'body art'],
    trustSources: ['yelp', 'google'],
    directories: ['yelp', 'google'],
  },

  // REAL ESTATE & FINANCE
  realestate: {
    keywords: ['real estate', 'realtor', 'homes for sale', 'property', 'estate agent', 'letting agent', 'property agent', 'property management', 'apartment rental', 'house rental'],
    trustSources: ['zillow', 'realtor.com', 'google', 'yelp'],
    directories: ['zillow', 'realtor.com', 'yelp', 'google'],
  },
  mortgage: {
    keywords: ['mortgage', 'home loan', 'refinance', 'mortgage broker', 'lender', 'home financing'],
    trustSources: ['google', 'yelp', 'bbb'],
    directories: ['bbb', 'yelp', 'google'],
  },
  insurance: {
    keywords: ['insurance', 'insurer', 'insurance agent', 'insurance broker', 'life insurance', 'health insurance', 'car insurance', 'home insurance'],
    trustSources: ['google', 'yelp', 'bbb'],
    directories: ['bbb', 'yelp', 'google'],
  },
  accountant: {
    keywords: ['accountant', 'cpa', 'tax', 'bookkeeper', 'accounting firm', 'tax preparation', 'chartered accountant', 'auditor', 'tax advisor', 'financial advisor'],
    trustSources: ['google', 'yelp', 'bbb'],
    directories: ['bbb', 'yelp', 'google'],
  },
  financialadvisor: {
    keywords: ['financial advisor', 'financial planner', 'wealth manager', 'investment advisor', 'retirement', 'financial planning'],
    trustSources: ['google', 'yelp', 'bbb'],
    directories: ['bbb', 'yelp', 'google'],
  },

  // HOSPITALITY & TRAVEL
  hotel: {
    keywords: ['hotel', 'motel', 'inn', 'resort', 'bed and breakfast', 'airbnb', 'lodging', 'guesthouse', 'serviced apartment', 'hostel'],
    trustSources: ['tripadvisor', 'google', 'booking.com'],
    directories: ['tripadvisor', 'booking.com', 'google'],
  },
  travelagency: {
    keywords: ['travel agency', 'travel agent', 'tour operator', 'holiday', 'vacation', 'tours', 'travel company'],
    trustSources: ['tripadvisor', 'google', 'yelp'],
    directories: ['tripadvisor', 'yelp', 'google'],
  },

  // EDUCATION
  tutor: {
    keywords: ['tutor', 'tutoring', 'private tutor', 'academic tutor', 'math tutor', 'english tutor', 'test prep', 'sat prep'],
    trustSources: ['google', 'yelp', 'thumbtack'],
    directories: ['thumbtack', 'yelp', 'google'],
  },
  school: {
    keywords: ['school', 'academy', 'college', 'university', 'driving school', 'music school', 'language school', 'coding bootcamp'],
    trustSources: ['google', 'yelp'],
    directories: ['yelp', 'google'],
  },
  childcare: {
    keywords: ['childcare', 'daycare', 'nursery', 'preschool', 'kindergarten', 'babysitter', 'nanny', 'after school'],
    trustSources: ['google', 'yelp', 'care.com'],
    directories: ['care.com', 'yelp', 'google'],
  },

  // EVENTS & ENTERTAINMENT
  photographer: {
    keywords: ['photographer', 'photography', 'wedding photographer', 'portrait', 'photo studio', 'videographer', 'event photographer'],
    trustSources: ['google', 'yelp', 'thumbtack'],
    directories: ['yelp', 'thumbtack', 'google'],
  },
  weddingvenue: {
    keywords: ['wedding venue', 'event venue', 'banquet hall', 'wedding hall', 'reception venue', 'event space', 'conference venue'],
    trustSources: ['google', 'yelp', 'weddingwire', 'theknot'],
    directories: ['weddingwire', 'theknot', 'yelp', 'google'],
  },
  entertainment: {
    keywords: ['entertainment', 'nightclub', 'club', 'live music', 'comedy club', 'escape room', 'bowling', 'arcade', 'cinema'],
    trustSources: ['yelp', 'google', 'tripadvisor'],
    directories: ['yelp', 'tripadvisor', 'google'],
  },

  // PROFESSIONAL SERVICES
  marketing: {
    keywords: ['marketing agency', 'digital marketing', 'seo agency', 'advertising agency', 'pr agency', 'social media', 'branding'],
    trustSources: ['google', 'clutch', 'yelp'],
    directories: ['clutch', 'yelp', 'google'],
  },
  itservices: {
    keywords: ['it services', 'it support', 'managed it', 'computer repair', 'tech support', 'it company', 'software company', 'web design', 'web developer', 'app developer'],
    trustSources: ['google', 'clutch', 'yelp'],
    directories: ['clutch', 'yelp', 'google'],
  },
  consulting: {
    keywords: ['consulting', 'consultant', 'business consulting', 'management consulting', 'strategy consulting'],
    trustSources: ['google', 'clutch', 'linkedin'],
    directories: ['clutch', 'google', 'linkedin'],
  },
  recruitment: {
    keywords: ['recruitment', 'staffing', 'hiring', 'job agency', 'employment agency', 'recruiter', 'headhunter'],
    trustSources: ['google', 'indeed', 'glassdoor'],
    directories: ['indeed', 'glassdoor', 'google'],
  },

  // RETAIL
  retail: {
    keywords: ['shop', 'store', 'boutique', 'retail', 'clothing store', 'fashion', 'gift shop', 'jewellery', 'jewelry'],
    trustSources: ['google', 'yelp'],
    directories: ['yelp', 'google'],
  },
  florist: {
    keywords: ['florist', 'flowers', 'flower shop', 'floral', 'bouquet', 'flower delivery'],
    trustSources: ['google', 'yelp'],
    directories: ['yelp', 'google'],
  },

  // CONSTRUCTION
  contractor: {
    keywords: ['contractor', 'builder', 'construction', 'renovation', 'remodel', 'home improvement', 'building contractor', 'general contractor'],
    trustSources: ['angi', 'google', 'yelp', 'thumbtack'],
    directories: ['angi', 'homeadvisor', 'yelp', 'thumbtack'],
  },

  // COUNTRY-SPECIFIC INDUSTRIES
  // India specific
  astrologer: {
    keywords: ['astrologer', 'astrology', 'jyotish', 'vastu', 'numerology', 'horoscope', 'pandit'],
    trustSources: ['google', 'justdial'],
    directories: ['justdial', 'google'],
  },
  // UAE specific
  concierge: {
    keywords: ['concierge', 'vip service', 'lifestyle management', 'personal assistant service'],
    trustSources: ['google', 'yelp'],
    directories: ['google', 'yelp'],
  },
  // Africa specific
  mobile: {
    keywords: ['mobile money', 'mpesa', 'mobile banking', 'fintech', 'digital payment'],
    trustSources: ['google'],
    directories: ['google'],
  },

  // FALLBACK
  general: {
    keywords: [],
    trustSources: ['google', 'yelp'],
    directories: ['google', 'yelp'],
  },
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function detectIndustry(input: string): string {
  const lower = input.toLowerCase();
  for (const [industry, config] of Object.entries(INDUSTRY_CONFIG)) {
    if (industry === 'general') continue;
    // Leading word-boundary match: a keyword matches only at the start of a
    // word (so 'lock' hits "lockout" but not "padlock", 'md ' hits "md smith"
    // but not "webmd"). A trailing \b is deliberately NOT used — the medical
    // stems ('endodon', 'cardiolog', …) must still match "endodontist",
    // "cardiologists" etc., which a closing boundary would break.
    if (config.keywords.some(k => new RegExp(`\\b${escapeRegExp(k)}`).test(lower))) return industry;
  }
  return 'general';
}

export { INDUSTRY_CONFIG };
export type { IndustryConfig };
