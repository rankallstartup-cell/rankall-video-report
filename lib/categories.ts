// lib/categories.ts
// 434-category constrained vocabulary for detectedCategory.
// PURE data — no API calls, no DB calls, no side effects.

export interface CategoryEntry {
  label: string;
  queryTerm: string;
  sector: string;
  countries?: string[];   // undefined = all countries; ['GB'] = UK only
  replaces?: string;      // slug of the category this replaces in its country
}

// ── compact builder ────────────────────────────────────────────────────────
type Def = [label: string, queryTerm: string, countries?: string[], replaces?: string];

function build(sector: string, entries: Record<string, Def>): Record<string, CategoryEntry> {
  const out: Record<string, CategoryEntry> = {};
  for (const [slug, [label, queryTerm, countries, replaces]] of Object.entries(entries)) {
    out[slug] = { label, queryTerm, sector, ...(countries && { countries }), ...(replaces && { replaces }) };
  }
  return out;
}

// ── Home Services — General (51) ───────────────────────────────────────────
const HOME_SERVICES = build('Home Services — General', {
  'plumber':                      ['Plumber', 'plumber'],
  'electrician':                  ['Electrician', 'electrician'],
  'hvac-contractor':              ['HVAC / Heating & Cooling', 'HVAC contractor'],
  'roofer':                       ['Roofer', 'roofer'],
  'pest-control':                 ['Pest Control', 'pest control'],
  'locksmith':                    ['Locksmith', 'locksmith'],
  'landscaper':                   ['Landscaper / Lawn Care', 'landscaper'],
  'moving-company':               ['Moving Company', 'moving company'],
  'house-painter':                ['Painter (Residential)', 'house painter'],
  'handyman':                     ['Handyman', 'handyman'],
  'garage-door-service':          ['Garage Door Service', 'garage door repair'],
  'house-cleaner':                ['House Cleaner / Maid Service', 'house cleaner'],
  'appliance-repair':             ['Appliance Repair', 'appliance repair'],
  'fence-installer':              ['Fence Installer', 'fence installer'],
  'pool-service':                 ['Pool Service / Pool Cleaning', 'pool service'],
  'septic-tank-service':          ['Septic Tank Service', 'septic tank service'],
  'gutter-cleaning':              ['Gutter Cleaning / Installation', 'gutter cleaning'],
  'pressure-washing':             ['Pressure Washing / Power Washing', 'pressure washing'],
  'window-cleaning':              ['Window Cleaning', 'window cleaning'],
  'chimney-sweep':                ['Chimney Sweep', 'chimney sweep'],
  'air-duct-cleaning':            ['Air Duct Cleaning', 'air duct cleaning'],
  'dryer-vent-cleaning':          ['Dryer Vent Cleaning', 'dryer vent cleaning'],
  'water-damage-restoration':     ['Water Damage Restoration', 'water damage restoration'],
  'fire-damage-restoration':      ['Fire Damage Restoration', 'fire damage restoration'],
  'mold-remediation':             ['Mold Remediation', 'mold remediation'],
  'carpet-cleaning':              ['Carpet Cleaning', 'carpet cleaning'],
  'junk-removal':                 ['Junk Removal', 'junk removal'],
  'home-inspector':               ['Home Inspector', 'home inspector'],
  'home-staging':                 ['Home Staging', 'home staging'],
  'solar-panel-installer':        ['Solar Panel Installation', 'solar panel installer'],
  'ev-charger-installer':         ['EV Charger Installer', 'EV charger installer'],
  'generator-installer':          ['Generator Installation', 'generator installer'],
  'water-softener-installer':     ['Water Softener / Filtration', 'water softener installer'],
  'insulation-installer':         ['Insulation Installer', 'insulation installer'],
  'basement-waterproofing':       ['Waterproofing (Basement)', 'basement waterproofing'],
  'foundation-repair':            ['Foundation Repair', 'foundation repair'],
  'stairlift-installer':          ['Stairlift Installer', 'stairlift installer'],
  'home-accessibility':           ['Home Accessibility Modification', 'home accessibility contractor'],
  'smart-home-installer':         ['Smart Home / Home Automation', 'smart home installer'],
  'security-system-installer':    ['Security System / Alarm Installer', 'security system installer'],
  'security-camera-installer':    ['CCTV / Security Camera Installer', 'security camera installer'],
  'intercom-installer':           ['Intercom Installer', 'intercom installer'],
  'boiler-engineer':              ['Boiler Engineer', 'boiler engineer', ['GB']],
  'gas-engineer':                 ['Gas Engineer', 'gas engineer', ['GB']],
  'skip-hire':                    ['Skip Hire', 'skip hire', ['GB']],
  'loft-conversion':              ['Loft Conversion Specialist', 'loft conversion', ['GB']],
  'conservatory-installer':       ['Conservatory Installer', 'conservatory installer', ['GB']],
  'window-fitter':                ['Window Fitter', 'window fitter', ['GB']],
  'aerial-installer':             ['Aerial / Satellite Installer', 'aerial installer', ['GB']],
  'wheelie-bin-cleaning':         ['Wheelie Bin Cleaning', 'wheelie bin cleaning', ['GB']],
  'end-of-tenancy-cleaning':      ['End of Tenancy Cleaning', 'end of tenancy cleaning', ['GB']],
});

// ── Construction & Trades (31) ─────────────────────────────────────────────
const CONSTRUCTION = build('Construction & Trades', {
  'general-contractor':           ['General Contractor', 'general contractor'],
  'carpenter':                    ['Carpenter / Joiner', 'carpenter'],
  'cabinet-maker':                ['Cabinet Maker', 'cabinet maker'],
  'bricklayer':                   ['Bricklayer', 'bricklayer'],
  'plasterer':                    ['Plasterer', 'plasterer'],
  'tiler':                        ['Tiler (Floor & Wall)', 'tiler'],
  'glazier':                      ['Glazier', 'glazier'],
  'stonemason':                   ['Stonemason', 'stonemason'],
  'concrete-contractor':          ['Concrete Contractor', 'concrete contractor'],
  'drywall-installer':            ['Drywall / Partition Installer', 'drywall installer'],
  'flooring-installer':           ['Flooring Installer', 'flooring installer'],
  'countertop-installer':         ['Countertop Installer', 'countertop installer'],
  'demolition-contractor':        ['Demolition Contractor', 'demolition contractor'],
  'excavation':                   ['Excavation / Earthmoving', 'excavation contractor'],
  'paving-contractor':            ['Paving Contractor', 'paving contractor'],
  'scaffolder':                   ['Scaffolder', 'scaffolder'],
  'steel-fabrication':            ['Steel Fabrication / Welding', 'steel fabrication'],
  'asbestos-removal':             ['Asbestos Removal', 'asbestos removal'],
  'damp-proofing':                ['Damp Proofing', 'damp proofing'],
  'cladding-installer':           ['Cladding Installer', 'cladding installer'],
  'fascia-soffit-installer':      ['Fascia & Soffit Installer', 'fascia and soffit installer'],
  'suspended-ceiling-installer':  ['Suspended Ceiling Installer', 'suspended ceiling installer'],
  'fire-sprinkler-installer':     ['Fire Protection / Sprinkler Installer', 'fire sprinkler installer'],
  'structural-engineer':          ['Structural Engineer', 'structural engineer'],
  'architect':                    ['Architect', 'architect'],
  'interior-designer':            ['Interior Designer', 'interior designer'],
  'building-surveyor':            ['Surveyor / Building Surveyor', 'building surveyor', ['GB']],
  'quantity-surveyor':            ['Quantity Surveyor', 'quantity surveyor', ['GB']],
  'renderer':                     ['Renderer', 'renderer', ['AU']],
  'concreter':                    ['Concreter', 'concreter', ['AU']],
  'building-inspector':           ['Building Inspector', 'building inspector', ['AU']],
});

// ── Health & Medical (49) ──────────────────────────────────────────────────
const HEALTH = build('Health & Medical', {
  'dentist':                      ['Dentist', 'dentist'],
  'doctor':                       ['Doctor / Physician', 'doctor'],
  'medical-clinic':               ['Medical Clinic', 'medical clinic'],
  'chiropractor':                 ['Chiropractor', 'chiropractor'],
  'veterinarian':                 ['Veterinarian', 'veterinarian'],
  'physiotherapist':              ['Physiotherapist / Physical Therapist', 'physiotherapist'],
  'optometrist':                  ['Optometrist / Eye Doctor', 'optometrist'],
  'pediatrician':                 ['Pediatrician', 'pediatrician'],
  'dermatologist':                ['Dermatologist', 'dermatologist'],
  'orthopedic-surgeon':           ['Orthopedic Surgeon', 'orthopedic surgeon'],
  'cardiologist':                 ['Cardiologist', 'cardiologist'],
  'ent':                          ['ENT (Ear Nose Throat)', 'ENT doctor'],
  'urologist':                    ['Urologist', 'urologist'],
  'obgyn':                        ['OB-GYN', 'OB-GYN'],
  'psychiatrist':                 ['Psychiatrist', 'psychiatrist'],
  'psychologist':                 ['Psychologist', 'psychologist'],
  'orthodontist':                 ['Orthodontist', 'orthodontist'],
  'oral-surgeon':                 ['Oral Surgeon', 'oral surgeon'],
  'periodontist':                 ['Periodontist', 'periodontist'],
  'endodontist':                  ['Endodontist', 'endodontist'],
  'podiatrist':                   ['Podiatrist', 'podiatrist'],
  'allergist':                    ['Allergist / Immunologist', 'allergist'],
  'gastroenterologist':           ['Gastroenterologist', 'gastroenterologist'],
  'neurologist':                  ['Neurologist', 'neurologist'],
  'oncologist':                   ['Oncologist', 'oncologist'],
  'pulmonologist':                ['Pulmonologist', 'pulmonologist'],
  'rheumatologist':               ['Rheumatologist', 'rheumatologist'],
  'nephrologist':                 ['Nephrologist', 'nephrologist'],
  'radiologist':                  ['Radiologist', 'radiologist'],
  'anesthesiologist':             ['Anesthesiologist', 'anesthesiologist'],
  'pain-management':              ['Pain Management Specialist', 'pain management doctor'],
  'sports-medicine':              ['Sports Medicine Doctor', 'sports medicine doctor'],
  'urgent-care':                  ['Urgent Care Clinic', 'urgent care'],
  'walk-in-clinic':               ['Walk-in Clinic', 'walk-in clinic'],
  'pharmacy':                     ['Pharmacy / Chemist', 'pharmacy'],
  'medical-lab':                  ['Medical Lab / Diagnostics', 'medical lab'],
  'audiologist':                  ['Hearing Aid Specialist / Audiologist', 'audiologist'],
  'occupational-therapist':       ['Occupational Therapist', 'occupational therapist'],
  'speech-therapist':             ['Speech Therapist / Speech Pathologist', 'speech therapist'],
  'dietitian':                    ['Dietitian / Nutritionist', 'dietitian'],
  'midwife':                      ['Midwife / Birth Center', 'midwife'],
  'home-health-care':             ['Home Health Care Service', 'home health care'],
  'hospice':                      ['Hospice', 'hospice'],
  'nursing-home':                 ['Nursing Home / Aged Care', 'nursing home'],
  'assisted-living':              ['Assisted Living Facility', 'assisted living'],
  'memory-care':                  ['Memory Care Facility', 'memory care facility'],
  'gp':                           ['GP (General Practitioner)', 'GP', ['GB'], 'doctor'],
  'osteopath':                    ['Osteopath', 'osteopath', ['GB']],
  'denturist':                    ['Denturist', 'denturist', ['CA']],
});

// ── Mental Health & Therapy (16) ───────────────────────────────────────────
const MENTAL_HEALTH = build('Mental Health & Therapy', {
  'therapist':                    ['Therapist / Counselor (General)', 'therapist'],
  'marriage-family-therapist':    ['Marriage & Family Therapist', 'marriage counselor'],
  'cbt-therapist':                ['CBT Therapist', 'CBT therapist'],
  'aba-therapist':                ['ABA Therapist', 'ABA therapist'],
  'emdr-therapist':               ['EMDR Therapist', 'EMDR therapist'],
  'trauma-therapist':             ['Trauma Therapist', 'trauma therapist'],
  'addiction-counselor':          ['Addiction / Substance Abuse Counselor', 'addiction counselor'],
  'grief-counselor':              ['Grief Counselor', 'grief counselor'],
  'child-therapist':              ['Child / Adolescent Therapist', 'child therapist'],
  'couples-counselor':            ['Couples Counselor', 'couples counselor'],
  'sex-therapist':                ['Sex Therapist', 'sex therapist'],
  'play-therapist':               ['Play Therapist', 'play therapist'],
  'art-therapist':                ['Art Therapist', 'art therapist'],
  'music-therapist':              ['Music Therapist', 'music therapist'],
  'neuropsychologist':            ['Neuropsychologist', 'neuropsychologist'],
  'rehabilitation-counselor':     ['Rehabilitation Counselor', 'rehabilitation counselor'],
});

// ── Alternative & Complementary Medicine (17) ──────────────────────────────
const ALTERNATIVE = build('Alternative & Complementary Medicine', {
  'acupuncturist':                ['Acupuncturist', 'acupuncturist'],
  'naturopath':                   ['Naturopath / Naturopathic Doctor', 'naturopath'],
  'homeopath':                    ['Homeopath', 'homeopath'],
  'herbalist':                    ['Herbalist / Medical Herbalist', 'herbalist'],
  'tcm':                          ['Traditional Chinese Medicine (TCM)', 'TCM practitioner'],
  'ayurvedic-practitioner':       ['Ayurvedic Practitioner', 'ayurvedic practitioner'],
  'reflexologist':                ['Reflexologist', 'reflexologist'],
  'reiki-practitioner':           ['Reiki Practitioner', 'reiki practitioner'],
  'hypnotherapist':               ['Hypnotherapist', 'hypnotherapist'],
  'kinesiologist':                ['Kinesiologist', 'kinesiologist'],
  'craniosacral-therapist':       ['Craniosacral Therapist', 'craniosacral therapist'],
  'bowen-therapist':              ['Bowen Therapist', 'bowen therapist'],
  'aromatherapist':               ['Aromatherapist', 'aromatherapist'],
  'cupping-therapist':            ['Cupping Therapist', 'cupping therapist'],
  'alexander-technique':          ['Alexander Technique Teacher', 'alexander technique'],
  'myotherapist':                 ['Myotherapist', 'myotherapist', ['AU']],
  'remedial-massage-therapist':   ['Remedial Massage Therapist', 'remedial massage therapist', ['AU']],
});

// ── Legal (27) ─────────────────────────────────────────────────────────────
const LEGAL = build('Legal', {
  'lawyer':                       ['Lawyer / Attorney (General)', 'lawyer'],
  'personal-injury-lawyer':       ['Personal Injury Lawyer', 'personal injury lawyer'],
  'criminal-defense-attorney':    ['Criminal Defense Attorney', 'criminal defense attorney'],
  'family-law-attorney':          ['Family Law Attorney / Divorce Lawyer', 'family law attorney'],
  'immigration-lawyer':           ['Immigration Lawyer', 'immigration lawyer'],
  'estate-planning-attorney':     ['Estate Planning / Wills Attorney', 'estate planning attorney'],
  'bankruptcy-attorney':          ['Bankruptcy Attorney', 'bankruptcy attorney'],
  'real-estate-attorney':         ['Real Estate Attorney', 'real estate attorney'],
  'business-attorney':            ['Business / Corporate Attorney', 'business attorney'],
  'employment-attorney':          ['Employment / Labor Attorney', 'employment attorney'],
  'tax-attorney':                 ['Tax Attorney', 'tax attorney'],
  'ip-attorney':                  ['Intellectual Property Attorney', 'intellectual property attorney'],
  'dui-attorney':                 ['DUI / DWI Attorney', 'DUI attorney'],
  'workers-comp-attorney':        ['Workers Compensation Attorney', 'workers compensation attorney'],
  'medical-malpractice-attorney': ['Medical Malpractice Attorney', 'medical malpractice attorney'],
  'civil-rights-attorney':       ['Civil Rights Attorney', 'civil rights attorney'],
  'environmental-attorney':       ['Environmental Attorney', 'environmental attorney'],
  'elder-law-attorney':           ['Elder Law Attorney', 'elder law attorney'],
  'notary-public':                ['Notary Public', 'notary public'],
  'mediator':                     ['Mediator / Arbitrator', 'mediator'],
  'solicitor':                    ['Solicitor (General)', 'solicitor', ['GB'], 'lawyer'],
  'barrister':                    ['Barrister', 'barrister', ['GB']],
  'conveyancer-uk':               ['Conveyancer', 'conveyancer', ['GB']],
  'conveyancer-au':               ['Conveyancer', 'conveyancer', ['AU']],
  'notary-public-bc':             ['Notary Public (BC)', 'notary public', ['CA']],
  'solicitor-ie':                 ['Solicitor', 'solicitor', ['IE'], 'lawyer'],
  'auctioneer-ie':                ['Auctioneer', 'auctioneer', ['IE'], 'real-estate-agent'],
});

// ── Financial & Professional Services (19) ─────────────────────────────────
const FINANCIAL = build('Financial & Professional Services', {
  'accountant':                   ['Accountant / CPA', 'accountant'],
  'tax-preparer':                 ['Tax Preparer', 'tax preparer'],
  'bookkeeper':                   ['Bookkeeper', 'bookkeeper'],
  'financial-advisor':            ['Financial Advisor / Planner', 'financial advisor'],
  'insurance-agent':              ['Insurance Agent / Broker', 'insurance agent'],
  'mortgage-broker':              ['Mortgage Broker / Lender', 'mortgage broker'],
  'real-estate-agent':            ['Real Estate Agent / Realtor', 'real estate agent'],
  'property-manager':             ['Property Manager', 'property manager'],
  'appraiser':                    ['Appraiser (Real Estate)', 'real estate appraiser'],
  'payroll-service':              ['Payroll Service', 'payroll service'],
  'hr-consultant':                ['HR Consultant', 'HR consultant'],
  'business-consultant':          ['Business Consultant', 'business consultant'],
  'marketing-agency':             ['Marketing Agency', 'marketing agency'],
  'pr-firm':                      ['PR / Communications Firm', 'PR firm'],
  'translation-service':          ['Translation / Interpretation Service', 'translation service'],
  'chartered-accountant':         ['Chartered Accountant', 'chartered accountant', ['GB'], 'accountant'],
  'estate-agent':                 ['Estate Agent', 'estate agent', ['GB'], 'real-estate-agent'],
  'letting-agent':                ['Letting Agent', 'letting agent', ['GB']],
  'migration-agent':              ['Migration Agent', 'migration agent', ['AU']],
});

// ── Automotive (26) ────────────────────────────────────────────────────────
const AUTOMOTIVE = build('Automotive', {
  'auto-repair':                  ['Auto Repair / Mechanic', 'auto repair'],
  'auto-body-shop':               ['Auto Body Shop / Collision Repair', 'auto body shop'],
  'car-dealership':               ['Car Dealership', 'car dealership'],
  'towing-service':               ['Towing Service', 'towing service'],
  'tire-shop':                    ['Tire Shop / Tyre Fitter', 'tire shop'],
  'oil-change':                   ['Oil Change / Lube Shop', 'oil change'],
  'transmission-repair':          ['Transmission Repair', 'transmission repair'],
  'brake-shop':                   ['Brake Shop', 'brake shop'],
  'muffler-shop':                 ['Muffler / Exhaust Shop', 'muffler shop'],
  'auto-glass':                   ['Auto Glass / Windshield Repair', 'auto glass repair'],
  'auto-detailing':               ['Auto Detailing / Car Wash', 'auto detailing'],
  'auto-electrician':             ['Auto Electrician', 'auto electrician'],
  'wheel-alignment':              ['Wheel Alignment / Balancing', 'wheel alignment'],
  'auto-locksmith':               ['Car Key Replacement / Auto Locksmith', 'auto locksmith'],
  'mobile-mechanic':              ['Mobile Mechanic', 'mobile mechanic'],
  'diesel-mechanic':              ['Diesel Mechanic', 'diesel mechanic'],
  'motorcycle-repair':            ['Motorcycle Repair', 'motorcycle repair'],
  'rv-repair':                    ['RV / Caravan Repair', 'RV repair'],
  'vehicle-wrapping':             ['Vehicle Wrapping / Tinting', 'vehicle wrapping'],
  'paintless-dent-repair':        ['Paintless Dent Repair (PDR)', 'paintless dent repair'],
  'radiator-repair':              ['Radiator Repair', 'radiator repair'],
  'auto-upholstery':              ['Auto Upholstery / Trimmer', 'auto upholstery'],
  'classic-car-restoration':      ['Classic Car Restoration', 'classic car restoration'],
  'auto-ac-repair':               ['Auto A/C Repair', 'auto AC repair'],
  'smog-check':                   ['Smog Check / Emissions Testing', 'smog check'],
  'panel-beater':                 ['Panel Beater', 'panel beater', ['AU'], 'auto-body-shop'],
});

// ── Food & Hospitality (20) ───────────────────────────────────────────────
const FOOD = build('Food & Hospitality', {
  'restaurant':                   ['Restaurant', 'restaurant'],
  'cafe':                         ['Cafe / Coffee Shop', 'cafe'],
  'bakery':                       ['Bakery', 'bakery'],
  'catering-service':             ['Catering Service', 'catering service'],
  'food-truck':                   ['Food Truck', 'food truck'],
  'bar':                          ['Bar / Pub', 'bar'],
  'pizza-delivery':               ['Pizza Delivery', 'pizza delivery'],
  'ice-cream-shop':               ['Ice Cream / Frozen Yogurt', 'ice cream shop'],
  'juice-bar':                    ['Juice Bar / Smoothie Shop', 'juice bar'],
  'butcher':                      ['Butcher / Meat Market', 'butcher'],
  'deli':                         ['Deli / Sandwich Shop', 'deli'],
  'food-delivery':                ['Food Delivery Service', 'food delivery'],
  'meal-prep':                    ['Meal Prep Service', 'meal prep service'],
  'personal-chef':                ['Personal Chef / Private Cook', 'personal chef'],
  'winery':                       ['Winery / Vineyard', 'winery'],
  'brewery':                      ['Brewery / Taproom', 'brewery'],
  'hotel':                        ['Hotel / Motel', 'hotel'],
  'bed-and-breakfast':            ['Bed & Breakfast / Inn', 'bed and breakfast'],
  'vacation-rental-management':   ['Vacation Rental Management', 'vacation rental management'],
  'publican':                     ['Publican', 'publican', ['IE'], 'bar'],
});

// ── Personal Care & Beauty (18) ───────────────────────────────────────────
const BEAUTY = build('Personal Care & Beauty', {
  'hair-salon':                   ['Hair Salon', 'hair salon'],
  'barber-shop':                  ['Barber Shop', 'barber shop'],
  'spa':                          ['Spa / Day Spa', 'day spa'],
  'nail-salon':                   ['Nail Salon', 'nail salon'],
  'massage-therapist':            ['Massage Therapist', 'massage therapist'],
  'esthetician':                  ['Esthetician / Skin Care', 'esthetician'],
  'waxing':                       ['Waxing / Hair Removal', 'waxing salon'],
  'lash-extensions':              ['Lash Extensions / Brow Bar', 'lash extensions'],
  'tattoo-parlor':                ['Tattoo Parlor', 'tattoo parlor'],
  'piercing-studio':              ['Piercing Studio', 'piercing studio'],
  'tanning-salon':                ['Tanning Salon', 'tanning salon'],
  'med-spa':                      ['Med Spa / Aesthetic Clinic', 'med spa'],
  'cosmetic-dentistry':           ['Cosmetic Dentistry', 'cosmetic dentist'],
  'cosmetic-surgery':             ['Cosmetic Surgery / Plastic Surgeon', 'plastic surgeon'],
  'laser-hair-removal':           ['Laser Hair Removal', 'laser hair removal'],
  'botox-fillers':                ['Botox / Fillers Provider', 'botox provider'],
  'permanent-makeup':             ['Permanent Makeup / Microblading', 'microblading'],
  'teeth-whitening':              ['Teeth Whitening', 'teeth whitening'],
});

// ── Fitness & Wellness (16) ───────────────────────────────────────────────
const FITNESS = build('Fitness & Wellness', {
  'gym':                          ['Gym / Fitness Center', 'gym'],
  'personal-trainer':             ['Personal Trainer', 'personal trainer'],
  'yoga-studio':                  ['Yoga Studio', 'yoga studio'],
  'pilates-studio':               ['Pilates Studio', 'pilates studio'],
  'crossfit':                     ['CrossFit Box', 'CrossFit gym'],
  'martial-arts':                 ['Martial Arts School', 'martial arts school'],
  'boxing-gym':                   ['Boxing Gym', 'boxing gym'],
  'swimming-pool':                ['Swimming Pool / Aquatics Center', 'swimming pool'],
  'dance-studio':                 ['Dance Studio', 'dance studio'],
  'spin-studio':                  ['Spin / Cycling Studio', 'spin class'],
  'climbing-gym':                 ['Rock Climbing Gym', 'rock climbing gym'],
  'weight-loss-clinic':           ['Weight Loss Clinic', 'weight loss clinic'],
  'wellness-center':              ['Wellness Center / Holistic Health', 'wellness center'],
  'float-tank':                   ['Float Tank / Sensory Deprivation', 'float tank'],
  'cryotherapy':                  ['Cryotherapy', 'cryotherapy'],
  'iv-therapy':                   ['IV Therapy / Vitamin Infusion', 'IV therapy'],
});

// ── Pet Services (14) ─────────────────────────────────────────────────────
const PETS = build('Pet Services', {
  'vet':                          ['Veterinarian', 'veterinarian'],
  'pet-groomer':                  ['Pet Groomer', 'pet groomer'],
  'dog-walker':                   ['Dog Walker', 'dog walker'],
  'pet-sitter':                   ['Pet Sitter / Boarding', 'pet sitter'],
  'dog-trainer':                  ['Dog Trainer', 'dog trainer'],
  'pet-store':                    ['Pet Store', 'pet store'],
  'mobile-vet':                   ['Mobile Vet', 'mobile vet'],
  'emergency-animal-hospital':    ['Emergency Animal Hospital', 'emergency vet'],
  'pet-cremation':                ['Pet Cremation / Cemetery', 'pet cremation'],
  'doggy-daycare':                ['Doggy Daycare', 'doggy daycare'],
  'pet-transport':                ['Pet Transport', 'pet transport'],
  'aquarium-store':               ['Aquarium / Fish Store', 'aquarium store'],
  'equine-vet':                   ['Equine Vet / Large Animal Vet', 'equine vet'],
  'pet-photographer':             ['Pet Photographer', 'pet photographer'],
});

// ── Education & Tutoring (15) ─────────────────────────────────────────────
const EDUCATION = build('Education & Tutoring', {
  'tutor':                        ['Private Tutor (Math/Science/English)', 'tutor'],
  'music-teacher':                ['Music Teacher / Music Lessons', 'music teacher'],
  'driving-instructor':           ['Driving Instructor', 'driving instructor'],
  'language-school':              ['Language School / ESL Tutor', 'language school'],
  'test-prep':                    ['Test Prep (SAT/ACT/GRE)', 'test prep tutor'],
  'preschool':                    ['Preschool / Daycare', 'preschool'],
  'after-school-program':         ['After-School Program', 'after school program'],
  'tutoring-center':              ['Tutoring Center (Kumon, Mathnasium)', 'tutoring center'],
  'art-classes':                  ['Art Classes / Art School', 'art classes'],
  'coding-classes':               ['Coding / STEM Classes for Kids', 'coding classes for kids'],
  'swim-school':                  ['Swimming Lessons / Swim School', 'swim school'],
  'first-aid-training':           ['First Aid / CPR Training', 'first aid training'],
  'driving-instructor-uk':        ['Driving Instructor (ADI)', 'driving instructor', ['GB'], 'driving-instructor'],
  'childminder-uk':               ['Childminder', 'childminder', ['GB']],
  'childminder-ie':               ['Childminder', 'childminder', ['IE']],
});

// ── Events & Entertainment (22) ───────────────────────────────────────────
const EVENTS = build('Events & Entertainment', {
  'wedding-photographer':         ['Wedding Photographer', 'wedding photographer'],
  'videographer':                 ['Videographer', 'videographer'],
  'wedding-planner':              ['Wedding Planner / Event Planner', 'wedding planner'],
  'dj':                           ['DJ / Mobile Disco', 'DJ'],
  'florist':                      ['Florist', 'florist'],
  'caterer-events':               ['Caterer (Events)', 'event caterer'],
  'live-band':                    ['Live Band / Musician for Hire', 'live band for hire'],
  'photo-booth-rental':           ['Photo Booth Rental', 'photo booth rental'],
  'event-decorator':              ['Event Decorator / Stylist', 'event decorator'],
  'balloon-artist':               ['Balloon Artist / Decorator', 'balloon decorator'],
  'face-painter':                 ['Face Painter', 'face painter'],
  'magician':                     ['Magician / Party Entertainer', 'magician'],
  'wedding-venue':                ['Wedding Venue', 'wedding venue'],
  'wedding-cake':                 ['Wedding Cake / Custom Cakes', 'wedding cake'],
  'bridal-shop':                  ['Wedding Dress Shop / Bridal', 'bridal shop'],
  'officiant':                    ['Officiant / Marriage Celebrant', 'wedding officiant'],
  'event-equipment-rental':       ['Event Equipment Rental', 'event equipment rental'],
  'limo-service':                 ['Limo / Party Bus Rental', 'limo service'],
  'fireworks-display':            ['Fireworks Display Company', 'fireworks display'],
  'marquee-hire':                 ['Marquee Hire', 'marquee hire', ['GB']],
  'bouncy-castle-hire':           ['Bouncy Castle Hire', 'bouncy castle hire', ['GB']],
  'marriage-celebrant-au':        ['Marriage Celebrant', 'marriage celebrant', ['AU'], 'officiant'],
});

// ── IT & Tech Services (18) ──────────────────────────────────────────────
const TECH = build('IT & Tech Services', {
  'computer-repair':              ['Computer Repair', 'computer repair'],
  'phone-repair':                 ['Phone / Tablet Repair', 'phone repair'],
  'data-recovery':                ['Data Recovery', 'data recovery'],
  'web-design':                   ['Web Design / Web Development', 'web designer'],
  'seo':                          ['SEO / Digital Marketing', 'SEO agency'],
  'it-support':                   ['IT Support / Managed IT Services', 'IT support'],
  'network-cabling':              ['Network Cabling / Structured Cabling', 'network cabling'],
  'pos-installer':                ['POS System Installer', 'POS system installer'],
  'av-installation':              ['AV Installation (Audio Visual)', 'AV installation'],
  'home-theater':                 ['Home Theater Installation', 'home theater installer'],
  'digital-signage':              ['Digital Signage', 'digital signage'],
  'voip':                         ['VoIP / Business Phone System', 'VoIP provider'],
  'printer-repair':               ['Printer / Copier Repair', 'printer repair'],
  'graphic-designer':             ['Graphic Designer', 'graphic designer'],
  'commercial-photographer':      ['Photographer (Commercial)', 'commercial photographer'],
  'commercial-videographer':      ['Videographer (Commercial)', 'commercial videographer'],
  '3d-printing':                  ['3D Printing Service', '3D printing service'],
  'app-developer':                ['App Developer', 'app developer'],
});

// ── Cleaning Services — Specialized (12) ──────────────────────────────────
const CLEANING = build('Cleaning Services (Specialized)', {
  'commercial-cleaning':          ['Commercial Cleaning / Janitorial', 'commercial cleaning'],
  'office-cleaning':              ['Office Cleaning', 'office cleaning'],
  'biohazard-cleaning':           ['Biohazard / Crime Scene Cleaning', 'biohazard cleaning'],
  'hoarding-cleanup':             ['Hoarding Cleanup', 'hoarding cleanup'],
  'tile-grout-cleaning':          ['Tile & Grout Cleaning', 'tile and grout cleaning'],
  'upholstery-cleaning':          ['Upholstery Cleaning', 'upholstery cleaning'],
  'stone-restoration':            ['Stone / Marble Restoration', 'stone restoration'],
  'solar-panel-cleaning':         ['Solar Panel Cleaning', 'solar panel cleaning'],
  'graffiti-removal':             ['Graffiti Removal', 'graffiti removal'],
  'odor-removal':                 ['Odor Removal', 'odor removal'],
  'kitchen-hood-cleaning':        ['Kitchen Extract / Hood Cleaning', 'kitchen hood cleaning'],
  'dry-cleaning':                 ['Laundry / Dry Cleaning', 'dry cleaning'],
});

// ── Marine & Boat Services (12) ──────────────────────────────────────────
const MARINE = build('Marine & Boat Services', {
  'boat-repair':                  ['Boat Repair / Marine Mechanic', 'boat repair'],
  'marine-electrician':           ['Marine Electrician', 'marine electrician'],
  'boat-detailing':               ['Boat Detailing', 'boat detailing'],
  'marine-upholstery':            ['Marine Upholstery / Trimmer', 'marine upholstery'],
  'yacht-broker':                 ['Yacht Broker', 'yacht broker'],
  'marine-surveyor':              ['Marine Surveyor', 'marine surveyor'],
  'marina':                       ['Marina / Boat Storage', 'marina'],
  'outboard-motor-repair':        ['Outboard Motor Repair', 'outboard motor repair'],
  'jet-ski-repair':               ['Jet Ski Repair', 'jet ski repair'],
  'fiberglass-repair':            ['Fiberglass Repair', 'fiberglass repair'],
  'boat-transport':               ['Boat Transport / Hauling', 'boat transport'],
  'sailmaker':                    ['Sailmaker', 'sailmaker'],
});

// ── Agricultural & Rural (13) ────────────────────────────────────────────
const AGRICULTURE = build('Agricultural & Rural', {
  'farm-equipment-repair':        ['Farm Equipment Repair', 'farm equipment repair'],
  'farrier':                      ['Farrier (Horseshoeing)', 'farrier'],
  'large-animal-vet':             ['Large Animal Vet / Farm Vet', 'large animal vet'],
  'fencing-contractor-rural':     ['Fencing Contractor (Rural)', 'rural fencing contractor'],
  'irrigation-installer':         ['Irrigation Installer', 'irrigation installer'],
  'well-drilling':                ['Well Drilling / Bore Drilling', 'well drilling'],
  'land-clearing':                ['Land Clearing', 'land clearing'],
  'excavation-rural':             ['Excavation / Earthmoving', 'excavation contractor'],
  'arborist':                     ['Arborist / Tree Service', 'arborist'],
  'tree-lopping':                 ['Tree Lopping / Stump Grinding', 'tree lopping'],
  'agronomist':                   ['Agronomist', 'agronomist'],
  'pest-inspector-au':            ['Pest Inspector (Termite)', 'termite inspector', ['AU']],
  'shearing-contractor':          ['Shearing Contractor', 'shearing contractor', ['AU']],
});

// ── Senior Care & Disability (11) ────────────────────────────────────────
const SENIOR_CARE = build('Senior Care & Disability', {
  'home-care-aide':               ['Home Care Aide / Personal Care', 'home care aide'],
  'companion-care':               ['Companion Care', 'companion care'],
  'live-in-carer':                ['Live-in Carer', 'live-in carer'],
  'respite-care':                 ['Respite Care', 'respite care'],
  'adult-day-care':               ['Adult Day Care Center', 'adult day care'],
  'senior-meal-delivery':         ['Senior Meal Delivery', 'senior meal delivery'],
  'medical-alert':                ['Medical Alert System Provider', 'medical alert system'],
  'mobility-equipment':           ['Mobility Equipment Supplier', 'mobility equipment'],
  'walk-in-bath-installer':       ['Walk-in Bath / Shower Installer', 'walk-in bath installer'],
  'disability-support':           ['Disability Support Service', 'disability support'],
  'ndis-provider':                ['NDIS Provider', 'NDIS provider', ['AU']],
});

// ── Retail & Specialty Shops (19) ────────────────────────────────────────
const RETAIL = build('Retail & Specialty Shops', {
  'jeweler':                      ['Jeweler / Jewelry Store', 'jeweler'],
  'watch-repair':                 ['Watch Repair', 'watch repair'],
  'tailor':                       ['Tailor / Alterations', 'tailor'],
  'shoe-repair':                  ['Shoe Repair / Cobbler', 'shoe repair'],
  'furniture-store':              ['Furniture Store', 'furniture store'],
  'mattress-store':               ['Mattress Store', 'mattress store'],
  'thrift-store':                 ['Thrift Store / Consignment', 'thrift store'],
  'flooring-store':               ['Flooring Store / Showroom', 'flooring store'],
  'kitchen-bath-showroom':        ['Kitchen & Bath Showroom', 'kitchen and bath showroom'],
  'hardware-store':               ['Hardware Store', 'hardware store'],
  'garden-center':                ['Nursery / Garden Center', 'garden center'],
  'smoke-shop':                   ['Smoke Shop / Vape Shop', 'vape shop'],
  'gun-store':                    ['Gun Store / Firearms Dealer', 'gun store'],
  'music-store':                  ['Musical Instrument Store', 'music store'],
  'bicycle-shop':                 ['Bicycle Shop', 'bicycle shop'],
  'trophy-shop':                  ['Trophy / Engraving Shop', 'trophy shop'],
  'printing-center':              ['Printing / Copy Center', 'printing service'],
  'sign-shop':                    ['Sign Shop', 'sign shop'],
  'storage-unit':                 ['Storage Unit / Self-Storage', 'self storage'],
});

// ── Religious & Community (8) ────────────────────────────────────────────
const RELIGIOUS = build('Religious & Community', {
  'church':                       ['Church', 'church'],
  'mosque':                       ['Mosque', 'mosque'],
  'synagogue':                    ['Synagogue', 'synagogue'],
  'temple':                       ['Temple / Gurdwara', 'temple'],
  'funeral-home':                 ['Funeral Home / Mortuary', 'funeral home'],
  'cemetery':                     ['Cemetery / Crematorium', 'crematorium'],
  'nonprofit':                    ['Nonprofit / Charity', 'nonprofit'],
  'community-center':             ['Community Center', 'community center'],
});

// ── Merged map ─────────────────────────────────────────────────────────────
export const CATEGORIES: Record<string, CategoryEntry> = {
  ...HOME_SERVICES,
  ...CONSTRUCTION,
  ...HEALTH,
  ...MENTAL_HEALTH,
  ...ALTERNATIVE,
  ...LEGAL,
  ...FINANCIAL,
  ...AUTOMOTIVE,
  ...FOOD,
  ...BEAUTY,
  ...FITNESS,
  ...PETS,
  ...EDUCATION,
  ...EVENTS,
  ...TECH,
  ...CLEANING,
  ...MARINE,
  ...AGRICULTURE,
  ...SENIOR_CARE,
  ...RETAIL,
  ...RELIGIOUS,
};

// ── Reverse indexes (built once at module load) ────────────────────────────

// Google Places type → sector name
const UNSUPPORTED = '__UNSUPPORTED__';

export const PLACES_TYPE_TO_SECTOR: Record<string, string> = {
  // Home Services
  plumber: 'Home Services — General',
  electrician: 'Home Services — General',
  roofing_contractor: 'Home Services — General',
  locksmith: 'Home Services — General',
  moving_company: 'Home Services — General',
  painter: 'Home Services — General',
  storage: 'Home Services — General',
  general_contractor: 'Construction & Trades',
  // Health & Medical
  dentist: 'Health & Medical',
  doctor: 'Health & Medical',
  hospital: 'Health & Medical',
  pharmacy: 'Health & Medical',
  physiotherapist: 'Health & Medical',
  drugstore: 'Health & Medical',
  veterinary_care: 'Pet Services',
  health: 'Health & Medical',
  // Legal
  lawyer: 'Legal',
  // Financial & Professional
  accountant: 'Financial & Professional Services',
  insurance_agency: 'Financial & Professional Services',
  real_estate_agency: 'Financial & Professional Services',
  travel_agency: 'Financial & Professional Services',
  // Automotive
  car_repair: 'Automotive',
  car_dealer: 'Automotive',
  car_wash: 'Automotive',
  gas_station: 'Automotive',
  // Food & Hospitality
  restaurant: 'Food & Hospitality',
  cafe: 'Food & Hospitality',
  bakery: 'Food & Hospitality',
  bar: 'Food & Hospitality',
  meal_delivery: 'Food & Hospitality',
  meal_takeaway: 'Food & Hospitality',
  lodging: 'Food & Hospitality',
  campground: 'Food & Hospitality',
  // Personal Care & Beauty
  hair_care: 'Personal Care & Beauty',
  beauty_salon: 'Personal Care & Beauty',
  spa: 'Personal Care & Beauty',
  // Fitness
  gym: 'Fitness & Wellness',
  // Pet Services
  pet_store: 'Pet Services',
  // Education
  school: 'Education & Tutoring',
  // Events & Entertainment
  florist: 'Events & Entertainment',
  night_club: 'Events & Entertainment',
  movie_theater: 'Events & Entertainment',
  // Retail
  store: 'Retail & Specialty Shops',
  hardware_store: 'Retail & Specialty Shops',
  furniture_store: 'Retail & Specialty Shops',
  jewelry_store: 'Retail & Specialty Shops',
  clothing_store: 'Retail & Specialty Shops',
  shoe_store: 'Retail & Specialty Shops',
  bicycle_store: 'Retail & Specialty Shops',
  electronics_store: 'Retail & Specialty Shops',
  book_store: 'Retail & Specialty Shops',
  home_goods_store: 'Retail & Specialty Shops',
  liquor_store: 'Retail & Specialty Shops',
  convenience_store: 'Retail & Specialty Shops',
  // Cleaning
  laundry: 'Cleaning Services (Specialized)',
  cleaning_service: 'Cleaning Services (Specialized)',
  // Religious & Community
  church: 'Religious & Community',
  mosque: 'Religious & Community',
  synagogue: 'Religious & Community',
  hindu_temple: 'Religious & Community',
  funeral_home: 'Religious & Community',
  // Not our customer — government, transit, attractions, institutions
  airport: UNSUPPORTED,
  amusement_park: UNSUPPORTED,
  aquarium: UNSUPPORTED,
  art_gallery: UNSUPPORTED,
  atm: UNSUPPORTED,
  bank: UNSUPPORTED,
  bowling_alley: UNSUPPORTED,
  bus_station: UNSUPPORTED,
  car_rental: UNSUPPORTED,
  casino: UNSUPPORTED,
  cemetery: UNSUPPORTED,
  city_hall: UNSUPPORTED,
  courthouse: UNSUPPORTED,
  department_store: UNSUPPORTED,
  embassy: UNSUPPORTED,
  fire_station: UNSUPPORTED,
  library: UNSUPPORTED,
  light_rail_station: UNSUPPORTED,
  local_government_office: UNSUPPORTED,
  movie_rental: UNSUPPORTED,
  museum: UNSUPPORTED,
  park: UNSUPPORTED,
  parking: UNSUPPORTED,
  police: UNSUPPORTED,
  post_office: UNSUPPORTED,
  primary_school: UNSUPPORTED,
  secondary_school: UNSUPPORTED,
  rv_park: UNSUPPORTED,
  shopping_mall: UNSUPPORTED,
  stadium: UNSUPPORTED,
  subway_station: UNSUPPORTED,
  supermarket: UNSUPPORTED,
  taxi_stand: UNSUPPORTED,
  tourist_attraction: UNSUPPORTED,
  train_station: UNSUPPORTED,
  transit_station: UNSUPPORTED,
  university: UNSUPPORTED,
  zoo: UNSUPPORTED,
};

// Sector name → all category slugs in that sector
export const SECTOR_CATEGORIES: Record<string, string[]> = {};
for (const [slug, entry] of Object.entries(CATEGORIES)) {
  const list = SECTOR_CATEGORIES[entry.sector] || (SECTOR_CATEGORIES[entry.sector] = []);
  list.push(slug);
}

// ── Lookup helpers ─────────────────────────────────────────────────────────

/** Given Places types, return the sector name, UNSUPPORTED marker, or null (unmapped). */
export function sectorFromPlacesTypes(types: string[], businessName?: string): string | null {
  for (const t of types) {
    const sector = PLACES_TYPE_TO_SECTOR[t];
    if (sector && sector !== UNSUPPORTED) return sector;
  }
  for (const t of types) {
    if (PLACES_TYPE_TO_SECTOR[t] === UNSUPPORTED) {
      console.log('[categories] UNSUPPORTED Places type — not our customer:', { businessName, types });
      return UNSUPPORTED;
    }
  }
  console.warn('[categories] UNMAPPED Places types — needs mapping:', { businessName, types });
  return null;
}

/** Get all categories in a sector, optionally filtered by country. */
export function categoriesInSector(sector: string, countryCode?: string): CategoryEntry[] {
  const slugs = SECTOR_CATEGORIES[sector];
  if (!slugs) return [];
  return slugs
    .map(s => CATEGORIES[s])
    .filter(c => !c.countries || !countryCode || c.countries.includes(countryCode));
}

/** Find a category by matching website signal text against queryTerms in a sector. */
export function matchCategoryFromSignal(
  sector: string,
  websiteText: string,
  countryCode?: string,
): CategoryEntry | null {
  const candidates = categoriesInSector(sector, countryCode);
  const lower = websiteText.toLowerCase();
  // Prefer longer queryTerms (more specific) first
  const sorted = [...candidates].sort((a, b) => b.queryTerm.length - a.queryTerm.length);
  for (const cat of sorted) {
    if (lower.includes(cat.queryTerm.toLowerCase())) return cat;
    // Also match label keywords (e.g. "personal injury" in the label)
    const labelWords = cat.label.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    if (labelWords.length > 5 && lower.includes(labelWords)) return cat;
  }
  return null;
}

export type CategoryConfidence = 'website_signal' | 'website_signal_cross_sector' | 'places_narrowed' | 'haiku_constrained' | 'haiku_global' | 'sector_fallback';

export interface ResolvedCategory {
  slug: string;
  entry: CategoryEntry;
  confidence: CategoryConfidence;
}

export function matchCategoryGlobal(
  text: string,
  countryCode?: string,
): CategoryEntry | null {
  const lower = text.toLowerCase();
  const code = countryCode?.toUpperCase();
  const entries = Object.values(CATEGORIES)
    .filter(c => !c.countries || !code || c.countries.includes(code))
    .sort((a, b) => b.queryTerm.length - a.queryTerm.length);
  for (const cat of entries) {
    if (lower.includes(cat.queryTerm.toLowerCase())) return cat;
    const labelWords = cat.label.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    if (labelWords.length > 5 && lower.includes(labelWords)) return cat;
  }
  return null;
}

export function findCategoryByQueryTerm(
  queryTerm: string,
  countryCode?: string,
): ResolvedCategory | null {
  const lower = queryTerm.toLowerCase().trim();
  const code = countryCode?.toUpperCase();
  for (const [slug, entry] of Object.entries(CATEGORIES)) {
    if (entry.countries && code && !entry.countries.includes(code)) continue;
    if (entry.queryTerm.toLowerCase() === lower) {
      return { slug, entry, confidence: 'haiku_global' };
    }
  }
  return null;
}

/** Count non-overlapping occurrences of `needle` in `haystack` (case-insensitive). */
function countOccurrences(haystack: string, needle: string): number {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  let count = 0;
  let pos = 0;
  while ((pos = h.indexOf(n, pos)) !== -1) { count++; pos += n.length; }
  return count;
}

/**
 * Resolve a category from available signals.
 *
 * Tiebreak rules:
 * - Specific Places type (dentist, lawyer, plumber — directly matches a category):
 *   website signal overrides only with 3+ mentions (a services list mention isn't enough).
 * - Generic Places type (general_contractor — no direct category match):
 *   website signal runs unrestricted.
 * - Cross-sector rescue always requires the website signal (any mention count).
 */
export function resolveCategory(
  placesTypes: string[] | null,
  websiteText: string | null,
  countryCode?: string,
  businessName?: string,
): ResolvedCategory | null {
  const sector = placesTypes ? sectorFromPlacesTypes(placesTypes, businessName) : null;
  if (!sector || sector === UNSUPPORTED) return null;

  // Check if Places type directly matches a category (specific vs generic)
  let placesDirectMatch: { slug: string; entry: CategoryEntry } | null = null;
  if (placesTypes) {
    for (const t of placesTypes) {
      const normalized = t.replace(/_/g, ' ');
      const match = Object.entries(CATEGORIES).find(
        ([, c]) => c.sector === sector && c.queryTerm.toLowerCase() === normalized,
      );
      if (match) { placesDirectMatch = { slug: match[0], entry: match[1] }; break; }
    }
  }

  const STRONG_SIGNAL_THRESHOLD = 3;

  console.log('[resolveCategory] inputs:', { businessName, placesTypes, sector, placesDirectMatch: placesDirectMatch ? placesDirectMatch.slug : null });

  // Try website signal (in-sector)
  if (websiteText) {
    const match = matchCategoryFromSignal(sector, websiteText, countryCode);
    if (match) {
      const slug = Object.entries(CATEGORIES).find(([, v]) => v === match)?.[0];
      if (slug) {
        if (placesDirectMatch && slug !== placesDirectMatch.slug) {
          const mentions = countOccurrences(websiteText, match.queryTerm);
          console.log('[resolveCategory] tiebreak:', { businessName, websiteMatch: match.queryTerm, mentions, placesMatch: placesDirectMatch.slug, threshold: STRONG_SIGNAL_THRESHOLD });
          if (mentions >= STRONG_SIGNAL_THRESHOLD) {
            return { slug, entry: match, confidence: 'website_signal' };
          }
          // Weak signal — fall through to Places direct match
        } else {
          return { slug, entry: match, confidence: 'website_signal' };
        }
      }
    }
  }

  // Try website signal across ALL sectors (cross-sector rescue).
  // Runs before placesDirectMatch fallback — a window washing company
  // tagged as general_contractor should resolve to window-cleaning.
  if (websiteText) {
    const globalMatch = matchCategoryGlobal(websiteText, countryCode);
    if (globalMatch) {
      const globalSlug = Object.entries(CATEGORIES).find(([, v]) => v === globalMatch)?.[0];
      if (globalSlug && globalMatch.sector !== sector) {
        return { slug: globalSlug, entry: globalMatch, confidence: 'website_signal_cross_sector' };
      }
    }
  }

  // Specific Places type wins over weak in-sector website signal
  if (placesDirectMatch) {
    console.log('[resolveCategory] returning placesDirectMatch (weak signal rejected):', { businessName, slug: placesDirectMatch.slug });
    return { slug: placesDirectMatch.slug, entry: placesDirectMatch.entry, confidence: 'places_narrowed' };
  }

  // Sector fallback — find the "general" category for this sector
  const sectorSlugs = SECTOR_CATEGORIES[sector];
  if (sectorSlugs?.length) {
    const slug = sectorSlugs[0];
    return { slug, entry: CATEGORIES[slug], confidence: 'sector_fallback' };
  }

  return null;
}
