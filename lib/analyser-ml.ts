import { normalizeBusinessName } from './dataQuality';
import { lookupGooglePlace } from './enrichment';
import { sectorFromPlacesTypes, CATEGORIES } from './categories';
import { splitSentences, mentionsBusinessName, stripLocationSuffix } from './trust';

export interface PlatformAnalysis {
    platform: string;
    weight: number;
    mentioned: boolean;
    mentionRate: number;
    competitor_mentioned: boolean;
    competitorMentionRate: number;
    sentiment: 'positive' | 'neutral' | 'negative' | null;
    rankPosition: number | null;
    citationSources: string[];
    competitor: string | null;
  }
  
  // ── FUZZY MATCH ─────────────────────────────────────────────────────
  function normalise(text: string): string {
    return text
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      // d42e: strip markdown links BEFORE punctuation removal — keep the link
      // text, drop the URL. Otherwise "[Biz](https://...)" glues into
      // "bizhttps..." and whole-phrase matching misses the real mention.
      // (Punctuation still collapses to '' so negation patterns like
      // /couldn'?t/ keep matching "couldnt".)
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1 ')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ax87: whole-phrase matching on normalised text (single-space
  // word-separated). Raw includes()/indexOf() matches "ace dental"
  // inside "grace dental" — a substring, not a mention.
  function includesWholePhrase(haystack: string, needle: string): boolean {
    if (!needle) return false;
    return ` ${haystack} `.includes(` ${needle} `);
  }
  // Index of needle as whole words in haystack (-1 = absent). `from`
  // must sit on a word boundary (callers advance past a whole match).
  function indexOfWholePhrase(haystack: string, needle: string, from = 0): number {
    if (!needle) return -1;
    // The padded string's leading-space index equals the original index of
    // the first needle char (padding shifts everything by one), so `from +
    // idx` is the match start. The old `- 1` pointed at the preceding space,
    // which cut the trailing space off the negation window ("i'm not
    // familiar with") and let hedged refusals count as mentions.
    const idx = ` ${haystack.slice(from)} `.indexOf(` ${needle} `);
    return idx === -1 ? -1 : from + idx;
  }
  
  // Common industry/geo words. A business name made ONLY of these (e.g. "Chicago
  // Dental Care") is generic — fuzzy matching on it is unreliable, so we fall back
  // to exact-substring only to avoid false positives.
  const COMMON_NAME_WORDS = new Set([
    'dental','care','clinic','dentist','dentists','doctor','medical','health','center','centre',
    'group','associates','family','smile','smiles','heating','cooling','air','plumbing','electric',
    'electrical','services','service','company','best','local','spa','salon','hair','beauty','nails',
    'law','legal','attorney','attorneys','firm','restaurant','cafe','coffee','bar','grill','kitchen',
    'auto','repair','shop','store','fitness','gym','studio','wellness','vet','veterinary','pet','animal',
    'hospital','urgent','emergency','hour','realty','real','estate','homes','property','insurance',
    'financial','tax','accounting','construction','roofing','landscaping','cleaning','moving','storage',
    'park','city','north','south','east','west','downtown','uptown','central','main','street',
    // major cities / places
    'chicago','york','angeles','houston','dallas','austin','london','sydney','toronto','boston',
    'denver','seattle','miami','atlanta','phoenix','melbourne','manchester','vancouver','mumbai','dubai',
  ]);

  function hasDistinctiveWord(words: string[]): boolean {
    return words.some(w => !COMMON_NAME_WORDS.has(w));
  }

  const NEGATION_PATTERNS = [
    /i (?:don'?t|do not) have (?:specific |any )?information (?:about|on|regarding) /,
    /i (?:couldn'?t|could not|can'?t|cannot) (?:find|verify|confirm|locate) /,
    /(?:no|not any) (?:specific )?information (?:about|on|regarding) /,
    /i'?m not (?:familiar|aware) (?:with|of) /,
    /i (?:don'?t|do not) (?:have|know) (?:about|of) /,
    /(?:there is no|there'?s no) (?:business|listing|record|information) (?:called|named|about|for) /,
    /i (?:wasn'?t|was not) able to find /,
    /(?:unfortunately|sorry),? i (?:don'?t|couldn'?t|cannot|can'?t) /,
    /i (?:don'?t|do not) recognize /,
    /no results (?:for|found for|matching) /,
    // ── P0d: hedged non-answers — the model restates the name while refusing
    // to recommend. None of these count as a mention.
    /i (?:don'?t|do not) have (?:access to )?(?:reviews|ratings|knowledge) (?:about|on|for|regarding) /,
    /i (?:don'?t|do not) have (?:any )?(?:current|uptodate|recent) (?:data|information|knowledge)/,
    /i (?:can'?t|cannot|couldn'?t|could not) (?:speak to|comment on|vouch for|attest to) (?:their|its|the) /,
    /i (?:can'?t|cannot|couldn'?t|could not|won'?t|will not) (?:provide|give|offer|make) (?:a |any )?recommendation/,
    /i (?:don'?t|do not) know (?:much |a lot |enough )?(?:about|of) /,
  ];

  function isNegationContext(normResponse: string, normBiz: string): boolean {
    const idx = indexOfWholePhrase(normResponse, normBiz);
    if (idx === -1) return false;
    const before = normResponse.slice(Math.max(0, idx - 120), idx);
    return NEGATION_PATTERNS.some(p => p.test(before));
  }

  // ── P0d: neutral-echo rejection ──────────────────────────────────────────
  // A response that restates the name only as a topic marker ("Regarding X,
  // here are some dentists: A, B, C") is not a recommendation. This fires only
  // when the name occurs exactly once, sits near the top of the answer, and
  // is either introduced by topic-framing language or followed by a
  // list-introducer — the signature of an echo, not a mention.
  const ECHO_FRAMING_BEFORE = [
    /regarding\s*$/,
    /about\s*$/,
    /concerning\s*$/,
    /re\s*:\s*$/,
    /here is what i found about\s*$/,
    /based on (?:my|the) search for\s*$/,
    /results for\s*$/,
    /your question about\s*$/,
  ];
  const ECHO_INTRODUCER_AFTER = [
    /^[\s,.!?;:]*here are some /,
    /^[\s,.!?;:]*here is a list /,
    /^[\s,.!?;:]*top [\w\s]{0,40}? (?:include|includes|are)[\s:]/,
    /^[\s,.!?;:]*including[\s:]/,
  ];

  function isEchoContext(normResponse: string, normName: string): boolean {
    let count = 0;
    let from = 0;
    let first = -1;
    for (;;) {
      const idx = indexOfWholePhrase(normResponse, normName, from);
      if (idx === -1) break;
      if (first === -1) first = idx;
      count++;
      from = idx + normName.length;
      if (count > 1) return false; // restated name = discussed, not echoed
    }
    if (count !== 1 || first > 90) return false; // topic markers lead the answer
    const before = normResponse.slice(0, first);
    const after = normResponse.slice(first + normName.length, first + normName.length + 80);
    return (
      ECHO_FRAMING_BEFORE.some(p => p.test(before)) ||
      ECHO_INTRODUCER_AFTER.some(p => p.test(after))
    );
  }

  export function detectBusinessMention(responseText: string, businessName: string, city?: string): boolean {
    if (!responseText || !businessName) return false;
    const normResponse = normalise(responseText);
    const normBiz = normalise(businessName);

    // 1) Exact normalized substring — the strongest, most reliable signal.
    //    But reject if the name appears in a negation context ("I don't know X")
    //    or as a neutral echo ("Regarding X, here are some dentists").
    if (includesWholePhrase(normResponse, normBiz)) {
      if (isNegationContext(normResponse, normBiz)) return false;
      if (isEchoContext(normResponse, normBiz)) return false;
      return true;
    }

    // 1b) Strip entity suffixes (LLP, LLC, PC, Inc, etc.) and trailing city,
    //     then retry substring. Always runs — even when normalization is a no-op.
    const coreBiz = normalizeBusinessName(businessName, city);
    if (coreBiz && includesWholePhrase(normResponse, coreBiz)) {
      if (isNegationContext(normResponse, coreBiz)) return false;
      if (isEchoContext(normResponse, coreBiz)) return false;
      return true;
    }

    // Use the normalized (city-stripped) name for fuzzy matching so a trailing
    // city token doesn't inflate the word count past the 70% threshold.
    const coreWords = coreBiz.split(' ').filter(w => w.length > 3);
    if (coreWords.length < 2) return false;

    // 2) Generic, all-common names ("Chicago Dental Care"): fuzzy matching falsely
    //    matches ANY business in that category/city, so DISABLE fuzzy — exact only.
    if (!hasDistinctiveWord(coreWords)) return false;

    // 3) Distinctive names: fuzzy match, but the words must CLUSTER (proximity
    //    window) so scattered generic words across paragraphs don't false-match.
    //    Distinctive → 70% threshold; otherwise we'd never reach here.
    const threshold = 0.7;
    const respWords = normResponse.split(' ');
    const windowSize = Math.max(coreWords.length + 3, 6);
    for (let i = 0; i <= Math.max(0, respWords.length - 1); i++) {
      const window = respWords.slice(i, i + windowSize).join(' ');
      // ax87: word membership, not substring — "care" must not match
      // "healthcare", "ace" must not match "grace".
      const windowWords = new Set(window.split(' '));
      const hits = coreWords.filter(w => windowWords.has(w)).length;
      if (hits / coreWords.length >= threshold) return true;
    }
    return false;
  }
  
  // ── COMPETITOR EXTRACTION ────────────────────────────────────────────
  const DIRECTORY_BLACKLIST = [
    'psychology today', 'yelp', 'healthgrades', 'tripadvisor', 'google',
    'facebook', 'linkedin', 'bbb', 'angi', 'homeadvisor', 'thumbtack',
    'zocdoc', 'vitals', 'webmd', 'avvo', 'martindale', 'zillow', 'realtor',
    'booking', 'expedia', 'weddingwire', 'theknot', 'zola', 'mindbody',
    'repairpal', 'vetstreet', 'petmd', 'classpass', 'instagram', 'twitter',
    'youtube', 'reddit', 'bing', 'yahoo', 'amazon', 'trustpilot', 'opentable',
    'zomato', 'doordash', 'grubhub', 'houzz', 'nextdoor', 'justia', 'findlaw',
    // additional directories
    'angieslist', 'angie', 'bark.com', 'bark', 'fixr', 'porch', 'networx',
    'care.com', 'care', 'rover', 'wag', 'angieslist', 'superpages', 'yellowpages',
    'manta', 'mapquest', 'bing maps', 'apple maps', 'foursquare', 'yelp.com',
    'glassdoor', 'indeed', 'healthline', 'mayo clinic', 'nerdwallet', 'bankrate',
  ];

  function isDirectory(name: string): boolean {
    const lower = name.toLowerCase();
    return DIRECTORY_BLACKLIST.some(d => lower.includes(d) || d.includes(lower));
  }

  // Generic query tokens — a candidate made entirely of these is a query echo, not a business.
  const QUERY_ECHO_TOKENS = new Set([
    'best', 'top', 'rated', 'reviews', 'near', 'me', 'companies', 'services',
    'service', 'guide', 'list', 'highest', 'affordable', 'cheap', 'professional',
    'local', 'recommended', 'in', 'the', 'and', 'for', 'of', 'a',
  ]);

  const ENTITY_SUFFIXES = /\b(llc|inc|ltd|co|corp|group|services|service|company)\b/gi;

  // Returns:
  //   'reject'  — direct query echo, hard-reject
  //   'generic' — all tokens are city + category + stopwords; requires Places confirmation at 0.9
  //   false     — distinctive name, normal 0.8 Places threshold
  function classifyCandidate(candidateName: string, queries: string[], city?: string, category?: string): 'reject' | 'generic' | false {
    const lower = candidateName.toLowerCase().trim()
      .replace(ENTITY_SUFFIXES, '')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    // Direct match: candidate is contained in (or contains) one of the scan queries
    for (const q of queries) {
      const ql = q.toLowerCase();
      if (ql.includes(lower) || lower.includes(ql)) return 'reject';
    }
    // All tokens are generic + city + category words → needs Places confirmation
    const extraTokens = new Set<string>();
    if (city) city.toLowerCase().split(/\s+/).forEach(w => extraTokens.add(w));
    if (category) category.toLowerCase().split(/\s+/).forEach(w => extraTokens.add(w));
    const words = lower.split(/\s+/).filter(Boolean);
    if (words.length > 0 && words.every(w => QUERY_ECHO_TOKENS.has(w) || extraTokens.has(w))) return 'generic';
    return false;
  }

  // Containment similarity: what fraction of the CANDIDATE's tokens appear in the
  // Places name. Uses candidate as denominator so longer official names (e.g.
  // "Window Genie of Naperville and East Aurora") don't penalize a shorter candidate
  // ("Window Genie of Naperville" → 1.0).
  const SIMILARITY_STOPWORDS = new Set(['of', 'the', 'and', 'in', 'at', 'by', 'for', 'a', 'an']);

  export function nameSimilarity(candidate: string, placesName: string, city?: string): number {
    const cityTokens = new Set(
      city ? city.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean) : []
    );
    const strip = (s: string) => s.toLowerCase()
      .replace(ENTITY_SUFFIXES, '')
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w && !SIMILARITY_STOPWORDS.has(w) && !cityTokens.has(w));
    const cWords = strip(candidate);
    const pWords = strip(placesName);
    if (cWords.length === 0) return 0;
    const pSet = new Set(pWords);
    const matches = cWords.filter(w => pSet.has(w)).length;
    return matches / cWords.length;
  }

  // ── Places-based competitor validation cache ─────────────────────────
  // Keyed by normalized "name|city" → { canonicalName, valid }
  const _placesCache = new Map<string, { canonicalName: string | null; placeId: string | null; valid: boolean }>();

  function placesCacheKey(name: string, city: string): string {
    return `${name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()}|${city.toLowerCase().trim()}`;
  }

  const PLACES_SIMILARITY_DEFAULT = 0.8;
  const PLACES_SIMILARITY_GENERIC = 0.9;

  // Check that a Places result address is in the expected city/state area.
  // Rejects results from a different state (e.g. Southampton, UK for a Naperville scan).
  function isAddressLocal(address: string | null, city: string): boolean {
    if (!address) return true; // no address to check — fail open
    const addrLower = address.toLowerCase();
    const cityLower = city.toLowerCase().trim();
    // Check city name appears in the address
    if (addrLower.includes(cityLower)) return true;
    // For US addresses, check that the state matches — extract the 2-letter state
    // from both the expected city context and the result address.
    // Addresses look like "123 Main St, Naperville, IL 60540, USA"
    const stateMatch = addrLower.match(/,\s*([a-z]{2})\s+\d{5}/);
    if (stateMatch) {
      // If we can find the state in the city input (e.g. "Naperville, IL")
      const cityStateMatch = cityLower.match(/,\s*([a-z]{2})$/);
      if (cityStateMatch && cityStateMatch[1] !== stateMatch[1]) return false;
    }
    // Non-US or can't parse — check for country mismatch
    if (addrLower.includes(', uk') || addrLower.includes('united kingdom')) {
      if (!cityLower.includes('uk') && !cityLower.includes('united kingdom')) return false;
    }
    return true;
  }

  const CROSS_INDUSTRY_KEYWORDS: Record<string, string[]> = {
    'Health & Medical': ['dental', 'dentist', 'orthodont', 'chiropr', 'medical', 'hospital', 'pharmacy', 'optometr', 'pediatr', 'dermatol', 'physiother'],
    'Legal': ['attorney', 'lawyer', 'law firm', 'law office', 'paralegal'],
    'Financial & Professional Services': ['accountant', 'tax prep', 'insurance agency', 'real estate', 'mortgage'],
    'Automotive': ['auto repair', 'car wash', 'auto body', 'car dealer', 'tire shop'],
    'Food & Hospitality': ['restaurant', 'bakery', 'catering', 'pizza', 'sushi', 'grill'],
    'Personal Care & Beauty': ['hair salon', 'barbershop', 'nail salon', 'day spa', 'beauty salon'],
    'Pet Services': ['veterinar', 'vet clinic', 'pet groom', 'kennel', 'dog walk'],
    'Education & Tutoring': ['tutor', 'preschool', 'montessori', 'learning center'],
    'Fitness & Wellness': ['gym', 'fitness center', 'yoga studio', 'crossfit'],
    'Religious & Community': ['church', 'mosque', 'synagogue', 'funeral home'],
  };

  export function isCrossIndustry(placeName: string, placeTypes: string[] | null, scanCategory?: string): boolean {
    if (!scanCategory) return false;
    const catEntry = CATEGORIES[scanCategory];
    if (!catEntry) return false;
    const scanSector = catEntry.sector;

    if (placeTypes && placeTypes.length > 0) {
      const resultSector = sectorFromPlacesTypes(placeTypes);
      if (resultSector && resultSector !== '__UNSUPPORTED__' && resultSector !== scanSector
          && CROSS_INDUSTRY_KEYWORDS[resultSector]) {
        console.log('[competitor] cross-industry via Places types:', { placeName, placeTypes, resultSector, scanSector });
        return true;
      }
    }

    const nameLC = placeName.toLowerCase();
    for (const [sector, keywords] of Object.entries(CROSS_INDUSTRY_KEYWORDS)) {
      if (sector === scanSector) continue;
      for (const kw of keywords) {
        if (nameLC.includes(kw)) {
          console.log('[competitor] cross-industry keyword:', { placeName, keyword: kw, keywordSector: sector, scanSector });
          return true;
        }
      }
    }
    return false;
  }

  async function validateCompetitorViaPlaces(
    name: string,
    city: string,
    similarityThreshold: number = PLACES_SIMILARITY_DEFAULT,
    isGeneric: boolean = false,
    category?: string,
  ): Promise<{ valid: boolean; canonicalName: string | null; placeId: string | null }> {
    const key = placesCacheKey(name, city);
    const cached = _placesCache.get(key);
    if (cached) return cached;

    try {
      const result = await lookupGooglePlace(name, city, category);
      // Generic candidates keep city tokens in similarity so "Naperville Window
      // Cleaning" doesn't falsely match "Powerhouse Window Cleaning."
      const sim = result.hasListing && result.placeName
        ? nameSimilarity(name, result.placeName, isGeneric ? undefined : city)
        : 0;
      const local = isAddressLocal(result.placeAddress, city);
      const crossIndustry = result.hasListing && result.placeName
        ? isCrossIndustry(result.placeName, result.placeTypes, category)
        : false;
      const pass = result.hasListing && sim >= similarityThreshold && local && !crossIndustry;
      console.log('[scan] places match:', {
        candidate: name,
        placeName: result.placeName,
        placeAddress: result.placeAddress,
        placeTypes: result.placeTypes,
        similarity: sim.toFixed(2),
        threshold: similarityThreshold,
        local,
        crossIndustry,
        pass,
      });
      const entry = pass
        ? { valid: true, canonicalName: result.placeName, placeId: result.placeId }
        : { valid: false, canonicalName: null, placeId: null };
      _placesCache.set(key, entry);
      return entry;
    } catch {
      const failOpen = similarityThreshold <= PLACES_SIMILARITY_DEFAULT;
      const entry = failOpen
        ? { valid: true, canonicalName: name, placeId: null }
        : { valid: false, canonicalName: null, placeId: null };
      _placesCache.set(key, entry);
      return entry;
    }
  }

  // Exported for testing
  export function _clearPlacesCache() { _placesCache.clear(); }

  interface RawCandidate { name: string; mentions: number; platforms: string[]; isGeneric: boolean }

  // Sync extraction: regex + filter only, no Places validation.
  // Tags generic candidates (all tokens are city+category+stopwords) for tiered
  // Places threshold in the async version. Direct query echoes are still rejected.
  export function extractAllCompetitorsSync(
    responses: Array<{ platform: string; response: string }>,
    businessName?: string,
    extraBlacklist?: string[],
    options?: { queries?: string[]; city?: string; category?: string }
  ): RawCandidate[] {
    const queries = options?.queries || [];
    const city = options?.city;
    const category = options?.category;

    const mergedBlacklist = extraBlacklist && extraBlacklist.length > 0
      ? [...new Set([...DIRECTORY_BLACKLIST, ...extraBlacklist.map(s => s.toLowerCase())])]
      : DIRECTORY_BLACKLIST;
    const isDirectoryMerged = (name: string) => {
      const lower = name.toLowerCase();
      return mergedBlacklist.some(d => lower.includes(d) || d.includes(lower));
    };

    const patterns = [
      /\*\*([A-Z][A-Za-z\s&'.-]{2,40})\*\*/g,
      /(?:recommend|top|best|highly[- ]rated)[^.]*?([A-Z][A-Za-z\s&'.-]{3,40})(?:\s+(?:in|is|for|has))/g,
      /\d+[\.\)]\s+\*?\*?([A-Z][A-Za-z\s&'.-]{3,40})\*?\*?/g,
    ];

    const trivial = new Set(['one', 'the', 'this', 'that', 'here', 'many', 'some', 'your', 'their', 'also', 'other', 'another', 'consider', 'option', 'choice']);

    const rawGroups: Record<string, { bestName: string; mentions: number; platforms: Set<string>; isGeneric: boolean }> = {};

    for (const { platform, response } of responses) {
      if (!response) continue;
      for (const pattern of patterns) {
        const regex = new RegExp(pattern.source, pattern.flags);
        let match;
        while ((match = regex.exec(response)) !== null) {
          // Truncate at trailing sentence fragments: period, comma, semicolon,
          // dash, or connective words that signal the start of a description.
          const name = match[1].trim()
            .replace(/[.,;–—-]\s.*$/, '')
            .replace(/\s+\b(which|that|they|is|are|has|have|was|were|who)\b\s.*$/i, '')
            .trim();
          if (name.length < 4 || name.length > 50) continue;
          if (businessName && detectBusinessMention(name, businessName)) continue;
          if (trivial.has(name.toLowerCase())) continue;
          if (isDirectoryMerged(name)) continue;
          if (queries.length > 0) {
            const cls = classifyCandidate(name, queries, city, category);
            if (cls === 'reject') continue;
            // 'generic' candidates pass through but are tagged
          }
          const tempKey = name.toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\b(llc|inc|ltd|co|corp|group|services|service|company)\b/g, '')
            .replace(/\s+/g, ' ').trim()
            .split(' ').slice(0, 2).join(' ');
          if (!tempKey || tempKey.length < 3) continue;
          const isGeneric = queries.length > 0 && classifyCandidate(name, queries, city, category) === 'generic';
          if (!rawGroups[tempKey]) {
            rawGroups[tempKey] = { bestName: name, mentions: 0, platforms: new Set(), isGeneric };
          }
          rawGroups[tempKey].mentions += 1;
          rawGroups[tempKey].platforms.add(platform);
          if (name.length > rawGroups[tempKey].bestName.length) {
            rawGroups[tempKey].bestName = name;
          }
        }
      }
    }

    return Object.values(rawGroups)
      .map(g => ({ name: g.bestName, mentions: g.mentions, platforms: Array.from(g.platforms), isGeneric: g.isGeneric }))
      .sort((a, b) => b.mentions - a.mentions || b.platforms.length - a.platforms.length || a.name.localeCompare(b.name));
  }

  // Async extraction: regex + filter + Places validation for canonical grouping.
  // Generic candidates (city+category names) require ≥ 0.9 similarity; others ≥ 0.8.
  export async function extractAllCompetitors(
    responses: Array<{ platform: string; response: string }>,
    businessName?: string,
    extraBlacklist?: string[],
    options?: { queries?: string[]; city?: string; category?: string }
  ): Promise<Array<{ name: string; mentions: number; platforms: string[]; variants: string[]; placeId: string | null }>> {
    const city = options?.city;
    const category = options?.category;
    const rawCandidates = extractAllCompetitorsSync(responses, businessName, extraBlacklist, options);

    if (!city || rawCandidates.length === 0) {
      return rawCandidates
        .filter(c => !c.isGeneric)
        .map(c => ({ name: c.name, mentions: c.mentions, platforms: c.platforms, variants: [c.name], placeId: null }));
    }

    // ax7z: generic candidates (all tokens city + category + stopwords,
    // e.g. "Dallas Dental Group" as a phrase) accumulate mentions across
    // responses and outrank real business names. Prefer non-generic
    // candidates; fall back to generic only if nothing else was extracted.
    // (The no-city path already rejects generic outright.)
    const nonGeneric = rawCandidates.filter(c => !c.isGeneric);
    const usable = nonGeneric.length > 0 ? nonGeneric : rawCandidates;
    // Validate top candidates via Google Places (cap at 10 to limit API calls)
    const toValidate = usable.slice(0, 10);
    const validationResults = await Promise.allSettled(
      toValidate.map(c => validateCompetitorViaPlaces(
        c.name,
        city,
        c.isGeneric ? PLACES_SIMILARITY_GENERIC : PLACES_SIMILARITY_DEFAULT,
        c.isGeneric,
        category,
      ))
    );

    // Re-group by canonical Places name, keeping original extracted variants for scoring
    const canonicalGroups: Record<string, { name: string; mentions: number; platforms: Set<string>; variants: Set<string>; placeId: string | null }> = {};
    for (let i = 0; i < toValidate.length; i++) {
      const candidate = toValidate[i];
      const vr = validationResults[i];
      const validation = vr.status === 'fulfilled' ? vr.value : (
        candidate.isGeneric
          ? { valid: false, canonicalName: null, placeId: null }
          : { valid: true, canonicalName: candidate.name, placeId: null }
      );
      if (!validation.valid) {
        console.log('[competitor] Places rejected:', candidate.name, 'in', city, candidate.isGeneric ? '(generic, needs ≥0.9)' : '');
        continue;
      }
      const canonName = validation.canonicalName || candidate.name;
      const canonKey = canonName.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
      if (!canonicalGroups[canonKey]) {
        // ax7z: display a name the responses actually used. Places may
        // canonicalise to a listing name that never appears in the
        // responses (extracted "Dallas Dental Arts" → Places
        // "Dallas Dental Group"), and the report then names a competitor
        // no response ever named. Use the canonical name only if some
        // response mentions it; otherwise the most-mentioned extracted
        // variant (this candidate — candidates are processed in mention
        // order). The canonical name stays in variants for matching.
        const canonicalInResponses = responses.some(r => detectBusinessMention(r.response, canonName));
        canonicalGroups[canonKey] = { name: canonicalInResponses ? canonName : candidate.name, mentions: 0, platforms: new Set(), variants: new Set(), placeId: validation.placeId };
      }
      canonicalGroups[canonKey].mentions += candidate.mentions;
      canonicalGroups[canonKey].variants.add(candidate.name);
      if (canonName !== candidate.name) canonicalGroups[canonKey].variants.add(canonName);
      candidate.platforms.forEach(p => canonicalGroups[canonKey].platforms.add(p));
    }

    return Object.values(canonicalGroups)
      .map(g => ({ name: g.name, mentions: g.mentions, platforms: Array.from(g.platforms), variants: Array.from(g.variants), placeId: g.placeId }))
      .sort((a, b) => b.mentions - a.mentions || b.platforms.length - a.platforms.length || a.name.localeCompare(b.name));
  }

  export async function extractCompetitor(
    responses: Array<{ platform: string; response: string }>,
    businessName?: string,
    extraBlacklist?: string[],
    options?: { queries?: string[]; city?: string; category?: string }
  ): Promise<{ name: string; variants: string[] } | null> {
    const all = await extractAllCompetitors(responses, businessName, extraBlacklist, options);
    return all.length > 0 ? { name: all[0].name, variants: all[0].variants } : null;
  }

  export function extractCompetitorSync(
    responses: Array<{ platform: string; response: string }>,
    businessName?: string,
    extraBlacklist?: string[]
  ): string | null {
    const all = extractAllCompetitorsSync(responses, businessName);
    return all.length > 0 ? all[0].name : null;
  }
  
  // ── COMPETITOR VALIDITY (shared by /api/scan and /api/rescan-weekly) ──
  // A valid competitor must be a real business name — not a city/state/generic term.
  const CITY_STATE_BLACKLIST = new Set([
    'chicago','new york','los angeles','houston','phoenix','philadelphia','san antonio',
    'san diego','dallas','san jose','austin','jacksonville','fort worth','columbus',
    'charlotte','indianapolis','san francisco','seattle','denver','nashville','oklahoma city',
    'boston','las vegas','memphis','louisville','baltimore','milwaukee','albuquerque',
    'tucson','fresno','mesa','kansas city','atlanta','omaha','colorado springs','raleigh',
    'miami','long beach','virginia beach','minneapolis','tampa','tulsa','arlington',
    'new orleans','wichita','cleveland','bakersfield','aurora','anaheim','santa ana',
    'corpus christi','riverside','st. louis','lexington','pittsburgh','stockton',
    'anchorage','cincinnati','st. paul','toledo','greensboro','newark','plano',
    'henderson','lincoln','buffalo','fort wayne','jersey city','chula vista','orlando',
    'st. petersburg','norfolk','chandler','laredo','madison','durham','lubbock',
    'winston-salem','garland','glendale','hialeah','reno','baton rouge','irvine',
    'chesapeake','scottsdale','north las vegas','fremont','gilbert','birmingham',
    'rochester','san bernardino','spokane','london','manchester','birmingham uk',
    'glasgow','liverpool','leeds','sheffield','edinburgh','bristol','sydney','melbourne',
    'brisbane','perth','adelaide','auckland','toronto','vancouver','calgary','montreal',
    'ottawa','edmonton','mumbai','delhi','bangalore','hyderabad','chennai','kolkata',
    'dubai','abu dhabi','singapore',
    'dental','dentist','clinic','doctor','lawyer','attorney','hvac','plumber','restaurant',
    'near me','nearby','local','best','top','affordable','cheap','professional',
    'services','solutions','associates','group','team','office',
  ]);

  // Expanded city list (global) — rejected as competitor names.
  const CITY_NAMES = new Set([
    'chicago','london','mumbai','dubai','new york','los angeles','houston','dallas','miami',
    'seattle','boston','denver','atlanta','phoenix','austin','toronto','sydney','melbourne',
    'singapore','bangalore','delhi','manhattan','brooklyn','queens','bronx','staten island',
    'san francisco','san diego','las vegas','portland','nashville','charlotte','columbus',
    'indianapolis','jacksonville','memphis','louisville','baltimore','milwaukee','albuquerque',
    'tucson','fresno','sacramento','mesa','kansas city','omaha','raleigh','minneapolis',
    'cleveland','wichita','arlington','new orleans','bakersfield','tampa','aurora','anaheim',
    'santa ana','corpus christi','riverside','lexington','st. louis','pittsburgh','anchorage',
    'stockton','cincinnati','st. paul','toledo','greensboro','newark','plano','henderson',
    'lincoln','buffalo','fort wayne','jersey city','chula vista','orlando','st. petersburg',
    'norfolk','chandler','laredo','madison','durham','lubbock','winston-salem','garland',
    'glendale','hialeah','reno','baton rouge','irvine','chesapeake','scottsdale',
    'north las vegas','fremont','gilbert','san bernardino','birmingham','rochester','richmond',
    'spokane','des moines','montgomery','modesto','fayetteville','tacoma','shreveport','fontana',
    'moreno valley','akron','yonkers','huntington beach','little rock','amarillo','grand rapids',
    'ontario','salt lake city','tallahassee','huntsville','worcester','knoxville','newport news',
    'brownsville','santa clarita','providence','garden grove','oceanside','fort lauderdale',
    'rancho cucamonga','santa rosa','port arthur','tempe','cape coral','sioux falls',
    'chattanooga','manchester','leeds','sheffield','bristol','glasgow','edinburgh','liverpool',
    'brisbane','perth','adelaide','auckland','wellington','christchurch','vancouver','montreal',
    'calgary','ottawa','edmonton','winnipeg','quebec','nairobi','lagos','accra','johannesburg',
    'cape town','durban','manila','cebu','davao','karachi','lahore','islamabad','dhaka',
    'colombo','kathmandu',
  ]);

  // Whole-name generic terms — rejected only when they ARE the entire name.
  const GENERIC_TERMS = new Set([
    'the best','top rated','near me','local','professional','expert','specialist','service',
    'services','company','business','clinic','center','centre','group','associates','partners',
    'solutions','nationwide','national','affordable','cheap','free','online','virtual','remote',
  ]);

  // Trailing geo tokens (US state codes + country codes/names) so "Chicago IL"
  // / "London UK" normalise to "chicago" / "london" before the city check.
  const GEO_TOKENS = new Set([
    'al','ak','az','ar','ca','co','ct','de','fl','ga','hi','id','il','in','ia','ks','ky','la',
    'me','md','ma','mi','mn','ms','mo','mt','ne','nv','nh','nj','nm','ny','nc','nd','oh','ok',
    'or','pa','ri','sc','sd','tn','tx','ut','vt','va','wa','wv','wi','wy','dc',
    'us','usa','uk','uae','au','nz','england','scotland','wales','australia','canada','india',
    'ireland','singapore',
  ]);
  function stripGeoSuffix(s: string): string {
    let out = s.trim();
    for (let i = 0; i < 2; i++) {
      const m = out.match(/^(.*?)[\s,]+([a-z.]+)$/);
      if (m && GEO_TOKENS.has(m[2].replace(/\./g, ''))) out = m[1].trim();
      else break;
    }
    return out;
  }

  export function isValidCompetitor(name: string | null | undefined): boolean {
    if (!name || name.trim().length < 3) return false;
    const lower = name.toLowerCase().trim();
    // Reject website/domain strings saved as competitors (e.g. "DenScore.com").
    if (/^https?:\/\//i.test(lower) || /\S+\.(com|io|net|org|co|ai|app|dev|shop|store)\b/i.test(lower)) return false;
    // Normalise trailing state/country tokens so "Chicago IL" is caught like "chicago".
    const geoStripped = stripGeoSuffix(lower);
    if (CITY_STATE_BLACKLIST.has(lower) || CITY_STATE_BLACKLIST.has(geoStripped)) return false;
    if (CITY_NAMES.has(lower) || CITY_NAMES.has(geoStripped)) return false;
    if (GENERIC_TERMS.has(lower)) return false;
    if (/^(dental|clinic|doctor|law|hvac|plumbing|salon|spa|medical)$/i.test(lower)) return false;
    // Single short token (e.g. a city/state abbreviation) is not a real business name.
    const words = lower.split(/\s+/);
    if (words.length === 1 && lower.length < 5) return false;
    return true;
  }

  // ── SENTIMENT ────────────────────────────────────────────────────────
  export function detectSentiment(
    responseText: string,
    businessName: string
  ): 'positive' | 'neutral' | 'negative' | null {
    if (!detectBusinessMention(responseText, businessName)) return null;
  
    const norm = normalise(responseText);
    const positiveWords = ['excellent', 'great', 'best', 'top', 'highly rated', 'recommended', 'outstanding', 'exceptional', 'wonderful', 'fantastic', 'award', 'loved', 'popular'];
    const negativeWords = ['avoid', 'poor', 'bad', 'worst', 'terrible', 'disappointing', 'complaint', 'closed', 'scam', 'unprofessional'];
  
    let posScore = 0;
    let negScore = 0;
  
    for (const word of positiveWords) {
      if (norm.includes(word)) posScore++;
    }
    for (const word of negativeWords) {
      if (norm.includes(word)) negScore++;
    }
  
    if (posScore > negScore) return 'positive';
    if (negScore > posScore) return 'negative';
    return 'neutral';
  }
  
  // ── RANK POSITION ────────────────────────────────────────────────────
  export function extractRankPosition(
    responseText: string,
    businessName: string
  ): number | null {
    if (!responseText || !detectBusinessMention(responseText, businessName)) return null;
  
    const lines = responseText.split('\n');
    const normBiz = normalise(businessName);
  
    for (let i = 0; i < lines.length; i++) {
      const line = normalise(lines[i]);
      // ax87: first-word membership, not substring ("ace" in "grace").
      if (!line.split(' ').includes(normBiz.split(' ')[0])) continue;
  
      // Check for numbered list pattern
      const numMatch = lines[i].match(/^[\s]*(\d+)[.)]/);
      if (numMatch) return parseInt(numMatch[1]);
  
      // Check surrounding context for position words
      const ctx = lines.slice(Math.max(0, i - 2), i + 2).join(' ').toLowerCase();
      if (ctx.includes('first') || ctx.includes('#1') || ctx.includes('number one')) return 1;
      if (ctx.includes('second') || ctx.includes('#2')) return 2;
      if (ctx.includes('third') || ctx.includes('#3')) return 3;
  
      return i + 1;
    }
  
    return null;
  }
  
  // ── CITATION SOURCES ─────────────────────────────────────────────────
  // ── CITATION SOURCES ─────────────────────────────────────────────────
  // A "citation" needs citation context — a listing/profile/review mention
  // or a URL — not a bare name drop. The old code counted a source if its
  // NAME appeared anywhere ('check Yelp', 'Healthgrades/Zocdoc for
  // availability'), so generic advice polluted the citation pool and
  // directory signals reported 'Listed in AI citation sources' on that
  // basis. Bare mentions are not citations.
  // ax89 residual: the business must be the SUBJECT of the citation
  // sentence. Advice like "look for reviews on Yelp" or "find a dentist on
  // Zocdoc" matched the context words and counted as a citation of THIS
  // business. Now a citation needs a sentence that (a) names the business
  // (same whole-name matcher as the trust attribution), (b) is not
  // second-person / imperative advice, and (c) has citation context
  // (listed/profile/reviews/…) or a URL for the source. No business name
  // -> nothing is attributable -> no citations.
  const ADVICE_START = /^(?:[-*\d.)\s]*)(?:look|find|check|search|visit|try|consider|browse|use|read|see|ask|compare|book|go|head|start|you)\b/i;
  const SECOND_PERSON = /\b(?:you can|you could|you may|you might|you should|you'll|we recommend|i recommend|i suggest|we suggest)\b/i;
  export function extractCitationSources(responseText: string, businessName?: string, city?: string): string[] {
    if (!responseText || !businessName) return [];
    const name = stripLocationSuffix(businessName, city);

    const sources = [
      'Yelp', 'Google', 'Healthgrades', 'Zocdoc', 'Reddit',
      'Avvo', 'Martindale', 'WebMD', 'Vitals', 'RateMDs',
      'TripAdvisor', 'OpenTable', 'Trustpilot', 'BBB',
      'Amazon', 'Facebook', 'Instagram', 'LinkedIn',
      'Angi', 'HomeAdvisor', 'Houzz', 'Thumbtack',
    ];

    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const ctx = (s: string) =>
      new RegExp(
        `\\b${esc(s)}\\b[^.]{0,60}\\b(listed|listing|profile|reviews?|directory|ranked|featured|accredit\\w*|book\\w*|reserv\\w*)\\b` +
        `|\\b(listed|listing|available|profile|reviews?|directory|ranked|featured|accredit\\w*|book\\w*|reserv\\w*)\\b[^.]{0,60}\\b${esc(s)}\\b` +
        `|\\b${esc(s)}\\.(com|org|net|co\\.uk|com\\.au)/`,
        'i',
      );

    const sentences = splitSentences(responseText).filter(sentence =>
      mentionsBusinessName(sentence, name) && !ADVICE_START.test(sentence) && !SECOND_PERSON.test(sentence),
    );
    if (sentences.length === 0) return [];
    const found: string[] = [];
    for (const source of sources) {
      const re = ctx(source);
      if (sentences.some(sentence => re.test(sentence))) found.push(source);
    }
    return found;
  }
  
  // ── ANALYSE ALL PLATFORMS ────────────────────────────────────────────
  export async function analyseAllPlatforms(params: {
    businessName: string;
    city?: string;
    results: Array<{ platform: string; weight: number; response: string | null; perQueryResponses?: string[] }>;
    extraBlacklist?: string[];
    queries?: string[];
    category?: string;
  }): Promise<PlatformAnalysis[]> {
    const { businessName, city, results, extraBlacklist, queries, category } = params;

    const responsesForCompetitor = results
      .filter(r => r.response)
      .map(r => ({ platform: r.platform, response: r.response! }));

    const competitorResult = await extractCompetitor(responsesForCompetitor, businessName, extraBlacklist, { queries, city, category });
    const globalCompetitor = competitorResult?.name ?? null;
    const competitorVariants = competitorResult?.variants ?? [];

    const matchesCompetitor = (text: string): boolean => {
      for (const v of competitorVariants) {
        if (detectBusinessMention(text, v)) return true;
      }
      return globalCompetitor ? detectBusinessMention(text, globalCompetitor) : false;
    };

    return results.map(r => {
      let mentionRate = 0;
      const pqr = r.perQueryResponses;
      if (pqr && pqr.length > 0) {
        const hits = pqr.filter(resp => detectBusinessMention(resp, businessName, city)).length;
        mentionRate = hits / pqr.length;
      } else if (r.response) {
        mentionRate = detectBusinessMention(r.response, businessName, city) ? 1 : 0;
      }

      return {
        platform: r.platform,
        weight: r.weight,
        mentioned: mentionRate > 0,
        mentionRate,
        competitor_mentioned: r.response && globalCompetitor ? matchesCompetitor(r.response) : false,
        competitorMentionRate: (() => {
          if (!globalCompetitor) return 0;
          const cpqr = r.perQueryResponses;
          if (cpqr && cpqr.length > 0) {
            const hits = cpqr.filter(resp => matchesCompetitor(resp)).length;
            return hits / cpqr.length;
          }
          return r.response && matchesCompetitor(r.response) ? 1 : 0;
        })(),
        sentiment: r.response ? detectSentiment(r.response, businessName) : null,
        rankPosition: r.response ? extractRankPosition(r.response, businessName) : null,
        citationSources: r.response ? extractCitationSources(r.response, businessName, city) : [],
        competitor: globalCompetitor,
      };
    });
  }