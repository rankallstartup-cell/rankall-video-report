import { isMedicalIndustryName, isLegalIndustryName, isKnownIndustry } from './trustSignals';
// NOTE (ax89): this module is imported by client components (report
// page), so it must stay client-bundle-safe: NO Node imports, NO
// server-side fetches. The fetching entry (detectTrustSignals) lives
// in lib/trustServer.ts (server-only, DNS-guarded SSRF).

// ── COUNTRY-AWARE TRUST SOURCE MAPPING ───────────────────────────────
// Text patterns that indicate a given trust source URL appears in scan
// responses or citation sources. Keyed by the trustSources URLs used in
// lib/countryConfig.ts so directory detection is correct per market.
const TRUST_SOURCE_PATTERNS: Record<string, string[]> = {
  'google.com/maps': ['google business', 'google maps', 'google my business', 'google.com/maps'],
  'trustpilot.com': ['trustpilot'],
  'yelp.com': ['yelp'],
  'healthgrades.com': ['healthgrades'],
  'zocdoc.com': ['zocdoc'],
  'checkatrade.com': ['checkatrade'],
  'which.co.uk': ['which?', 'which.co.uk'],
  'nhs.uk': ['nhs', 'nhs profile'],
  'cqc.org.uk': ['cqc', 'care quality commission'],
  'healthengine.com.au': ['healthengine'],
  'hipages.com.au': ['hipages'],
  'truelocal.com.au': ['true local', 'truelocal'],
  'ratemds.com': ['ratemds', 'rate mds'],
  'homestars.com': ['homestars'],
  'practo.com': ['practo'],
  'justdial.com': ['justdial', 'just dial'],
  'sulekha.com': ['sulekha'],
  'indiamart.com': ['indiamart', 'india mart'],
  'bbb.org': ['bbb', 'better business bureau'],
  'facebook.com': ['facebook'],
  'bayut.com': ['bayut'],
  'dubizzle.com': ['dubizzle'],
  'goldenpages.ie': ['golden pages', 'goldenpages'],
  'boards.ie': ['boards.ie'],
  'hse.ie': ['hse', 'health service executive'],
  'lawsociety.ie': ['law society', 'lawsociety'],
  'healthpoint.co.nz': ['healthpoint'],
  'nocowboys.co.nz': ['no cowboys', 'nocowboys'],
  'neighbourly.co.nz': ['neighbourly'],
  'yellow.co.nz': ['yellow.co.nz', 'yellow nz'],
  'healthhub.sg': ['healthhub', 'health hub'],
  'casetrust.org.sg': ['casetrust', 'case trust'],
  'sma.org.sg': ['sma', 'singapore medical association'],
  'singaporelegaladvice.com': ['singapore legal advice', 'singaporelegaladvice'],
  'hellopeter.com': ['hellopeter', 'hello peter'],
  'privateproperty.co.za': ['private property', 'privateproperty'],
  'healthdirectory.co.za': ['health directory', 'healthdirectory'],
  'trustedreviews.co.za': ['trusted reviews', 'trustedreviews'],
  'jumia.com.ng': ['jumia'],
  'businesslist.com.ng': ['businesslist'],
  'connectnigeria.com': ['connect nigeria', 'connectnigeria'],
  'vconnect.com': ['vconnect'],
  'myjoyonline.co.ke': ['myjoyonline', 'my joy online'],
  'pigiame.co.ke': ['pigiame', 'pigia me'],
  'jiji.co.ke': ['jiji'],
  'kenyayp.com': ['kenya yellow pages', 'kenyayp'],
  'tonaton.com': ['tonaton'],
  'ghanapostgps.com': ['ghanapostgps', 'ghana post gps'],
  'businessghana.com': ['business ghana', 'businessghana'],
  'meqasa.com': ['meqasa'],
  'booky.ph': ['booky'],
  'zomato.com': ['zomato'],
  'olx.ph': ['olx'],
  'philhealthcare.com': ['philhealthcare'],
};

// Display metadata for each trust source URL (name, domain authority, impact, points).
// azzz: the DA numbers are STATIC EDITORIAL ESTIMATES — DA is never
// measured. Every render site must use '~' (see below) so the value
// never reads as a measured fact.
interface SourceMeta { name: string; impact: 'high' | 'medium' | 'low'; da: number; pointsImpact: number }
const TRUST_SOURCE_REGISTRY: Record<string, SourceMeta> = {
  'google.com/maps': { name: 'Google Business', impact: 'high', da: 95, pointsImpact: 15 },
  'yelp.com': { name: 'Yelp', impact: 'high', da: 94, pointsImpact: 8 },
  'bbb.org': { name: 'BBB', impact: 'medium', da: 91, pointsImpact: 8 },
  'healthgrades.com': { name: 'Healthgrades', impact: 'medium', da: 78, pointsImpact: 9 },
  'zocdoc.com': { name: 'Zocdoc', impact: 'medium', da: 72, pointsImpact: 7 },
  'facebook.com': { name: 'Facebook', impact: 'medium', da: 71, pointsImpact: 5 },
  'trustpilot.com': { name: 'Trustpilot', impact: 'high', da: 73, pointsImpact: 9 },
  'checkatrade.com': { name: 'Checkatrade', impact: 'high', da: 70, pointsImpact: 9 },
  'which.co.uk': { name: 'Which?', impact: 'medium', da: 80, pointsImpact: 8 },
  'nhs.uk': { name: 'NHS Profile', impact: 'high', da: 90, pointsImpact: 10 },
  'cqc.org.uk': { name: 'CQC', impact: 'medium', da: 78, pointsImpact: 8 },
  'healthengine.com.au': { name: 'HealthEngine', impact: 'high', da: 68, pointsImpact: 9 },
  'hipages.com.au': { name: 'hipages', impact: 'medium', da: 66, pointsImpact: 7 },
  'truelocal.com.au': { name: 'True Local', impact: 'medium', da: 64, pointsImpact: 6 },
  'ratemds.com': { name: 'RateMDs', impact: 'high', da: 70, pointsImpact: 9 },
  'homestars.com': { name: 'HomeStars', impact: 'medium', da: 66, pointsImpact: 7 },
  'practo.com': { name: 'Practo', impact: 'high', da: 72, pointsImpact: 9 },
  'justdial.com': { name: 'JustDial', impact: 'medium', da: 70, pointsImpact: 7 },
  'sulekha.com': { name: 'Sulekha', impact: 'medium', da: 65, pointsImpact: 6 },
  'indiamart.com': { name: 'IndiaMART', impact: 'medium', da: 72, pointsImpact: 6 },
  'bayut.com': { name: 'Bayut', impact: 'medium', da: 68, pointsImpact: 7 },
  'dubizzle.com': { name: 'Dubizzle', impact: 'medium', da: 70, pointsImpact: 7 },
  'goldenpages.ie': { name: 'Golden Pages', impact: 'medium', da: 60, pointsImpact: 5 },
  'boards.ie': { name: 'Boards.ie', impact: 'medium', da: 70, pointsImpact: 6 },
  'healthpoint.co.nz': { name: 'Healthpoint', impact: 'medium', da: 62, pointsImpact: 7 },
  'nocowboys.co.nz': { name: 'No Cowboys', impact: 'medium', da: 58, pointsImpact: 6 },
  'healthhub.sg': { name: 'HealthHub', impact: 'medium', da: 65, pointsImpact: 7 },
  'casetrust.org.sg': { name: 'CaseTrust', impact: 'medium', da: 60, pointsImpact: 6 },
  'hellopeter.com': { name: 'HelloPeter', impact: 'high', da: 66, pointsImpact: 8 },
  'privateproperty.co.za': { name: 'Private Property', impact: 'low', da: 64, pointsImpact: 4 },
  'jumia.com.ng': { name: 'Jumia', impact: 'medium', da: 70, pointsImpact: 6 },
  'businesslist.com.ng': { name: 'BusinessList', impact: 'low', da: 50, pointsImpact: 4 },
  'pigiame.co.ke': { name: 'PigiaMe', impact: 'low', da: 55, pointsImpact: 5 },
  'jiji.co.ke': { name: 'Jiji', impact: 'low', da: 60, pointsImpact: 5 },
  'tonaton.com': { name: 'Tonaton', impact: 'low', da: 55, pointsImpact: 5 },
  'meqasa.com': { name: 'meQasa', impact: 'low', da: 55, pointsImpact: 4 },
  'olx.ph': { name: 'OLX', impact: 'low', da: 70, pointsImpact: 5 },
  'philhealthcare.com': { name: 'PhilHealthcare', impact: 'low', da: 50, pointsImpact: 4 },
};

function metaForSource(url: string): SourceMeta {
  if (TRUST_SOURCE_REGISTRY[url]) return TRUST_SOURCE_REGISTRY[url];
  // Fallback: derive a display name from the domain
  const domain = url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const base = domain.split('.')[0];
  const name = base.charAt(0).toUpperCase() + base.slice(1);
  return { name, impact: 'medium', da: 60, pointsImpact: 5 }; // fallback DA estimate
}

function patternsForSource(url: string): string[] {
  if (TRUST_SOURCE_PATTERNS[url]) return TRUST_SOURCE_PATTERNS[url];
  const domain = url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return [domain, domain.split('.')[0]];
}

export interface TrustSignal {
  name: string;
  // b0fh: 'not_checked' — the signal was never measured (website not
  // located / could not be analyzed). It must NOT read as a failure:
  // renderers show it neutrally and the score excludes it.
  status: 'good' | 'warning' | 'danger' | 'missing' | 'not_checked';
  value: string;
  impact: 'high' | 'medium' | 'low';
  fixAvailable: boolean;
  consequence?: string;
  pointsImpact?: number;
}

export interface TrustSignalReport {
  technical: TrustSignal[];
  directory: TrustSignal[];
  reviews: TrustSignal[];
  community: TrustSignal[];
  // ax88: the 4 AI-platform signals that calculateOverall already scored
  // but were never returned — the score's inputs were uninspectable.
  aiPlatforms: TrustSignal[];
  overall: number;
}

// ── PATTERNS ─────────────────────────────────────────────────────────
const REVIEW_PATTERNS = /\breviews?\b/i;
const RESPONSE_RATE_PATTERNS = /\b(responds? to reviews?|review responses?|replies? to reviews?|owner responses?)\b/i;
const RATING_PATTERNS = [
  /(\d+(?:\.\d+)?)\s*(?:\/\s*5|out of 5)\b/gi,
  /(\d+(?:\.\d+)?)\s*stars?\b/gi,
  /(\d+(?:\.\d+)?)-star\b/gi,
];
const FORUM_PATTERNS = /\b(forum|forums|community board|quora|discourse|city-data|tripadvisor forum)\b/i;
const NEXTDOOR_PATTERNS = /\b(nextdoor|next door)\b/i;
// azzv: the old NEWS/AWARD patterns matched generic words, so almost any
// AI response scored Local news / Awards = good with no real evidence
// ('in this article…', 'features free parking', 'top rated'). Press and
// award claims now need real evidence in a BUSINESS-mentioning sentence.
// Bare praise words ('top rated', 'best of', 'certified') only reach the
// warning tier, never 'good'.
//
// azzv residual: the first rewrite still accepted ANY "covered by" /
// "featured on" phrase and any outlet-ish common word, so "covered by
// insurance", "post-op care", "listed on Yelp" and "on Sun Street …
// named after" all scored Local news = good. Press evidence now needs a
// real OUTLET: a proper-noun publication name (case-sensitive "…
// Times/News/Journal/Herald/Tribune/Post/Gazette/…", "The Sun"), a
// known broadcaster/wire (BBC, CNN, NPR, Reuters, …), or a TV/radio call
// sign (WFAA, KXAS-TV) — in a coverage construction: "featured in /
// reported by / according to <Outlet>" or "<Outlet> reported/covered…".
const OUTLET_NOUN = '(?:Times|News|Journal|Herald|Tribune|Post|Gazette|Chronicle|Observer|Dispatch|Ledger|Courier|Sentinel|Telegraph|Guardian|Independent|Examiner|Bulletin|Register|Inquirer|Star|Sun|Mirror|Express|Standard|Record|Press|Magazine|Weekly|Daily|Today|Monthly|Reporter|Leader|Mercury|Advertiser|Argus|Echo|Eagle|Republic|Statesman|Globe|Voice|Patch)';
// One or more Capitalised words (or "The") before the outlet noun; the
// noun must not be followed by a street word ("Sun Street", "Post Road").
const OUTLET_PROPER = `(?:The\\s+)?(?:[A-Z][A-Za-z'’.&-]*\\s+){0,4}(?:[A-Z][A-Za-z'’.&]*(?:\\s+|-)|The\\s+)${OUTLET_NOUN}\\b(?!\\s+(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Boulevard|Blvd|Way|Office|Box|Hill|Plaza|Square)\\b)`;
const OUTLET_KNOWN = '(?:BBC|CNN|NPR|PBS|ABC|NBC|CBS|Fox News|Reuters|Associated Press|AP News|Bloomberg|Forbes|Axios|Eater|Time Out|Business Insider|USA Today|HuffPost|Vox|Sky News|ITV|Channel \\d{1,2}|NDTV|Times of India|Hindustan Times|The Hindu|ABC News|CBC|CTV|RTÉ|RTE|Stuff|Al Jazeera)';
const OUTLET_CALLSIGN = '(?:(?!(?:WHO|KFC|WWE|WWF|KPI|KPMG|WHY|WOW)\\b)[KW][A-Z]{2,3}(?:-(?:TV|FM|AM|DT))?)';
const OUTLET = `(?:${OUTLET_KNOWN}\\b|${OUTLET_PROPER}|\\b${OUTLET_CALLSIGN}\\b)`;
const COVERAGE_VERB_BEFORE = '(?:featured|profiled|covered|interviewed|quoted|mentioned|reported|spotlighted|highlighted|written up|named|ranked|recognized|recognised|reviewed)';
const COVERAGE_VERB_AFTER = '(?:reported|covered|featured|profiled|named|ranked|interviewed|highlighted|spotlighted|wrote about|reviewed|praised|listed)';
const PRESS_EVIDENCE_PATTERNS: RegExp[] = [
  new RegExp(`\\b${COVERAGE_VERB_BEFORE}\\s+(?:in|by|on)\\s+(?:the\\s+)?${OUTLET}`),
  new RegExp(`\\b[Aa]ccording to\\s+(?:the\\s+)?${OUTLET}`),
  new RegExp(`${OUTLET}[^.;]{0,40}?\\b${COVERAGE_VERB_AFTER}\\b(?!\\s+after\\b)`),
  /\b(?:press|media|news) coverage\b|\bin the news\b|\bmade headlines\b/i,
];
// Insurance / clinical phrases are never press, whatever verb they use.
const NOT_PRESS_CONTEXT = /\b(?:insurance|insurer|insured|medicare|medicaid|ppo|hmo|dental plan|health plan|copay|deductible|post-?op|warranty)\b/i;
// The business's OWN name can contain an outlet noun ("Lone Star Dental",
// "Express Dental", "Sun Valley Dentistry") — mask it before the outlet
// check so the business is never mistaken for a publication.
function maskBusinessName(sentence: string, businessInput: string): string {
  const tokens = nameTokens(businessInput || '');
  if (tokens.length === 0) return sentence;
  const folded = foldText(sentence);
  let out = sentence;
  const re = sequenceRegex(tokens);
  let m: RegExpExecArray | null;
  while ((m = re.exec(folded)) !== null) {
    out = out.slice(0, m.index) + 'x'.repeat(m[0].length) + out.slice(m.index + m[0].length);
  }
  return out;
}

function hasPressEvidenceIn(rawSentence: string, businessInput = ''): boolean {
  const sentence = maskBusinessName(rawSentence, businessInput);
  for (const re of PRESS_EVIDENCE_PATTERNS) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = g.exec(sentence)) !== null) {
      if (NOT_PRESS_CONTEXT.test(m[0])) continue;
      if (isNegated(sentence, m.index)) continue;
      return true;
    }
  }
  return false;
}
const NEWS_WEAK = /\b(news|press|article|featured|media|newspaper)\b/i;
// An award claim needs BOTH an award word AND a naming context (named
// award/org/year). Either alone is bare praise, not evidence.
const AWARD_WORD = /\b(award|awarded|winner|won|voted|named|recognized|recognised|accredited|certified|honou?red)\b/i;
const AWARD_CONTEXT = /\b(awards?|association|board|chamber|society|institute|council|academy|foundation|magazine|digest|journal|best of|top|patient'?s choice|20\d\d)\b/i;
const AWARD_WEAK = /\b(top rated|best of|certified|recognized|recognised|voted|awards?)\b/i;
// azzv residual: certification phrases are CREDENTIALS, not awards.
// "board-certified" satisfies the award-word ("certified") +
// context ("board") pair on its own, as does "certified by the
// board" — both marked Awards = good with no actual award. Strip
// certification phrases before the award-evidence check (the weak
// tier still sees "certified" on the raw sentence -> warning, which
// is the honest tier for a credential mention).
const CERTIFICATION_PHRASES = /\bboard[-\s]certified\b|\bcertified by (?:the )?(?:state )?board\b/gi;
const REVIEW_COUNT_PATTERNS = /([\d,]+)\s*(?:google\s*)?reviews?\b/gi;
const COMPETITOR_REVIEW_COUNT_PATTERNS = /(\d{2,})\s*(?:google\s*)?reviews?\b/gi;
const RECENT_REVIEW_PATTERNS = /\b(recent reviews?|latest reviews?|new reviews?|recently reviewed)\b/i;
const REVIEW_KEYWORD_PATTERNS = /\b(friendly|professional|responsive|knowledgeable|experienced|caring|gentle|efficient|clean|welcoming|trustworthy|reliable|excellent|outstanding|recommend)\b/gi;
const MULTI_PLATFORM_REVIEW_PATTERNS = /\b(yelp|google|healthgrades|zocdoc|facebook|trustpilot|tripadvisor)\b.*?\b(reviews?|ratings?)\b/gi;
const MENTION_RATE_THRESHOLD = 0.5;

// ── DIRECTORY PLATFORMS ───────────────────────────────────────────────
const DIRECTORY_PLATFORMS = [
  { name: 'Google Business', key: 'Google',       impact: 'high'   as const, authority: 95, pointsImpact: 15 },
  { name: 'Yelp',            key: 'Yelp',          impact: 'high'   as const, authority: 82, pointsImpact: 8  },
  { name: 'Healthgrades',    key: 'Healthgrades',  impact: 'medium' as const, authority: 78, pointsImpact: 9  },
  { name: 'Zocdoc',          key: 'Zocdoc',        impact: 'medium' as const, authority: 72, pointsImpact: 7  },
  { name: 'Reddit',          key: 'Reddit',        impact: 'medium' as const, authority: 88, pointsImpact: 12 },
  { name: 'BBB',             key: 'BBB',           impact: 'medium' as const, authority: 76, pointsImpact: 6  },
  { name: 'Facebook',        key: 'Facebook',      impact: 'medium' as const, authority: 71, pointsImpact: 5  },
  { name: 'LinkedIn',        key: 'LinkedIn',      impact: 'low'    as const, authority: 68, pointsImpact: 4  },
  { name: 'TripAdvisor',     key: 'TripAdvisor',   impact: 'medium' as const, authority: 74, pointsImpact: 6  },
  { name: 'Angi',            key: 'Angi',          impact: 'medium' as const, authority: 65, pointsImpact: 5  },
  { name: 'Trustpilot',      key: 'Trustpilot',    impact: 'medium' as const, authority: 73, pointsImpact: 6  },
  { name: 'Instagram',       key: 'Instagram',     impact: 'low'    as const, authority: 61, pointsImpact: 3  },
];

// ── HELPERS ───────────────────────────────────────────────────────────
function normalise(text: string): string {
  // ax87: Unicode-aware (NFKD + strip marks) — "Café Müller" -> "cafe muller".
  return foldText(text)
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleContainsBusiness(title: string, businessInput: string): boolean {
  const normTitle = normalise(title);
  const normBiz = normalise(businessInput);
  if (!normTitle || !normBiz) return false;
  if (normTitle.includes(normBiz)) return true;
  if (businessMentionIndex(title, businessInput) >= 0) return true;
  const words = normBiz.split(' ').filter(w => w.length > 3);
  if (words.length === 0) return normTitle.includes(normBiz);
  const matchCount = words.filter(w => normTitle.includes(w)).length;
  return matchCount / words.length >= 0.7;
}

// b8ad: the business's CORE name — a Places display name with its SEO
// tagline stripped ('Royal Lane Dental Center - Best Dentist in Dallas |
// Clear Aligners and Veneers in Dallas' -> 'Royal Lane Dental Center').
// The title check must run against the core name: checking a real title
// against the full tagline string makes every real title fail ('Title
// doesn't mention your business name' for a site whose title holds the
// core name). TITLE CHECK ONLY — attribution keeps the full resolved
// name. Only strips when the prefix has >= 2 tokens, so 'Smith | Jones'
// (1-token prefix) is never cut.
export function coreBusinessName(name: string | null | undefined): string {
  // A scan row with no name and no input must not crash the page.
  if (!name) return '';
  const m = name.match(/^(.+?)\s+[-|]\s+.+$/);
  if (!m) return name;
  const prefix = m[1].trim();
  if (prefix.split(/\s+/).length < 2) return name;
  return prefix;
}

// ax89: directory matching used raw substring includes() — a source
// string containing 'healthgrades' anywhere (e.g. 'myhealthgrades',
// a path segment, a "Healthgrades alternatives" mention) counted as a
// verified Healthgrades citation ('good'). Word-boundary matching keeps
// real citations ('Healthgrades', 'healthgrades.com/...') while
// killing substring false positives.
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordMatch(text: string, key: string): boolean {
  return new RegExp(`(?<!\\w)${escapeRegExp(key)}(?!\\w)`, 'i').test(text);
}

function sourcesInclude(sources: string[], key: string): boolean {
  return sources.some(s => wordMatch(s, key));
}

function scanTextMentions(text: string, key: string): boolean {
  return wordMatch(text, key);
}

// ── SENTENCE-LEVEL ATTRIBUTION (azzr) ─────────────────────────────
// ax87 filtered whole RESPONSES (mentioned !== false), but a response that
// mentions this business can still quote a COMPETITOR's numbers in the same
// or a neighbouring sentence ("Competitor has 500 reviews, this business
// has 20" -> old code reported 500). Numbers/keywords are now attributed
// at sentence level: a sentence contributes only if it mentions THIS
// business, and a count is picked by nearness to the business-name mention
// (preferring counts AFTER the mention — stats usually follow the name).
// Negated matches ("no reviews", "does not respond to reviews",
// "not friendly") are skipped, not counted as positive evidence.
const NEGATION_WORDS = /\b(no|not|never|doesn't|does not|don't|do not|didn't|did not|without|zero|lacks|lack|missing|none)\b/i;
// ax87 residual: phrases that CONTAIN a negation word but are not
// negations ("Not only does X have 300 reviews", "no doubt", "not just").
const NON_NEGATING_PHRASES = /\b(?:not only|not just|no doubt|no wonder|without (?:a )?doubt|never fails to|no shortage of)\b/gi;

// ax87 residual: abbreviation-aware sentence splitter. The old splitter
// broke on EVERY ". " so "Dr. Smith has 300 reviews" became "Dr." +
// "Smith has 300 reviews" (and "St. Louis", "Mr.", "Inc." likewise),
// detaching numbers from the name they belong to. Decimals ("4.9")
// never split: the boundary needs whitespace after the period.
// Title-style abbreviations are always followed by a name, so they never
// end a sentence; other abbreviations ("Inc.", "Co.", "etc.") only join
// when the next word continues the sentence (lowercase/digit).
const TITLE_ABBREV = /(?:^|[\s(])(?:dr|mr|mrs|ms|mx|prof|st|mt|ft|sr|jr|rev|hon|gov|sen|rep|gen|capt|lt|col|sgt|no|nos|vs|approx|ste|apt|dept|e\.g|i\.e|[a-z])\.$/i;
const SOFT_ABBREV = /(?:^|[\s(])(?:inc|co|corp|ltd|llc|plc|pty|bros|etc|ave|blvd|rd|ln|hwy|est|univ|assn|assoc)\.$/i;
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  const boundary = /(?<=[.!?])\s+|\n+/g;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = boundary.exec(text)) !== null) {
    const before = text.slice(start, m.index);
    const next = text.slice(m.index + m[0].length, m.index + m[0].length + 1);
    if (!m[0].includes('\n')) {
      if (TITLE_ABBREV.test(before)) continue;
      if (SOFT_ABBREV.test(before) && /^[a-z0-9]/.test(next)) continue;
    }
    out.push(before);
    start = m.index + m[0].length;
  }
  out.push(text.slice(start));
  return out.map(s => s.trim()).filter(Boolean);
}

// ax87 residual: Unicode-aware folding. The old matcher stripped every
// non-ASCII letter ("Café Müller" -> "caf" / "ller"), so accented names
// never matched and unaccented AI spellings ("Cafe Muller") never
// matched either. Fold = NFKD + strip combining marks + lowercase,
// applied to BOTH sides. Folding is done per character so the folded
// string keeps the ORIGINAL indices (match indices line up with regex
// matches on the original sentence).
export function foldText(s: string): string {
  let out = '';
  for (const ch of s) {
    const units = ch.length; // 1 or 2 (surrogate pair)
    let f = ch.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase();
    if (f === '’' || f === '‘' || f === 'ʼ') f = "'";
    if (f.length === 0) f = ' ';
    // Keep 1:1 code-unit alignment with the original string.
    out += f.length >= units ? f.slice(0, units) : f.padEnd(units, ' ');
  }
  return out;
}

// Stopwords dropped from name matching (allowed BETWEEN name words).
// Everything else counts, even short words: "ace" is the ONLY
// distinctive word in "Ace Dental", "joe's" in "Joe's Pizza".
const NAME_STOPWORDS = new Set(['the', 'and', 'of', 'for', 'a', 'an', 'in', 'on', 'at', 'to', 'de', 'la', 'el', 'le', 'du', 'des', 'y', 'et']);
// Legal-form suffixes AI answers rarely repeat — never required.
const LEGAL_SUFFIXES = new Set(['llc', 'inc', 'ltd', 'llp', 'pllc', 'plc', 'corp', 'gmbh', 'pty', 'pvt', 'lp', 'pa']);
// A trailing generic descriptor may be omitted ("Brite Smiles" for
// "Brite Smiles Dentistry") — but only when >= 2 distinctive words remain,
// so "Ace Dental" still needs "dental" (else "Ace" = Ace Hardware).
const OPTIONAL_TRAILING_DESCRIPTORS = new Set([
  'dentistry', 'dental', 'dentist', 'dentists', 'clinic', 'practice', 'office', 'surgery',
  'center', 'centre', 'studio', 'salon', 'spa', 'restaurant', 'cafe', 'law', 'firm',
]);
// ax87: a name followed by one of these (capitalised, as part of a proper
// name) is a DIFFERENT, longer business: "Smile Dental Group" is not
// "Smile Dental"; "Brite Smiles Dental Care" is not "Brite Smiles".
const ORG_CONTINUATIONS = new Set([
  ...OPTIONAL_TRAILING_DESCRIPTORS,
  'group', 'associates', 'partners', 'specialists', 'care', 'centers', 'centres', 'studios',
  'institute', 'hospital', 'clinics', 'orthodontics', 'co', 'company', 'collective', 'llc', 'inc',
  'ltd', 'llp', 'pllc', 'plc', 'corp', 'family', 'services', 'solutions', 'health',
]);

// Round 2: generic industry/org words. A name made ONLY of these after
// stopwords are dropped ("The Dental Co" -> "dental co") is not
// distinctive: lowercase prose ("any dental co. near Dallas?") or a
// title-case question ("Best Dental Co in town?") must not count as a
// mention. Such names need the full original name (stopwords included)
// with the generic words capitalised as a proper noun.
const GENERIC_NAME_WORDS = new Set([
  ...ORG_CONTINUATIONS,
  'dentists', 'orthodontist', 'orthodontists', 'medical', 'doctor', 'doctors', 'physician', 'physicians',
  'legal', 'lawyer', 'lawyers', 'attorney', 'attorneys', 'accounting', 'accountants', 'tax',
  'plumbing', 'plumber', 'plumbers', 'electric', 'electrical', 'electrician', 'electricians', 'hvac',
  'roofing', 'roofers', 'cleaning', 'cleaners', 'landscaping', 'construction', 'builders', 'repair',
  'repairs', 'auto', 'motors', 'garage', 'pizza', 'pizzeria', 'bakery', 'coffee', 'bar', 'grill',
  'kitchen', 'diner', 'hair', 'nails', 'nail', 'beauty', 'barber', 'barbers', 'barbershop', 'fitness',
  'gym', 'yoga', 'pilates', 'massage', 'wellness', 'therapy', 'physio', 'physiotherapy', 'chiropractic',
  'chiropractor', 'vet', 'veterinary', 'pet', 'pets', 'eye', 'vision', 'optical', 'optometry',
  'pharmacy', 'insurance', 'realty', 'real', 'estate', 'homes', 'home', 'moving', 'movers', 'storage',
  'marketing', 'design', 'consulting', 'agency', 'shop', 'store', 'market', 'medicine', 'medspa',
]);

const LETTER_OR_DIGIT = '\\p{L}\\p{N}';
const NAME_SEP = `[^${LETTER_OR_DIGIT}]+(?:(?:${[...NAME_STOPWORDS].join('|')}|&)[^${LETTER_OR_DIGIT}]+)?`;

// Scan inputs often carry the location ("Bright Smile Dental Dallas TX",
// "Brite Smiles, Dallas TX", "Brite Smiles in Dallas"). The whole-name
// rule would then require the city in every sentence, so the location
// suffix is stripped first. Only UNAMBIGUOUS forms are stripped: a
// trailing UPPERCASE state code (not one that doubles as a word or
// credential — CO, IN, OR, MD, …), the given city right before it / at
// the end, ", <location>" when it ends in a state code or the city, and
// " in|near <Capitalised place>". Never "Jack in the Box".
const STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CT', 'DC', 'FL', 'GA', 'ID', 'IL', 'IA', 'KS', 'KY', 'MA', 'MI', 'MN', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'NSW', 'VIC', 'QLD', 'TAS', 'ACT', 'BC', 'AB', 'ON', 'QC', 'MB', 'SK', 'NS', 'NB', 'NL', 'PEI', 'UK', 'USA', 'UAE',
]);
export function stripLocationSuffix(name: string, city?: string | null): string {
  let n = (name || '').trim();
  const cityFold = city ? foldText(city).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim() : '';
  const inMatch = /^(.+?)\s+(?:in|near)\s+\p{Lu}[\s\S]*$/u.exec(n);
  if (inMatch && nameTokensRaw(inMatch[1]).length >= 1) n = inMatch[1];
  const comma = n.indexOf(',');
  if (comma > 0) {
    const tail = n.slice(comma + 1).trim();
    const tailWords = tail.split(/\s+/);
    const tailFold = foldText(tail).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (STATE_CODES.has(tailWords[tailWords.length - 1]) || (cityFold && tailFold.startsWith(cityFold))) n = n.slice(0, comma);
  }
  let words = n.split(/\s+/).filter(Boolean);
  if (words.length >= 3 && STATE_CODES.has(words[words.length - 1])) {
    words = words.slice(0, -1);
    // "<Name> <City> TX": the word before a state code is the city unless
    // it is part of the business name ("Smile Dental Group TX").
    const last = foldText(words[words.length - 1]).replace(/[^\p{L}\p{N}]/gu, '');
    if (!cityFold && words.length >= 3 && !ORG_CONTINUATIONS.has(last) && !NAME_STOPWORDS.has(last)) words = words.slice(0, -1);
  }
  if (cityFold) {
    const cw = cityFold.split(' ');
    const tail = words.slice(-cw.length).map(w => foldText(w).replace(/[^\p{L}\p{N}]/gu, ''));
    if (words.length - cw.length >= 1 && tail.join(' ') === cw.join(' ')) words = words.slice(0, -cw.length);
  }
  return words.join(' ');
}

function nameTokensRaw(name: string): string[] {
  return foldText(name).split(new RegExp(`[^${LETTER_OR_DIGIT}']+`, 'u')).filter(Boolean);
}

function nameTokens(name: string): string[] {
  const raw = foldText(stripLocationSuffix(name))
    .split(new RegExp(`[^${LETTER_OR_DIGIT}']+`, 'u'))
    .map(t => t.replace(/^'+|'+$/g, ''))
    .filter(Boolean);
  const distinctive = raw.filter(t => !NAME_STOPWORDS.has(t) && !LEGAL_SUFFIXES.has(t));
  // "The And Co"-style names with no distinctive word: keep what's there
  // rather than collapsing to nothing.
  return distinctive.length > 0 ? distinctive : raw.filter(t => !LEGAL_SUFFIXES.has(t));
}

function tokenPattern(t: string): string {
  return [...t].map(c => (c === "'" ? "'?" : escapeRegExp(c))).join('');
}

function sequenceRegex(tokens: string[]): RegExp {
  return new RegExp(`(?<![${LETTER_OR_DIGIT}])${tokens.map(tokenPattern).join(NAME_SEP)}(?![${LETTER_OR_DIGIT}])`, 'gu');
}

// Is the match ending at `end` immediately continued by a capitalised
// org word ("Smile Dental| Group")? Checked on the ORIGINAL sentence so
// lowercase prose ("Brite Smiles dental care is great") is not a name.
function continuesAsLongerName(original: string, end: number): boolean {
  const m = /^[ \t -]+(\p{Lu}[\p{L}'’]*)/u.exec(original.slice(end));
  if (!m) return false;
  return ORG_CONTINUATIONS.has(foldText(m[1]).replace(/['’]/g, ''));
}

// Every non-stopword in the matched span starts with an uppercase letter
// ("The Dental Co" / "the Dental Co", not "the dental co").
function isCapitalisedProperName(span: string): boolean {
  const words = span.match(/[\p{L}\p{N}'’]+/gu) || [];
  return words.every(w => NAME_STOPWORDS.has(foldText(w)) || /^[\p{Lu}\p{N}]/u.test(w));
}

/** Index of THIS business's name in `sentence` (-1 = not mentioned).
 *  ax87: requires the full distinctive name as a whole-word sequence
 *  (an optional trailing descriptor aside). A two-word PREFIX is not
 *  enough ("Smile Dental" must not credit "Smile Dental Group"), and a
 *  mention that continues into a longer proper name, or that sits inside
 *  a longer KNOWN competitor name, is attributed to that longer name. */
export function businessMentionIndex(sentence: string, businessInput: string, competitorNames: string[] = []): number {
  const tokens = nameTokens(businessInput || '');
  if (tokens.length === 0) return -1;
  const folded = foldText(sentence);

  // Round 2: an all-generic name ("The Dental Co") needs its FULL
  // original form (stopwords kept) written as a proper noun.
  const allGeneric = tokens.every(t => GENERIC_NAME_WORDS.has(t));
  const variants: string[][] = allGeneric
    ? [nameTokensRaw(stripLocationSuffix(businessInput || '')).map(t => t.replace(/^'+|'+$/g, '')).filter(t => t && !LEGAL_SUFFIXES.has(t))]
    : [tokens];
  if (!allGeneric && tokens.length >= 3 && OPTIONAL_TRAILING_DESCRIPTORS.has(tokens[tokens.length - 1])) {
    variants.push(tokens.slice(0, -1));
  }

  // Spans of longer known competitor names that contain this business's
  // name — a match inside one of them belongs to the competitor.
  const bizKey = tokens.join(' ');
  const competitorSpans: Array<[number, number]> = [];
  for (const c of competitorNames) {
    const ct = nameTokens(c || '');
    if (ct.length <= tokens.length || !` ${ct.join(' ')} `.includes(` ${bizKey} `)) continue;
    const re = sequenceRegex(ct);
    let cm: RegExpExecArray | null;
    while ((cm = re.exec(folded)) !== null) competitorSpans.push([cm.index, cm.index + cm[0].length]);
  }

  let best = -1;
  for (const v of variants) {
    const re = sequenceRegex(v);
    let m: RegExpExecArray | null;
    while ((m = re.exec(folded)) !== null) {
      const startIdx = m.index;
      const end = startIdx + m[0].length;
      // A hyphen is not a word boundary after the last token:
      // "dental co-pay" is not "Dental Co".
      if (sentence[end] === '-' && /[\p{L}\p{N}]/u.test(sentence[end + 1] ?? '')) continue;
      if (allGeneric && !isCapitalisedProperName(sentence.slice(startIdx, end))) continue;
      if (continuesAsLongerName(sentence, end)) continue;
      if (competitorSpans.some(([s, e]) => startIdx >= s && end <= e)) continue;
      if (best < 0 || startIdx < best) best = startIdx;
      break;
    }
  }
  return best;
}

/** Does `text` mention the business (same whole-name rule as the trust
 *  attribution)? Shared with Reddit matching (lib/enrichment.ts) and
 *  citation extraction (lib/analyser-ml.ts) so all three agree. */
export function mentionsBusinessName(text: string, businessName: string, competitorNames: string[] = []): boolean {
  return businessMentionIndex(text || '', businessName, competitorNames) >= 0;
}

// b02d: does a Knowledge Graph / Knowledge Panel title belong to THIS
// person? Normalised (fold + honorific/credential strip); every name
// token must appear in the title and the title may carry at most one
// extra token (a middle name). "Dr. Jane Smith" == "Jane Smith";
// "Jane Smithson" / "John Smith" / "Smith & Co" do not match.
const PERSON_NAME_NOISE = new Set(['dr', 'mr', 'mrs', 'ms', 'mx', 'prof', 'professor', 'sir', 'dame', 'md', 'do', 'dds', 'dmd', 'phd', 'jd', 'esq', 'jr', 'sr', 'ii', 'iii', 'mba', 'cpa', 'rn', 'np', 'pa']);
function personTokens(s: string): string[] {
  return foldText(s || '')
    .split(/[^\p{L}\p{N}']+/u)
    .map(t => t.replace(/^'+|'+$/g, ''))
    .filter(t => t.length > 1 && !PERSON_NAME_NOISE.has(t));
}
export function knowledgePanelTitleMatches(title: string | null | undefined, personName: string | null | undefined): boolean {
  const nameT = personTokens(personName || '');
  const titleT = personTokens(title || '');
  if (nameT.length === 0 || titleT.length === 0) return false;
  const titleSet = new Set(titleT);
  if (!nameT.every(t => titleSet.has(t))) return false;
  return titleT.length - nameT.length <= 1;
}

function sentenceMentionsBusiness(sentence: string, businessInput: string, competitorNames: string[] = []): boolean {
  // azzr residual: no name to attribute against -> NOTHING is
  // attributable. businessMentionIndex returns -1 for an empty name.
  return businessMentionIndex(sentence, businessInput, competitorNames) >= 0;
}

// Is the match at `matchIndex` negated by a negation word before it in
// the SAME clause (<= 40 chars, cut at , ; : and "but")? ("has no
// reviews", "does not respond to reviews", "not friendly"). "Not only
// does X have 300 reviews" is NOT a negation.
function isNegated(text: string, matchIndex: number): boolean {
  let windowText = text.slice(Math.max(0, matchIndex - 40), matchIndex);
  const clauseCut = Math.max(windowText.lastIndexOf(','), windowText.lastIndexOf(';'), windowText.lastIndexOf(':'));
  if (clauseCut >= 0) windowText = windowText.slice(clauseCut + 1);
  const but = /\bbut\b/gi;
  let bm: RegExpExecArray | null;
  let lastBut = -1;
  while ((bm = but.exec(windowText)) !== null) lastBut = bm.index + bm[0].length;
  if (lastBut >= 0) windowText = windowText.slice(lastBut);
  windowText = windowText.replace(NON_NEGATING_PHRASES, ' ');
  return NEGATION_WORDS.test(windowText);
}

// Does any (non-negated) match of `pattern` occur in `sentence`?
function hasNonNegatedMatch(sentence: string, pattern: RegExp): boolean {
  const re = new RegExp(pattern.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(sentence)) !== null) {
    if (!isNegated(sentence, m.index)) return true;
  }
  return false;
}

// One sentence's review count: the count nearest the business-name mention,
// preferring counts AFTER the mention. Returns null when the sentence has
// no (non-negated) count.
function pickSentenceReviewCount(sentence: string, bizIdx: number): number | null {
  const re = new RegExp(REVIEW_COUNT_PATTERNS.source, REVIEW_COUNT_PATTERNS.flags);
  let m: RegExpExecArray | null;
  let bestAfter: { dist: number; n: number } | null = null;
  let best: { dist: number; n: number } | null = null;
  while ((m = re.exec(sentence)) !== null) {
    if (isNegated(sentence, m.index)) continue;
    const n = parseInt(m[1].replace(/,/g, ''), 10);
    if (Number.isNaN(n)) continue;
    const dist = Math.abs(m.index - bizIdx);
    if (m.index >= bizIdx && (!bestAfter || dist < bestAfter.dist)) bestAfter = { dist, n };
    if (!best || dist < best.dist) best = { dist, n };
  }
  return (bestAfter ?? best)?.n ?? null;
}

// Response-level review mention (for the Review-mentions signal): the
// response must have BOTH a business-mentioning sentence AND a non-negated
// review sentence. A competitor-only response, or one that only says
// "no reviews", does not count as social proof.
function responseHasReviewMention(response: string, businessInput: string, competitorNames: string[] = []): boolean {
  const sentences = splitSentences(response);
  if (!sentences.some(s => sentenceMentionsBusiness(s, businessInput, competitorNames))) return false;
  return sentences.some(s => hasNonNegatedMatch(s, REVIEW_PATTERNS));
}

function extractRatings(text: string, businessInput?: string, competitorNames: string[] = []): string[] {
  const found = new Set<string>();
  for (const sentence of splitSentences(text)) {
    if (!sentenceMentionsBusiness(sentence, businessInput ?? '', competitorNames)) continue;
    for (const pattern of RATING_PATTERNS) {
      const re = new RegExp(pattern.source, pattern.flags);
      let m: RegExpExecArray | null;
      while ((m = re.exec(sentence)) !== null) {
        if (!isNegated(sentence, m.index)) found.add(m[0].trim());
      }
    }
  }
  return [...found];
}

function extractReviewCount(text: string, businessInput?: string, competitorNames: string[] = []): number | null {
  // azzr residual: no whole-text MAX fallback. With no business name
  // the sentence loop below finds no business mention (bizIdx < 0)
  // and returns null — no attribution, no claim — instead of the
  // old MAX over every response, which reported a competitor's count
  // ("Competitor has 500 reviews, this business has 20" -> 500).
  let max: number | null = null;
  for (const sentence of splitSentences(text)) {
    const bizIdx = businessMentionIndex(sentence, businessInput ?? '', competitorNames);
    if (bizIdx < 0) continue;
    const n = pickSentenceReviewCount(sentence, bizIdx);
    if (n !== null && (max === null || n > max)) max = n;
  }
  return max;
}

function extractReviewKeywords(text: string, businessInput?: string, competitorNames: string[] = []): string[] {
  const found = new Set<string>();
  for (const sentence of splitSentences(text)) {
    if (!sentenceMentionsBusiness(sentence, businessInput ?? '', competitorNames)) continue;
    const re = new RegExp(REVIEW_KEYWORD_PATTERNS.source, REVIEW_KEYWORD_PATTERNS.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(sentence)) !== null) {
      if (!isNegated(sentence, m.index)) found.add(m[0].toLowerCase());
    }
  }
  return [...found].slice(0, 8);
}

async function checkUrlExists(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' },
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

// ── WEBSITE HTML CHECKS ───────────────────────────────────────────────
function hasFaqSchema(html: string): boolean {
  return /"@type"\s*:\s*"FAQPage"/i.test(html);
}

function hasLocalBusinessSchema(html: string): boolean {
  return /"@type"\s*:\s*"LocalBusiness"/i.test(html);
}

function hasOpenGraphTitle(html: string): boolean {
  return /<meta[^>]+property=["']og:title["']/i.test(html);
}

function hasOpenGraphDescription(html: string): boolean {
  return /<meta[^>]+property=["']og:description["']/i.test(html);
}

function hasOpenGraphImage(html: string): boolean {
  return /<meta[^>]+property=["']og:image["']/i.test(html);
}

function hasTwitterCard(html: string): boolean {
  return /<meta[^>]+name=["']twitter:card["']/i.test(html);
}

function hasCanonicalUrl(html: string): boolean {
  return /<link[^>]+rel=["']canonical["']/i.test(html);
}

function hasH1Tag(html: string): boolean {
  return /<h1[\s>]/i.test(html);
}

function hasImageAltText(html: string): boolean {
  const images = html.match(/<img[^>]+>/gi) || [];
  if (images.length === 0) return false;
  const withAlt = images.filter(img => /alt=["'][^"']+["']/i.test(img));
  return withAlt.length / images.length >= 0.5;
}

// azzy residual: visible-text extraction for the contact checks. The
// phone/address regexes used to run on RAW HTML — inline <script> JSON,
// <style> rules, SVG path data ("M1000 1500 2000") and attribute values
// (ids, coordinates) all produced phantom phone numbers. Only what a
// visitor can read counts (plus explicit tel: links).
export function visibleText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|svg|noscript|template|head)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&ndash;|&#8211;/gi, '–')
    .replace(/\s+/g, ' ');
}

// Strings that LOOK like digit groups but are not phone numbers.
// Opening-hour tokens that are unambiguously times: 09:00 / 9.30 (with a
// separator), 0900 (exactly four digits, HH 00-23 + MM 00-59), or an
// am/pm time. A bare 3-digit group ("555", "214") is NEVER a time — the
// old pattern ([01]?\d)[:.]?[0-5]\d read "555-123" / "214-555" as hour
// ranges and deleted real US numbers (555-123-4567, (214) 555-1234)
// before the NANP check ran.
const TIME_TOKEN = String.raw`(?:(?:[01]?\d|2[0-3])[:.][0-5]\d|(?:[01]\d|2[0-3])[0-5]\d|(?:1[0-2]|0?[1-9])(?:[:.][0-5]\d)?\s*[ap]\.?m\.?)`;
// Ranges must not sit inside a phone-style digit run — i.e. right after
// or before a short 1-3 digit group ("555 1200-1300 12"). Chained hour
// ranges ("0900-1700 0900-1200") are still stripped.
const HOUR_RANGE = new RegExp(String.raw`(?<!\d|(?<!\d)\d{1,3}\)?[\s.-])${TIME_TOKEN}\s*(?:[-–—]|to)\s*${TIME_TOKEN}(?!\d|[\s.-]\d{1,3}(?!\d))`, 'gi');

function stripNonPhoneNumerics(text: string): string {
  return text
    // Opening hours: 0900-1700, 09:00–17:30, 9am-5pm.
    .replace(HOUR_RANGE, ' ')
    .replace(/\b(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b/g, ' ')
    // ISO dates.
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    // Currency amounts: Rp 100.000.000, ₹1,00,000, $1,000,000, €2.500.
    .replace(/(?:\b(?:Rp|IDR|INR|Rs\.?|USD|EUR|GBP|AUD|CAD|NZD|SGD|AED|ZAR|KES|NGN|GHS|PHP)\s?|[$€£₹¥₦₱])\s?\d[\d.,\s]*\d/gi, ' ')
    // Thousands-separated numbers: 1.000.000 / 1,000,000 / 1,00,000.
    .replace(/(?<![\d+])\d{1,3}(?:[.,]\d{2,3}){2,}(?!\d)/g, ' ');
}

export function hasPhoneNumber(html: string): boolean {
  // Explicit tel: links are unambiguous.
  const tel = html.match(/href=["']tel:([^"']+)["']/gi) || [];
  if (tel.some(t => { const d = t.replace(/\D/g, ''); return d.length >= 7 && d.length <= 15; })) return true;

  const text = stripNonPhoneNumerics(visibleText(html));
  // 1) E.164 / international: '+' + 8–15 digits (separators allowed) —
  //    +44, +61, +353, +49, +33, +91, +1, … A bare '+1000000' (7 digits,
  //    a run of zeros — a count, not a number) is rejected.
  const intl = text.match(/(?<![\w+])\+[1-9][0-9\s().-]{6,22}\d(?!\d)/g) || [];
  if (intl.some(c => {
    const d = c.replace(/\D/g, '');
    return d.length >= 8 && d.length <= 15 && !/0{5,}/.test(d);
  })) return true;
  // 2) US NANP: (555) 123-4567, 555-123-4567, 555.123.4567.
  if (/(?<![\d.,])\(?[2-9]\d{2}\)?[\s.-]\d{3}[\s.-]\d{4}(?![\d.,]?\d)/.test(text)) return true;
  // 3) Local 0-led formats (UK/AU/IE/DE/IN/…): 020 7946 0958,
  //    07911 123456, (02) 9374 4000, 0412 345 678, 079-2630 1234,
  //    01 42 68 53 00 (FR pairs).
  const localPatterns = [
    /(?<![\d.,])\(?0\d{1,4}\)?[\s-]+\d{3,4}[\s-]+\d{3,4}(?!\d)/, // 3 groups
    /(?<![\d.,])\(?0\d{1,4}\)?[\s-]+\d{6,8}(?!\d)/, // 2 groups, long tail
    /(?<![\d.,])0\d[\s.-](?:\d{2}[\s.-]){3}\d{2}(?!\d)/, // FR pairs
  ];
  if (localPatterns.some(p => p.test(text))) return true;
  // 4) Indian mobile, local format: 98765 43210 / 98765-43210, or 10
  //    contiguous digits right after a phone keyword.
  if (/(?<![\d.,])[6-9]\d{4}[\s-]\d{5}(?!\d)/.test(text)) return true;
  if (/\b(?:phone|tel|telephone|call|mobile|mob|whatsapp|ph)\b\.?\s*:?\s*[6-9]\d{9}(?!\d)/i.test(text)) return true;
  return false;
}

// Words that can follow a number but never start a street name
// ("24 hour Drive Thru", "Rated 5 on Google Place Reviews").
const NOT_STREET_WORD = /^(?:hours?|hrs?|minutes?|mins?|days?|weeks?|months?|years?|yrs?|stars?|google|yelp|reviews?|rated|rating|ratings|on|in|at|of|for|the|and|to|our|your|people|customers|patients|clients|percent|times|locations?|services?|x)$/i;
const NOT_LOCALITY_WORD = /^(?:thru|through|reviews?|services?|available|open|daily|now|today|only|access|parking)$/i;
const US_STATES = 'AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY';
const IN_STATES = 'Andhra Pradesh|Assam|Bihar|Chhattisgarh|Delhi|New Delhi|Goa|Gujarat|Haryana|Himachal Pradesh|Jharkhand|Karnataka|Kerala|Madhya Pradesh|Maharashtra|Odisha|Punjab|Rajasthan|Tamil Nadu|Telangana|Uttar Pradesh|Uttarakhand|West Bengal|Chandigarh|Puducherry|Jammu and Kashmir';
// Postcode / PIN patterns per country, each anchored to a locality word.
const POSTAL_ADDRESS_PATTERNS: RegExp[] = [
  new RegExp(`\\b[A-Z][A-Za-z.'-]+,?\\s+(?:${US_STATES})\\s+\\d{5}(?:-\\d{4})?\\b`), // Dallas, TX 75201
  /\b[A-Z][A-Za-z.'-]+,?\s+(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\s+\d{4}\b/, // Sydney NSW 2000
  /\b[A-Z][A-Za-z.'-]+,?\s+[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/, // London SW1A 1AA
  /\b[A-Z][A-Za-z.'-]+,?\s+(?:AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)\s+[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/, // Toronto, ON M5V 3L9
  new RegExp(`\\b[A-Z][A-Za-z.'-]+,?\\s+(?:${IN_STATES})\\s*[-–,]?\\s*[1-9]\\d{2}\\s?\\d{3}\\b`), // Ahmedabad, Gujarat 380015
  /\b[A-Z][A-Za-z.'-]+\s*[-–]\s*[1-9]\d{2}\s?\d{3}\b(?=\s*(?:,|\.|$|India\b|\())/, // Ahmedabad - 380015
];

export function hasAddress(html: string): boolean {
  // Markup first (unchanged): <address>, itemprop='address', streetAddress.
  if (/<address[\s>]|itemprop=["']address["']|streetAddress/i.test(html)) return true;
  const text = visibleText(html);
  // azzy: plain-text footer addresses. (a) street-number + Capitalised
  // street name + street type + locality — with words that never start a
  // street ("24 hour", "5 on Google") and non-localities ("Thru",
  // "Reviews") rejected.
  const street = /\b\d{1,6}[A-Za-z]?\s+((?:[A-Z][A-Za-z'’.\-]*\s+){0,2}[A-Z][A-Za-z'’.\-]*)\s+(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Boulevard|Blvd|Way|Court|Ct|Place|Pl|Crescent|Cres|Close|Square|Sq|Terrace|Ter|Trail|Highway|Hwy|Parkway|Pkwy|Parade|Loop|Circle|Cir|Plaza|Row|Marg|Nagar)\b\.?\s*,?\s*([A-Z][A-Za-z'’.\-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = street.exec(text)) !== null) {
    const nameWords = m[1].split(/\s+/);
    if (nameWords.some(w => NOT_STREET_WORD.test(w.replace(/[.'’-]/g, '')))) continue;
    if (NOT_LOCALITY_WORD.test(m[2].replace(/[.'’-]/g, ''))) continue;
    return true;
  }
  // (b) locality + country postcode/PIN (Sydney NSW 2000, London SW1A 1AA,
  //     Ahmedabad, Gujarat 380015, Dallas, TX 75201).
  return POSTAL_ADDRESS_PATTERNS.some(p => p.test(text));
}

function hasBlogSection(html: string): boolean {
  return /href=["'][^"']*(?:blog|news|articles|posts)[^"']*["']/i.test(html);
}

function hasAboutPage(html: string): boolean {
  return /href=["'][^"']*(?:about|about-us|our-story)[^"']*["']/i.test(html);
}

function hasServicesPage(html: string): boolean {
  return /href=["'][^"']*(?:services|treatments|procedures|what-we-do)[^"']*["']/i.test(html);
}

function hasContactPage(html: string): boolean {
  return /href=["'][^"']*(?:contact|contact-us|get-in-touch)[^"']*["']/i.test(html);
}

function extractMetaDescription(html: string): string | null {
  const match = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  return match?.[1]?.trim() ?? null;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match?.[1]?.trim() ?? null;
}

// ── BUILD TECHNICAL SIGNALS ────────────────────────────────────────────
export function buildTechnicalSignals(
  html: string | null,
  websiteUrl: string | undefined,
  // Name the title tag is checked against — the RESOLVED canonical name
  // (Places), not the raw scan input (see detectTrustSignals). This param
  // feeds only the title check.
  titleCheckName: string,
  fetchFailed: boolean,
  // HTML from key subpages (/contact, /about, ...) — used ONLY for the
  // address/phone checks. Schema/OG/canonical/title/H1 belong on the
  // homepage and stay homepage-only.
  extraHtml: string = '',
  // #40: true only when the website URL was supplied/verified by the user.
  // When false (e.g. a URL discovered via Places), a title that does NOT
  // contain the business name may belong to another business, so it is
  // never quoted.
  opts: { websiteVerified?: boolean } = {},
): TrustSignal[] {
  const noWebsite = !websiteUrl;
  // b0fh: when the website was never located (or could not be analyzed),
  // these signals were returned as FAILURES with failure consequences
  // ('No title tag — AI platforms cannot identify business name from
  // page'), even though nothing was measured. The report panel shows the
  // consequence for failing signals, so the user read unmeasured checks
  // as facts about their site. Now they read 'Not checked' with an honest
  // reason, no fix promise, no score penalty, and calculateOverall
  // excludes them.
  const notChecked = (name: string, impact: TrustSignal['impact']): TrustSignal => ({
    name,
    status: 'not_checked',
    value: noWebsite ? 'Not checked — website not located' : 'Not checked — website could not be analyzed',
    impact: noWebsite ? 'medium' : impact,
    fixAvailable: false,
    consequence: noWebsite
      ? 'We could not locate your website, so this check did not run.'
      : 'We could not load your website, so this check did not run.',
    pointsImpact: 0,
  });

  if (!websiteUrl || fetchFailed || !html) {
    return [
      notChecked('FAQ Schema',            'high'),
      notChecked('LocalBusiness JSON-LD', 'high'),
      notChecked('HTTPS',                 'medium'),
      notChecked('Meta description',      'medium'),
      notChecked('Open Graph tags',       'medium'),
      notChecked('Twitter Card',          'low'),
      notChecked('Canonical URL',         'low'),
      notChecked('H1 tag',                'medium'),
      notChecked('Image alt text',        'low'),
      notChecked('Phone number on page',  'medium'),
      notChecked('Address on page',       'medium'),
      notChecked('Blog section',          'low'),
      notChecked('Services page',         'low'),
      notChecked('Contact page',          'low'),
      notChecked('Title tag',             'low'),
    ];
  }

  const https = /^https:\/\//i.test(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`);
  const faq = hasFaqSchema(html);
  const localBiz = hasLocalBusinessSchema(html);
  const metaDesc = extractMetaDescription(html);
  const title = extractTitle(html);
  const titleOk = title ? titleContainsBusiness(title, titleCheckName) : false;
  const ogTitle = hasOpenGraphTitle(html);
  const ogDesc = hasOpenGraphDescription(html);
  const ogImage = hasOpenGraphImage(html);
  const ogAll = ogTitle && ogDesc && ogImage;
  const twitter = hasTwitterCard(html);
  const canonical = hasCanonicalUrl(html);
  const h1 = hasH1Tag(html);
  const altText = hasImageAltText(html);
  const phone = hasPhoneNumber(html) || (extraHtml ? hasPhoneNumber(extraHtml) : false);
  const address = hasAddress(html) || (extraHtml ? hasAddress(extraHtml) : false);
  const blog = hasBlogSection(html);
  const services = hasServicesPage(html);
  const contact = hasContactPage(html);

  return [
    {
      name: 'FAQ Schema',
      status: faq ? 'good' : 'missing',
      value: faq ? 'FAQPage schema detected — your Q&As are machine-readable for AI platforms' : 'No FAQPage schema detected',
      consequence: 'Without FAQPage schema, AI platforms cannot read your Q&As as structured answers',
      impact: 'high',
      fixAvailable: !faq,
      pointsImpact: 18,
    },
    {
      name: 'LocalBusiness JSON-LD',
      status: localBiz ? 'good' : 'missing',
      value: localBiz ? 'LocalBusiness JSON-LD found — AI platforms can read your business details in structured form' : 'No LocalBusiness JSON-LD detected',
      consequence: 'Without LocalBusiness JSON-LD, AI platforms have no structured record of your name, address, hours and services',
      impact: 'high',
      fixAvailable: !localBiz,
      pointsImpact: 16,
    },
    {
      name: 'HTTPS',
      status: https ? 'good' : 'danger',
      value: https ? 'Site served over HTTPS — passes AI platform trust checks' : 'Site not served over HTTPS',
      consequence: 'Google AI and Perplexity apply trust penalty to non-HTTPS sites — affects citation eligibility',
      impact: 'medium',
      fixAvailable: !https,
      pointsImpact: 10,
    },
    {
      name: 'Meta description',
      status: metaDesc ? 'good' : 'missing',
      value: metaDesc ? `Meta description present (${metaDesc.length} chars) — used by AI for business summaries` : 'No meta description found',
      consequence: 'Missing meta description — AI summarisers fall back to body text, often producing inaccurate snippets',
      impact: 'medium',
      fixAvailable: !metaDesc,
      pointsImpact: 8,
    },
    {
      name: 'Open Graph tags',
      status: ogAll ? 'good' : ogTitle ? 'warning' : 'missing',
      value: ogAll ? 'All OG tags present (title, description, image)' : ogTitle ? 'Partial OG tags — missing image or description' : 'No Open Graph tags found',
      consequence: 'Missing OG tags reduces rich preview quality in AI-powered social and search results',
      impact: 'medium',
      fixAvailable: !ogAll,
      pointsImpact: 7,
    },
    {
      name: 'Twitter Card',
      status: twitter ? 'good' : 'missing',
      value: twitter ? 'Twitter Card meta tag present' : 'No Twitter Card tag found',
      consequence: 'Grok and Copilot use Twitter Card data for rich snippet generation — missing reduces quality',
      impact: 'low',
      fixAvailable: !twitter,
      pointsImpact: 3,
    },
    {
      name: 'Canonical URL',
      status: canonical ? 'good' : 'missing',
      value: canonical ? 'Canonical URL tag present — consolidates citation authority' : 'No canonical URL tag found',
      consequence: 'Without canonical tag, AI citation signals are split across duplicate URLs',
      impact: 'low',
      fixAvailable: !canonical,
      pointsImpact: 4,
    },
    {
      name: 'H1 tag',
      status: h1 ? 'good' : 'missing',
      value: h1 ? 'H1 tag found — AI can extract your primary page topic' : 'No H1 tag found on page',
      consequence: 'Missing H1 — AI platforms cannot determine your page\'s primary topic, reducing relevance scoring',
      impact: 'medium',
      fixAvailable: !h1,
      pointsImpact: 6,
    },
    {
      name: 'Image alt text',
      status: altText ? 'good' : 'warning',
      value: altText ? 'Images have alt text — AI content scrapers can read your visual content' : 'Images missing alt text',
      consequence: 'Alt-text missing — AI image indexers cannot process your photos, weakening local visual signals',
      impact: 'low',
      fixAvailable: !altText,
      pointsImpact: 3,
    },
    {
      name: 'Phone number on page',
      status: phone ? 'good' : 'missing',
      value: phone ? 'Phone number detected on page — confirms real business presence' : 'No phone number found on page',
      consequence: 'No phone number on page — AI cannot verify physical business, reducing trust score',
      impact: 'medium',
      fixAvailable: !phone,
      pointsImpact: 5,
    },
    {
      name: 'Address on page',
      status: address ? 'good' : 'missing',
      value: address ? 'Address found on page — AI confirms your physical location' : 'No address found on page',
      consequence: 'No address on page — AI platforms cannot confirm location, critical for local pack inclusion',
      impact: 'medium',
      fixAvailable: !address,
      pointsImpact: 6,
    },
    {
      name: 'Blog section',
      status: blog ? 'good' : 'missing',
      value: blog ? 'Blog or news section detected — generates long-tail citation opportunities' : 'No blog or news section found',
      consequence: 'No content hub — limits your footprint in AI citation pools for long-tail queries',
      impact: 'low',
      fixAvailable: !blog,
      pointsImpact: 4,
    },
    {
      name: 'Services page',
      status: services ? 'good' : 'missing',
      value: services ? 'Services or treatments page found — AI can enumerate your offerings' : 'No services page found',
      consequence: 'No services page — AI cannot list what you offer when answering service queries',
      impact: 'low',
      fixAvailable: !services,
      pointsImpact: 4,
    },
    {
      name: 'Contact page',
      status: contact ? 'good' : 'missing',
      value: contact ? 'Contact page found — signals operational legitimacy to AI trust algorithms' : 'No contact page found',
      consequence: 'Missing contact page is a trust red flag — AI trust algorithms penalise unreachable businesses',
      impact: 'low',
      fixAvailable: !contact,
      pointsImpact: 3,
    },
    {
      name: 'Title tag',
      status: titleOk ? 'good' : title ? 'warning' : 'missing',
      // #40: quote the title only when it contains the resolved business
      // name (or the site is user-verified). A non-matching title from an
      // unverified URL may be ANOTHER business's — never quote it.
      value: titleOk
        ? `Title includes business name: "${title}"`
        : title
          ? opts.websiteVerified
            ? `${TITLE_VERIFIED_MISSING_PREFIX}: "${title}"`
            : TITLE_MISSING_NAME_VALUE
          : 'No title tag found',
      consequence: 'Title tag missing or doesn\'t include business name — AI cannot reliably identify you in branded queries',
      impact: 'low',
      fixAvailable: !titleOk,
      pointsImpact: 4,
    },
  ];
}

// ── BUILD DIRECTORY SIGNALS (country-aware) ────────────────────────────
// Checks the directories that actually matter in the business's market —
// driven by countryConfig.trustSources — instead of always testing US-only
// platforms (Yelp/Healthgrades/Zocdoc/BBB).
//
// Evidence ladder (ax89): a directory is 'good' only on VERIFIED presence
// (Google Places match / SERP presence for this business) or on a
// citation-context match in AI responses (see extractCitationSources —
// bare name mentions are not citations). A bare name mention yields at
// most 'warning' ("verify listing"). Pattern matches (inScan) run on
// attributed text only — responses that mention the business (ax87).
// most 'warning' ("verify listing"). Industry-only directories (Healthgrades
// etc.) are omitted entirely for businesses outside that industry — a
// plumber must not get a Healthgrades signal.
const MEDICAL_DIRECTORY_URLS = new Set([
  'healthgrades.com', 'zocdoc.com', 'ratemds.com', 'vitals.com',
  'healthengine.com.au', 'practo.com', 'healthpoint.co.nz', 'healthhub.sg',
  'healthdirectory.co.za', 'philhealthcare.com', 'cqc.org.uk', 'nhs.uk', 'hse.ie',
]);
const LEGAL_DIRECTORY_URLS = new Set([
  'avvo.com', 'martindale.com', 'lawsociety.ie', 'singaporelegaladvice.com',
]);
// SERP presence flags (fetchSerpData) keyed by directory URL — a verified
// search-result presence check for THIS business, not an AI-response mention.
const SERP_PRESENCE_FLAG: Record<string, string> = {
  'yelp.com': 'yelpPresent',
  'facebook.com': 'facebookPresent',
  'healthgrades.com': 'healthgradesPresent',
  'tripadvisor.com': 'tripadvisorPresent',
  'avvo.com': 'avvoPresent',
  'linkedin.com': 'linkedinPresent',
};

// ax88: detection uses the SAME medical definition as the catalog
// (MEDICAL_INDUSTRY_TOKENS in trustSignals.ts) — the old local list
// disagreed with the catalog (it included vet/health/pharma, the
// catalog listed only 5 industries), so a chiropractor's Healthgrades
// signal appeared on the report page but was hidden on the dashboard,
// and the counts conflicted.
function isMedicalIndustry(industry: string | undefined): boolean {
  return isMedicalIndustryName(industry);
}
// Whole-word (shared with the catalog): the old substring list matched
// 'law' inside "lawn care".
function isLegalIndustry(industry: string | undefined): boolean {
  return isLegalIndustryName(industry);
}

type DirectoryOpts = {
  industry?: string;
  google?: { rating?: number | null; reviewCount?: number | null } | null;
  serpData?: Record<string, boolean | undefined> | null;
  // Round 2: sentence-level attribution (like citations/reviews). When a
  // business name is given, a directory counts as 'mentioned' only in a
  // sentence that ALSO names this business — "Look for reviews on Yelp"
  // in a response that names the business elsewhere is not evidence.
  businessName?: string;
  competitorNames?: string[];
};

export function buildDirectorySignals(
  citationSources: string[],
  attributedText: string,
  localTrustSources: string[],
  opts: DirectoryOpts = {}
): TrustSignal[] {
  // Reddit is a community citation pool AI platforms use in every market.
  const UNIVERSAL_URL = 'reddit.com';
  const seen = new Set<string>();
  const sourceUrls: string[] = [];
  for (const url of [...localTrustSources, UNIVERSAL_URL]) {
    if (!seen.has(url)) { seen.add(url); sourceUrls.push(url); }
  }

  // Industry filtering applies only when the industry is KNOWN; unknown
  // industry keeps the old show-everything behaviour (no false hiding).
  // ax89 residual: 'general' (detectIndustry's fallback) is UNKNOWN, not a
  // known non-medical industry — same rule as signalsForCountry.
  const industryKnown = isKnownIndustry(opts.industry);
  const medical = isMedicalIndustry(opts.industry);
  const legal = isLegalIndustry(opts.industry);

  const scanText = opts.businessName !== undefined
    ? splitSentences(attributedText).filter(sn => sentenceMentionsBusiness(sn, opts.businessName ?? '', opts.competitorNames ?? [])).join('\n')
    : attributedText;

  const out: TrustSignal[] = [];
  for (const url of sourceUrls) {
    if (industryKnown && MEDICAL_DIRECTORY_URLS.has(url) && !medical) continue;
    if (industryKnown && LEGAL_DIRECTORY_URLS.has(url) && !legal) continue;

    // b8ad: this is the CITATION-PRESENCE check (is the business in
    // Reddit's citation pool?), NOT the mentions check — Community's
    // 'Reddit mentions' measures whether people discuss the business.
    // Both used to render as 'Reddit Mentions' (the trust page's
    // LABEL_MAP mapped bare 'Reddit' there), reading as one signal
    // counted twice. Distinct names now.
    const meta = url === UNIVERSAL_URL
      ? { name: 'Reddit citation presence', impact: 'medium' as const, da: 91, pointsImpact: 12 }
      : metaForSource(url);
    const patterns = url === UNIVERSAL_URL ? ['reddit'] : patternsForSource(url);

    // Verified Google presence: Google Places matched this business.
    // OPERATIONAL status is NOT a claim check (an unclaimed listing is
    // still OPERATIONAL), so we report the verified listing + rating,
    // never 'claimed' and never the old false 'verify listing is claimed'
    // warning for a business that HAS a listing.
    if (url === 'google.com/maps' && opts.google) {
      const bits: string[] = [];
      if (typeof opts.google.rating === 'number') bits.push(`${opts.google.rating}★`);
      if (typeof opts.google.reviewCount === 'number') bits.push(`${opts.google.reviewCount.toLocaleString()} reviews`);
      out.push({
        name: meta.name, status: 'good',
        value: `Google Business listing verified${bits.length ? ` · ${bits.join(' · ')}` : ''}`,
        impact: meta.impact, fixAvailable: false, consequence: '', pointsImpact: meta.pointsImpact,
      });
      continue;
    }

    // Verified SERP presence for this business (fetchSerpData).
    const serpFlag = SERP_PRESENCE_FLAG[url];
    if (serpFlag && opts.serpData && opts.serpData[serpFlag] === true) {
      out.push({
        name: meta.name, status: 'good',
        value: `${meta.name} listing found in search results`,
        impact: meta.impact, fixAvailable: false, consequence: '', pointsImpact: meta.pointsImpact,
      });
      continue;
    }

    const inCitations = patterns.some(p => sourcesInclude(citationSources, p))
      || sourcesInclude(citationSources, url)
      || sourcesInclude(citationSources, meta.name);
    const inScan = patterns.some(p => scanTextMentions(scanText, p));
    // ax89 residual: a verified SERP check that found NO listing vetoes
    // text-only evidence — an AI citation cannot turn a listing that
    // search says does not exist into 'good'. It caps at 'warning'.
    const serpAbsent = !!(serpFlag && opts.serpData && opts.serpData[serpFlag] === false);

    let status: TrustSignal['status'];
    let value: string;
    let consequence: string;

    // b8ad: no Domain Authority numerics in directory values. The DA
    // figures were Rankall estimates of the SOURCE's authority (never
    // measured, no source/date), not measurements of this business —
    // and they read as business data. The impact tier already conveys
    // how much each source matters.
    if (serpAbsent && (inCitations || inScan)) {
      status = 'warning';
      value = `Mentioned in AI responses, but no ${meta.name} listing found in search results`;
      consequence = `${meta.name} came up in AI responses but a search found no listing for you — check that your profile exists and is public`;
    } else if (inCitations) {
      status = 'good';
      value = `Cited in AI responses`;
      consequence = '';
    } else if (inScan) {
      status = 'warning';
      value = `Mentioned in scan responses — verify listing is claimed`;
      consequence = `${meta.name} detected in responses but not confirmed as a citation source — claim and complete your profile`;
    } else {
      status = 'missing';
      value = `Not in AI citation pool`;
      consequence = `${meta.name} is missing — AI platforms regularly cite it for local queries in this market and you are not there`;
    }

    out.push({ name: meta.name, status, value, impact: meta.impact, fixAvailable: status !== 'good', consequence, pointsImpact: meta.pointsImpact });
  }
  return out;
}

// ── BUILD REVIEW SIGNALS ───────────────────────────────────────────────
// ax87/#11: rating thresholds. A rating is 'good' only at >= 4.0 (the
// common "4 stars and up" consumer filter), 'warning' at 3.5-3.99, and
// 'danger' below 3.5 — a low rating is a present-but-poor signal, never
// a pass. (Scoring-wise danger == missing: both earn 0.)
export const RATING_GOOD_MIN = 4.0;
export const RATING_WARNING_MIN = 3.5;
export function ratingStatus(rating: number): TrustSignal['status'] {
  if (rating >= RATING_GOOD_MIN) return 'good';
  if (rating >= RATING_WARNING_MIN) return 'warning';
  return 'danger';
}
function parseRatingValue(r: string): number | null {
  const m = /(\d+(?:\.\d+)?)/.exec(r);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) && n >= 0 && n <= 5 ? n : null;
}
// ax87 (e): review mentions need >= 2 mentioning platforms (and >= half of
// the responding platforms) for 'good' — "1 of 1 platforms" is one
// response, not broad social proof.
const MIN_REVIEW_MENTION_PLATFORMS = 2;

export type TrustAttributionOpts = {
  // Longer known competitor names (e.g. the analyser's extracted
  // competitor). A mention of this business inside one of them is
  // attributed to the competitor ("Smile Dental" inside "Smile Dental Group").
  competitorNames?: string[];
};

export function buildReviewSignals(
  scanResults: Array<{ platform: string; response: string | null }>,
  attributedText: string,
  businessInput: string,
  googlePlaces?: { rating?: number | null; reviewCount?: number | null } | null,
  opts: TrustAttributionOpts = {},
): TrustSignal[] {
  const competitorNames = opts.competitorNames ?? [];
  const withResponse = scanResults.filter(r => r.response);
  const reviewMentionCount = withResponse.filter(r => responseHasReviewMention(r.response!, businessInput, competitorNames)).length;
  const total = withResponse.length;
  const reviewRatio = total > 0 ? reviewMentionCount / total : 0;
  const reviewMentionsGood = reviewMentionCount >= MIN_REVIEW_MENTION_PLATFORMS && reviewRatio >= MENTION_RATE_THRESHOLD;

  const ratings = extractRatings(attributedText, businessInput, competitorNames);
  const reviewCount = extractReviewCount(attributedText, businessInput, competitorNames);
  const reviewKeywords = extractReviewKeywords(attributedText, businessInput, competitorNames);
  // Response-rate / recency must come from business-attributed, non-negated
  // sentences — "does not respond to reviews" is not a response signal.
  const attributedSentences = splitSentences(attributedText).filter(s => sentenceMentionsBusiness(s, businessInput, competitorNames));
  const hasResponseRate = attributedSentences.some(s => hasNonNegatedMatch(s, RESPONSE_RATE_PATTERNS));
  const recentReviews = attributedSentences.some(s => hasNonNegatedMatch(s, RECENT_REVIEW_PATTERNS));
  // #11: distinct PLATFORMS, case-insensitive — "Google reviews" and
  // "google reviews" are one platform. The old code deduped the whole
  // matched strings, so casing/wording variants counted as 2 platforms.
  const reviewPlatforms = new Set<string>();
  for (const sentence of attributedSentences) {
    const re = new RegExp(MULTI_PLATFORM_REVIEW_PATTERNS.source, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(sentence)) !== null) {
      if (!isNegated(sentence, m.index)) reviewPlatforms.add(m[1].toLowerCase());
    }
  }
  const multiPlatform = reviewPlatforms.size >= 2;

  // azzr: verified Places data is the source of truth when it exists; the
  // AI-cited figure is shown alongside WITH its source, never presented
  // as fact on its own ("800 reviews detected" vs Places' 312).
  const placesCount = typeof googlePlaces?.reviewCount === 'number' ? googlePlaces.reviewCount : null;
  const placesRating = typeof googlePlaces?.rating === 'number' ? googlePlaces.rating : null;
  const primaryCount = placesCount ?? reviewCount;
  const aiRatings = placesRating !== null
    ? ratings.filter(r => r !== `${placesRating}/5`)
    : ratings;
  const aiRatingValues = ratings.map(parseRatingValue).filter((n): n is number => n !== null);
  const aiRatingValue = aiRatingValues.length > 0 ? Math.max(...aiRatingValues) : null;
  const effectiveRating = placesRating ?? aiRatingValue;
  const ratingSignalStatus: TrustSignal['status'] = effectiveRating !== null ? ratingStatus(effectiveRating) : 'missing';
  const ratingSuffix = effectiveRating === null || effectiveRating >= RATING_GOOD_MIN
    ? ''
    : effectiveRating >= RATING_WARNING_MIN
      ? ` — below ${RATING_GOOD_MIN.toFixed(1)}`
      : ` — below ${RATING_WARNING_MIN.toFixed(1)}`;

  return [
    {
      name: 'Review mentions',
      status: reviewMentionsGood ? 'good' : reviewMentionCount > 0 ? 'warning' : 'missing',
      // b8a8: the denominator is the platforms that RESPONDED, but the
      // string read as the total platform count ("any of 1 AI platforms"
      // for a scan where 1 platform responded). Label the denominator,
      // the same fix b8ad applied to the mention-rate signal.
      value: total > 0
        ? reviewMentionCount > 0
          ? `Reviews mentioned by ${reviewMentionCount} of the ${total} AI platforms that responded${reviewMentionCount > 1 ? ' — strong social proof signal' : ''}`
          : `Reviews not mentioned by any of the ${total} AI platforms that responded`
        : 'No scan responses to analyse',
      consequence: 'AI platforms not surfacing your reviews — means users asking for recommended businesses won\'t see your social proof',
      impact: 'high',
      fixAvailable: reviewMentionCount === 0,
      pointsImpact: 15,
    },
    {
      name: 'Rating mentions',
      status: ratingSignalStatus,
      value: placesRating !== null
        ? `Google Places rating: ${placesRating}/5${ratingSuffix}${aiRatings.length > 0 ? ` · AI responses mention ${aiRatings.slice(0, 5).join(', ')}` : ''}`
        : ratings.length > 0
          ? `Ratings mentioned in AI responses: ${ratings.slice(0, 5).join(', ')}${ratingSuffix}`
          : 'No star ratings mentioned in AI platform responses',
      consequence: effectiveRating === null
        ? 'Star ratings absent from AI responses — AI platforms cannot signal quality to users comparing businesses'
        : `Ratings below ${RATING_GOOD_MIN.toFixed(1)} put you behind competitors when AI compares businesses`,
      impact: 'high',
      fixAvailable: ratingSignalStatus !== 'good',
      pointsImpact: 13,
    },
    {
      name: 'Review count',
      status: primaryCount !== null ? (primaryCount >= 50 ? 'good' : 'warning') : 'missing',
      value: placesCount !== null
        ? `${placesCount.toLocaleString()} reviews (Google Places)${reviewCount !== null && reviewCount !== placesCount ? ` · AI responses cite up to ${reviewCount.toLocaleString()}` : ''}${placesCount >= 50 ? ' — at or above Rankall\'s 50-review check threshold' : ' — below Rankall\'s 50-review check threshold'}`
        : reviewCount !== null
          ? `AI responses cite up to ${reviewCount.toLocaleString()} reviews${reviewCount >= 50 ? ' — at or above Rankall\'s 50-review check threshold' : ' — below Rankall\'s 50-review check threshold'}`
          : 'Review count not mentioned in AI responses',
      consequence: 'Low review count — fewer reviews give AI less evidence to cite for competitive queries',
      impact: 'high',
      fixAvailable: primaryCount === null || primaryCount < 50,
      pointsImpact: 12,
    },
    {
      name: 'Review recency',
      status: recentReviews ? 'good' : 'missing',
      value: recentReviews
        ? 'Recent review activity detected — AI platforms favour fresh social proof'
        : 'No recent review activity detected in AI responses',
      consequence: 'No recent reviews — AI platforms down-rank businesses with stale or inactive review profiles',
      impact: 'high',
      fixAvailable: !recentReviews,
      pointsImpact: 8,
    },
    {
      name: 'Review keywords',
      status: reviewKeywords.length >= 3 ? 'good' : reviewKeywords.length > 0 ? 'warning' : 'missing',
      value: reviewKeywords.length > 0
        ? `Positive keywords found: ${reviewKeywords.join(', ')}`
        : 'No positive review keywords detected in AI responses',
      consequence: 'No quality keywords in AI responses — users see no description of your service quality',
      impact: 'medium',
      fixAvailable: reviewKeywords.length < 3,
      pointsImpact: 7,
    },
    {
      name: 'Multi-platform reviews',
      status: multiPlatform ? 'good' : 'missing',
      value: multiPlatform
        ? 'Reviews referenced across multiple platforms — strong cross-platform trust signal'
        : reviewPlatforms.size === 1
          ? 'Reviews referenced on a single platform only'
          : 'Reviews not referenced on any named platform in AI responses',
      consequence: 'Single-platform reviews — AI platforms favour businesses with corroborated reviews across Google, Yelp, and others',
      impact: 'medium',
      fixAvailable: !multiPlatform,
      pointsImpact: 9,
    },
    {
      name: 'Response rate signals',
      status: hasResponseRate ? 'good' : 'missing',
      value: hasResponseRate
        ? 'Owner review responses detected — strong engagement signal for AI ranking'
        : 'No review response activity detected in AI responses',
      consequence: 'Not responding to reviews — AI trust algorithms factor owner engagement heavily into recommendation scores',
      impact: 'medium',
      fixAvailable: !hasResponseRate,
      pointsImpact: 9,
    },
  ];
}

// ── BUILD COMMUNITY SIGNALS ────────────────────────────────────────────
export interface RedditEnrichment {
  mentionCount: number;
  topSubreddits: string[];
  sentiment: string | null;
}

export function buildCommunitySignals(
  attributedText: string,
  redditEnrichment?: RedditEnrichment | null,
  businessInput?: string,
  opts: TrustAttributionOpts = {},
): TrustSignal[] {
  const reddit = redditEnrichment;
  const mentionCount = reddit?.mentionCount ?? 0;
  const topSubreddits = reddit?.topSubreddits ?? [];

  let redditStatus: TrustSignal['status'];
  let redditValue: string;

  if (reddit) {
    const subredditList = topSubreddits.length > 0
      ? topSubreddits.slice(0, 3).map(s => s.startsWith('r/') ? s : `r/${s}`).join(', ')
      : null;

    if (mentionCount >= 5) {
      redditStatus = 'good';
      redditValue = `${mentionCount} Reddit mentions found${subredditList ? ` · Active in ${subredditList}` : ''}`;
    } else if (mentionCount >= 1) {
      redditStatus = 'warning';
      redditValue = `${mentionCount} Reddit mention${mentionCount > 1 ? 's' : ''} found${subredditList ? ` · ${subredditList}` : ''} — needs more presence`;
    } else {
      redditStatus = 'missing';
      redditValue = 'No Reddit mentions found — not in Perplexity\'s community citation pool';
    }
  } else if (scanTextMentions(attributedText, 'Reddit')) {
    redditStatus = 'warning';
    redditValue = 'Reddit mentioned in scan responses — direct mention count unavailable';
  } else {
    redditStatus = 'missing';
    redditValue = 'No Reddit presence detected in scan responses';
  }

  const forumMention = FORUM_PATTERNS.test(attributedText);
  const nextdoor = NEXTDOOR_PATTERNS.test(attributedText);

  // Check if Nextdoor appears with an actual business recommendation context
  const nextdoorRecommend = /nextdoor.*\b(recommend|suggest|love|great|best)\b|\b(recommend|suggest|love|great|best)\b.*nextdoor/i.test(attributedText);
  // azzv: press/award evidence is sentence-level (a sentence that mentions
  // THIS business) + negation-aware. The old precedence bug lived here:
  // `NEWS && includes('cover') || includes('feature')` parsed as
  // `(NEWS && cover) || feature`, so a bare 'feature' anywhere
  // ('features free parking') took the 'Press coverage detected' branch.
  // That expression is gone — evidence is now one explicit check.
  const bizSentences = splitSentences(attributedText).filter(s => !businessInput || sentenceMentionsBusiness(s, businessInput, opts.competitorNames ?? []));
  const hasPressEvidence = bizSentences.some(s => hasPressEvidenceIn(s, businessInput ?? ''));
  const hasWeakNews = !hasPressEvidence && bizSentences.some(s => hasNonNegatedMatch(s, NEWS_WEAK));
  const hasAwardEvidence = bizSentences.some(s => {
    const awardText = s.replace(CERTIFICATION_PHRASES, ' ');
    return hasNonNegatedMatch(awardText, AWARD_WORD) && hasNonNegatedMatch(awardText, AWARD_CONTEXT);
  });
  const hasWeakAward = !hasAwardEvidence && bizSentences.some(s => hasNonNegatedMatch(s, AWARD_WEAK));

  return [
    {
      name: 'Reddit mentions',
      status: redditStatus,
      value: redditValue,
      consequence: `Perplexity frequently cites Reddit for local service queries — without Reddit presence you lose Perplexity recommendations`,
      impact: 'low',
      fixAvailable: redditStatus !== 'good',
      pointsImpact: 12,
    },
    {
      name: 'Nextdoor presence',
      status: nextdoor ? (nextdoorRecommend ? 'good' : 'warning') : 'missing',
      value: nextdoor
        ? nextdoorRecommend
          ? 'Nextdoor recommendations detected — strong hyper-local trust signal'
          : 'Nextdoor mentioned in scan responses — verify active recommendations exist'
        : 'No Nextdoor presence detected in AI responses',
      consequence: 'Missing Nextdoor — hyper-local queries on Perplexity and ChatGPT increasingly pull from Nextdoor recommendations',
      impact: 'medium',
      fixAvailable: !nextdoor,
      pointsImpact: 8,
    },
    {
      name: 'Local news mentions',
      status: hasPressEvidence ? 'good' : hasWeakNews ? 'warning' : 'missing',
      value: hasPressEvidence
        ? 'Press or news coverage detected — strong editorial citation signal for AI'
        : hasWeakNews
          ? 'News or media mentioned without verifiable press coverage — confirm a real outlet covered you'
          : 'No local news or press coverage detected in AI responses',
      consequence: 'No press coverage — editorial citations from local news are high-authority signals that Perplexity and ChatGPT prioritise',
      impact: 'medium',
      fixAvailable: !hasPressEvidence,
      pointsImpact: 10,
    },
    {
      name: 'Awards or recognition',
      status: hasAwardEvidence ? 'good' : hasWeakAward ? 'warning' : 'missing',
      value: hasAwardEvidence
        ? 'Awards or industry recognition mentioned in AI responses — strong differentiator'
        : hasWeakAward
          ? 'Praise or recognition mentioned but no verifiable award named — confirm a real award or listing'
          : 'No awards or recognition detected in AI responses',
      consequence: 'No awards detected — recognised businesses appear in AI responses more often for competitive queries',
      impact: 'low',
      fixAvailable: !hasAwardEvidence,
      pointsImpact: 6,
    },
    {
      name: 'Forum mentions',
      status: forumMention ? 'good' : 'missing',
      value: forumMention
        ? 'Forum or community discussions detected in AI responses'
        : 'No forum or community discussion mentions detected',
      consequence: 'No community forum presence — misses citations from Quora, city-data, and niche forums that AI platforms pull from',
      impact: 'low',
      fixAvailable: !forumMention,
      pointsImpact: 5,
    },
  ];
}

// ── BUILD AI PLATFORM SIGNALS ──────────────────────────────────────────
export function buildAIPlatformSignals(
  attributedResults: Array<{ platform: string; response: string | null }>,
  businessInput: string,
  totalPlatforms: number,
  // b8ad: how many platforms actually RESPONDED (non-null response_text).
  // The mention rate's denominator stays totalPlatforms (coverage across
  // all platforms checked), but the value now also says how many answered
  // — so 'Mentioned by 1 of 12' no longer reads against a dashboard
  // '2 of 9 responded' as if one of them were wrong. They measure
  // different things: coverage vs response rate.
  respondedPlatforms?: number
): TrustSignal[] {
  // ax87: these signals are about MENTIONS, not responses. Only responses
  // that mention the business are passed in (see detectTrustSignals);
  // totalPlatforms is the full platform count (the denominator). The old
  // code counted responded/total, so a business mentioned on 1 of 9
  // platforms still got '9 of 9 platforms' social proof.
  const withResponse = attributedResults.filter(r => r.response);
  const total = totalPlatforms;
  const mentioned = withResponse.length;
  const mentionRate = total > 0 ? mentioned / total : 0;

  // azzw: consensus must measure AGREEMENT, not coverage. The old
  // `mentionRate >= 0.7` relabelled coverage as consensus — a business
  // mentioned on 8/12 platforms with wildly different descriptions still
  // got 'Strong consensus'. Agreement = the average share of each
  // mentioning response's content words that appear in at least one
  // OTHER mentioning response. Business-name words are excluded from the
  // comparison — they appear in every mentioning response by definition,
  // so including them would inflate agreement.
  const nameWords = new Set(normalise(businessInput).split(' ').filter(w => w.length > 3));
  const STOPWORDS = new Set(['about', 'across', 'after', 'also', 'another', 'around', 'because', 'before', 'between', 'during', 'through', 'under', 'within', 'without', 'should', 'would', 'could', 'their', 'there', 'these', 'those', 'which', 'other', 'while', 'where', 'when']);
  const contentWords = (text: string): string[] => {
    const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 4 && !STOPWORDS.has(w) && !nameWords.has(w));
    return [...new Set(words)];
  };
  const responseWords = withResponse.map(r => contentWords(r.response!));
  let agreement: number | null = null;
  if (withResponse.length >= 2) {
    const perResponse = responseWords.map((words, i) => {
      if (words.length === 0) return null;
      const others = new Set(responseWords.flatMap((w, j) => (j === i ? [] : w)));
      return words.filter(w => others.has(w)).length / words.length;
    }).filter((x): x is number => x !== null);
    agreement = perResponse.length > 0
      ? perResponse.reduce((a, b) => a + b, 0) / perResponse.length
      : null;
  }

  // b8ad: 'Consistent description' uses the SAME agreement measurement
  // as 'Platform consensus'. The old strict common-words check (a word
  // present in EVERY description's first 100 chars) could pass while
  // agreement sat below 50% — the page then showed a Passing
  // 'Consistent description' beside a warning 'Platforms disagree' for
  // the same responses.
  const consistent = agreement !== null && agreement >= 0.5;

  const queryWords = normalise(businessInput).split(' ').filter(w => w.length > 3);
  const intentMatch = withResponse.filter(r => {
    const normResponse = normalise(r.response!);
    return queryWords.some(w => normResponse.includes(w));
  }).length;
  const intentMatchRate = withResponse.length > 0 ? intentMatch / withResponse.length : 0;

  const respondedSuffix = respondedPlatforms !== undefined ? ` (${respondedPlatforms} responded)` : '';

  return [
    {
      name: 'Platform mention rate',
      status: mentionRate >= 0.8 ? 'good' : mentionRate >= 0.5 ? 'warning' : 'missing',
      value: mentionRate >= 0.8
        ? `Mentioned by ${mentioned} of ${total} AI platforms — strong visibility${respondedSuffix}`
        : `Mentioned by ${mentioned} of ${total} platforms — below Rankall's 80% visibility threshold${respondedSuffix}`,
      consequence: respondedPlatforms !== undefined
        ? `Only ${mentioned} of ${respondedPlatforms} AI answers that responded mention you — you are invisible in ${respondedPlatforms - mentioned} of them`
        : `Only ${mentioned}/${total} platforms mention you — you are invisible in ${total - mentioned} AI searches`,
      impact: 'high',
      fixAvailable: mentionRate < 0.8,
      pointsImpact: 20,
    },
    {
      name: 'Platform consensus',
      // 0 mentions: nothing to agree on (not measurable). 1 mention:
      // nothing to disagree with (good, not missing). >= 2: real
      // agreement — >= 50% shared descriptive content is consensus.
      status: mentioned === 0 ? 'missing' : mentioned === 1 ? 'good' : agreement !== null && agreement >= 0.5 ? 'good' : 'warning',
      value: mentioned === 0
        ? 'No mentioning responses — consensus not measurable'
        : mentioned === 1
          ? 'Single mentioning response — nothing to disagree with'
          : agreement !== null && agreement >= 0.5
            ? `Platforms agree on ${Math.round(agreement * 100)}% of descriptive content across ${mentioned} mentioning responses`
            : agreement !== null
              ? `Platforms disagree — only ${Math.round(agreement * 100)}% of descriptive content is shared across ${mentioned} mentioning responses`
              : 'Not enough descriptive content to measure agreement',
      consequence: 'Inconsistent AI platform signals — users see different results on each platform, reducing trust in your brand',
      impact: 'high',
      fixAvailable: mentioned >= 2 && (agreement === null || agreement < 0.5),
      pointsImpact: 14,
    },
    {
      name: 'Consistent description',
      // azzw: a single description cannot be inconsistent — the old code
      // set commonWords = [] for 1 response, scoring 'missing'
      // ('Inconsistent descriptions') when there was nothing inconsistent.
      status: withResponse.length === 0 ? 'missing' : withResponse.length === 1 ? 'good' : consistent ? 'good' : 'missing',
      value: withResponse.length === 0
        ? 'No descriptions to compare across platforms'
        : withResponse.length === 1
          ? 'Single platform description — nothing to disagree with'
          : consistent
            ? 'Business described consistently across all platforms — strong brand signal'
            : 'Inconsistent business descriptions detected across AI platforms',
      consequence: 'Inconsistent descriptions confuse AI — platforms generate different (sometimes wrong) business summaries',
      impact: 'medium',
      fixAvailable: withResponse.length >= 2 && !consistent,
      pointsImpact: 8,
    },
    {
      name: 'Query intent match',
      status: intentMatchRate >= 0.8 ? 'good' : intentMatchRate >= 0.5 ? 'warning' : 'missing',
      value: intentMatchRate >= 0.8
        ? `${intentMatch} of ${withResponse.length} responses directly match query intent`
        : `${intentMatch} of ${withResponse.length} responses match query intent — below threshold`,
      consequence: 'Low intent match — AI platforms are answering the query with competitors, not you',
      impact: 'medium',
      fixAvailable: intentMatchRate < 0.8,
      pointsImpact: 10,
    },
  ];
}

// ── OVERALL SCORE ──────────────────────────────────────────────────────
export function calculateOverall(signals: TrustSignal[]): number {
  // b0fh: unmeasured ('not_checked') signals must not drag the score —
  // they contribute neither points nor denominator.
  const measured = signals.filter(s => s.status !== 'not_checked');
  if (measured.length === 0) return 0;
  const points = measured.reduce((sum, s) => {
    if (s.status === 'good') return sum + 1;
    if (s.status === 'warning') return sum + 0.5;
    return sum;
  }, 0);
  return Math.round((points / measured.length) * 100);
}

// ── REAL FIX GAIN (ax88) ───────────────────────────────────────────────
// The score gain from fixing ONE signal, under the actual scoring math.
// calculateOverall weights every signal equally (good=1, warning=0.5,
// else 0), so fixing a missing signal gains 1/total of the score and a
// warning gains 0.5/total. The old badges showed pointsImpact (e.g. +18
// for FAQ) — a weight from a never-implemented scoring scheme — which
// summed to far more than 100 and contradicted the actual math.
export function trustFixGainPoints(signal: { status: string }, signals: Array<{ status: string }>): number {
  // b0fh: no promised gain for an unmeasured signal.
  if (signal.status === 'not_checked') return 0;
  // b0fh residual: the denominator is the MEASURED count — the same
  // denominator calculateOverall uses. Callers used to pass
  // allSignals.length (including not_checked), so badges divided by
  // unchecked signals and understated the gain. The function takes
  // the array and counts measured itself, so no caller can reintroduce
  // the wrong denominator.
  const totalSignals = signals.filter(s => s.status !== 'not_checked').length;
  if (totalSignals <= 0) return 0;
  const credit = signal.status === 'good' ? 1 : signal.status === 'warning' ? 0.5 : 0;
  return Math.round(((1 - credit) / totalSignals) * 100);
}

// ── MAIN EXPORT ────────────────────────────────────────────────────────
// ── STALE-POISONED-REPORT GUARD (PR #39 follow-up) ──────────────────────
// The Title tag technical signal quotes a <title> extracted verbatim from
// the HTML fetched at scan time. Pre-PR #37 scans resolved the website URL
// from enrichment.google.website with zero validation, so a stale report
// can quote ANOTHER business's title tag (e.g. "Brite Smiles Dentistry -
// Dentists in Flower Mound" on a "Bright Smile Dental, Dallas" report).
// The scan row records no user-supplied website, so at render time we
// cannot prove the HTML came from the scanned business's own site.
// Rule: when the stored GBP data fails the confident-match re-validation
// (googleMismatch — the same check PR #39 uses for the GBP card), any
// quoted title is unverified: never quote it. Replace with an honest
// not-verified state at zero points impact (don't penalize for
// unverified data, matching the missing-website principle above).
// Pure function — no DB, no fetch. Never throws.
export const TITLE_MISSING_NAME_VALUE = "Title doesn't mention your business name";
// Prefix for a non-matching title from a USER-SUPPLIED website — safe to
// quote (it is the user's own site). The legacy unverified prefix
// ('Title present but business name missing') is always unquoted.
export const TITLE_VERIFIED_MISSING_PREFIX = "Your website's title doesn't mention your business name";

export function sanitizeTitleTagSignal(signal: TrustSignal, googleMismatch: boolean): TrustSignal {
  if (signal.name !== 'Title tag') return signal;
  if (!signal.value.includes('"')) return signal; // no quoted title to leak
  if (googleMismatch) {
    return {
      ...signal,
      status: 'missing',
      value: 'Title tag not verified for this business — the stored website data belongs to another business, so no title is shown.',
      consequence: 'Title tag not verified for this business — the stored website data belongs to another business.',
      pointsImpact: 0,
      fixAvailable: true,
    };
  }
  // #40: even without a Google mismatch, a quoted title that does NOT
  // contain the business name may come from a wrong (unverified) website.
  // A 'good' title passed the name check at scan time (against the
  // resolved name), so it is safe to quote. Legacy non-matching rows
  // ('Title present but business name missing: "…"') are shown unquoted;
  // the user-verified form keeps its quote (it is the user's own site).
  if (signal.status === 'good') return signal;
  if (signal.value.startsWith(TITLE_VERIFIED_MISSING_PREFIX)) return signal;
  return { ...signal, value: TITLE_MISSING_NAME_VALUE };
}
