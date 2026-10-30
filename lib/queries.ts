// lib/queries.ts
// Built by Codex — PR #1 merged
// Query generation for AI platform scanning

import { inferCountryFromText } from './countryConfig';
import { matchCategoryGlobal } from './categories';

export type ScanIntent = 'local' | 'product' | 'brand' | 'professional' | 'personal_pro' | 'url' | 'general';

export interface ScanQuery {
  intent: ScanIntent;
  primary: string;
  variants: string[];
  industry?: string;
  location?: string;
}

const PERSONAL_TITLES = /\b(dr\.?|mr\.?|mrs\.?|ms\.?|prof\.?|esq\.?|coach|rev\.?|attorney|therapist|counselor|sheikh|sir|dame|datuk|shri|smt)\b/i;
// `&` sits outside the \b group: \b never matches around a bare '&', so the
// old in-group `&` was dead ("Power Rogers & Smith" slipped through).
const BUSINESS_INDICATORS = /&|\b(llc|llp|inc|p\.?c\.?|co\.|restaurant|dental|hvac|plumbing|salon|clinic|group|associates|services|solutions|law|legal|attorney|attorneys|firm|offices?|practice|lawyers|counsel|partners)\b/i;

// Queries that start with these words are ALWAYS local business searches, never personal
const LOCAL_SEARCH_PREFIXES = /^(best|top|find|good|cheap|affordable|local|nearest|near me|recommended|great|cheapest|budget|discount)\b/i;
// Queries containing these patterns are local business searches
const LOCAL_SEARCH_PATTERNS = /\b(best|top)\s+\w+\s+in\b|\bnear me\b|\bin\s+[A-Z][a-z]+(,|\s)/;

export type PersonalProRule = 'title_prefix' | 'two_caps' | 'business_indicator' | 'surname_stack' | 'surname_pair' | 'local_keyword' | 'none';

// Ticket 7: "Power Rogers Chicago" is a law FIRM (Power Rogers LLP), not a
// person — two capitalised words where the FIRST is a surname that is not
// used as a given name is the classic "Surname Surname" firm pattern
// (Power Rogers, Kirkland Ellis, Jones Day). Surnames that are also common
// given names (Thomas, Taylor, Lee, Martin, Morgan, Kelly…) are deliberately
// absent so "Taylor Swift" / "Morgan Freeman" still read as people. Anything
// classified as a person still goes through the mandatory identity-confirm
// step server-side, so a miss here can never silently score a firm.
const FIRM_LEADING_SURNAMES = new Set([
  'power', 'rogers', 'smith', 'johnson', 'williams', 'brown', 'jones', 'garcia', 'miller', 'davis',
  'rodriguez', 'martinez', 'hernandez', 'lopez', 'gonzalez', 'moore', 'perez', 'thompson',
  'white', 'sanchez', 'ramirez', 'robinson', 'walker', 'wright', 'torres', 'nguyen', 'hill',
  'flores', 'rivera', 'roberts', 'phillips', 'edwards', 'stewart', 'morris', 'cook', 'peterson',
  'richardson', 'watson', 'hughes', 'sanders', 'myers', 'kirkland', 'latham', 'skadden', 'sidley',
  'cravath', 'weil', 'cromwell', 'wachtell', 'simpson', 'dechert', 'ropes', 'goodwin', 'hogan',
  'corboy', 'clifford', 'salvi', 'motley', 'ketchum', 'cozen', 'akin', 'greenberg', 'jenner',
  'katten', 'freeborn', 'schiff', 'quarles',
]);

// ── Specialty vs location after a person's name ───────────────────────────
// "John Smith Chicago" used to yield specialty "Chicago" AND location
// "Chicago": with one trailing word, that word was used for both. Trailing
// tokens that are a known city / state / country (lib/countryConfig
// inferCountryFromText) are the LOCATION, never the specialty — including
// multi-word places ("New York", "San Francisco") and "City ST" /
// "City, State" pairs. Only the words before the location are specialty.
function isPlace(phrase: string): boolean {
  const p = phrase.replace(/,/g, ' ').trim();
  return !!p && inferCountryFromText(p, p) !== null;
}

export function splitSpecialtyLocation(words: string[]): { specialty: string; location: string } {
  const ws = words.map((w) => w.replace(/,+$/, '')).filter(Boolean);
  const n = ws.length;
  if (n === 0) return { specialty: '', location: '' };
  // Longest trailing place (up to 3 words). A suffix counts when its first
  // word is itself a place ("Chicago" in "Chicago IL"), or when the suffix
  // is a place only WITH that word ("New" + "York") — never because a later
  // word already is one ("dentist Chicago" matches only via "Chicago").
  let locLen = 0;
  for (let k = 1; k <= Math.min(3, n); k++) {
    const first = ws[n - k];
    const rest = ws.slice(n - k + 1).join(' ');
    const suffix = ws.slice(n - k).join(' ');
    const ok = isPlace(first) || (!matchCategoryGlobal(first) && isPlace(suffix) && !(rest && isPlace(rest)));
    if (ok) locLen = k;
    else if (locLen > 0) break;
  }
  if (locLen > 0) {
    return { specialty: ws.slice(0, n - locLen).join(' '), location: ws.slice(n - locLen).join(' ') };
  }
  // No recognised place. One word: a known profession is the specialty,
  // anything else is treated as an (unlisted) place. Several words: the
  // last is the location, the rest the specialty (previous behaviour).
  if (ws.length === 1) {
    return matchCategoryGlobal(ws[0]) || /^[a-z]/.test(ws[0])
      ? { specialty: ws[0], location: '' }
      : { specialty: '', location: ws[0] };
  }
  return { specialty: ws.slice(0, -1).join(' '), location: ws[ws.length - 1] };
}

export function detectPersonalProIntent(input: string): { isPersonal: boolean; name: string; specialty: string; location: string; rule: PersonalProRule } {
  const q = input.trim();

  // RULE 1: If query starts with a local search keyword, it's NEVER personal
  if (LOCAL_SEARCH_PREFIXES.test(q) || LOCAL_SEARCH_PATTERNS.test(q)) {
    return { isPersonal: false, name: '', specialty: '', location: '', rule: 'local_keyword' };
  }

  // RULE 2: Title prefix → personal (Dr., Prof., etc.)
  if (PERSONAL_TITLES.test(q)) {
    const parts = q.split(/\s+/);
    const name = parts.slice(0, 3).join(' ');
    const rest = parts.slice(3);
    const { specialty, location } = splitSpecialtyLocation(rest);
    return { isPersonal: true, name, specialty, location, rule: 'title_prefix' };
  }

  // RULE 2.5: Business indicators → never personal
  if (BUSINESS_INDICATORS.test(q)) {
    return { isPersonal: false, name: '', specialty: '', location: '', rule: 'business_indicator' };
  }

  // RULE 3: Two capitalised words at the START (not preceded by local keywords)
  // Must be "Firstname Lastname [optional specialty/city]" pattern — no local keywords mixed in
  const capitalWords = q.match(/\b[A-Z][a-z]+\b/g) || [];
  if (capitalWords.length >= 2) {
    // 3+ consecutive capitalized words at the start = surname stack (law firm,
    // accounting firm). The last capitalized word is likely a city, so strip it
    // before counting. "Salvi Schostok Pritchard Chicago" → 4 caps, last is
    // city → 3 surnames → business. "John Smith Chicago" → 3 caps, last is
    // city → 2 names → person.
    const allWords = q.split(/\s+/);
    let leadingCapCount = 0;
    for (const w of allWords) {
      if (/^[A-Z][a-z]+$/.test(w)) leadingCapCount++;
      else break;
    }
    // 3+ surname stack → business. But "Firstname Lastname City" is 3 caps
    // and is a person. For exactly 3 all-caps words, only subtract the last
    // word if it's a plausible city (matches inferCountryFromText). For 4+
    // all-caps, always subtract 1 for the trailing city.
    const allCaps = leadingCapCount === allWords.length;
    let surnameCount = leadingCapCount;
    if (allCaps && leadingCapCount >= 4) {
      surnameCount = leadingCapCount - 1;
    } else if (allCaps && leadingCapCount === 3) {
      const lastWord = allWords[allWords.length - 1];
      const looksLikeCity = inferCountryFromText(lastWord, lastWord) !== null;
      surnameCount = looksLikeCity ? 2 : 3;
    }
    if (surnameCount >= 3) {
      return { isPersonal: false, name: '', specialty: '', location: '', rule: 'surname_stack' };
    }

    const nameMatch = q.match(/^([A-Z][a-z]+ [A-Z][a-z]+)/);
    if (nameMatch) {
      // Reject if the "name" is actually a local keyword + city (e.g. "Best Chicago")
      const firstWord = nameMatch[1].split(' ')[0].toLowerCase();
      const LOCAL_WORDS = new Set(['best', 'top', 'find', 'good', 'cheap', 'affordable', 'local', 'great', 'new', 'old', 'north', 'south', 'east', 'west']);
      if (LOCAL_WORDS.has(firstWord)) {
        return { isPersonal: false, name: '', specialty: '', location: '', rule: 'local_keyword' };
      }
      // "Surname Surname [City]" with a non-given-name lead → firm.
      if (FIRM_LEADING_SURNAMES.has(firstWord)) {
        return { isPersonal: false, name: '', specialty: '', location: '', rule: 'surname_pair' };
      }
      const name = nameMatch[1];
      const rest = q.slice(name.length).trim();
      const words = rest.split(/\s+/).filter(Boolean);
      const { specialty, location } = splitSpecialtyLocation(words);
      return { isPersonal: true, name, specialty, location, rule: 'two_caps' };
    }
  }

  return { isPersonal: false, name: '', specialty: '', location: '', rule: 'none' };
}

export function detectIntent(input: string): ScanIntent {
  const q = input.toLowerCase();
  if (/\.(com|io|co|net|org|uk|au|de|fr)/.test(q)) return 'url';
  if (/best\s+.+\s+in\s+/.test(q)) return 'local';
  if (/\$|price|cheap|buy|review|vs|compare|best/.test(q)) return 'product';
  if (PERSONAL_TITLES.test(q) && !BUSINESS_INDICATORS.test(q)) return 'personal_pro';
  if (/dr\.|doctor|lawyer|attorney|consultant|advisor|ceo|founder/.test(q)) return 'professional';
  const brands = ['nike','starbucks','apple','google','amazon','tesla','adidas','mcdonald'];
  if (brands.some(b => q.includes(b))) return 'brand';
  return 'general';
}

export function buildQueries(input: string, intent: ScanIntent): ScanQuery {
  const localMatch = input.match(/best\s+(.+?)\s+in\s+(.+)/i);

  switch (intent) {
    case 'local':
      return {
        intent,
        primary: input,
        industry: localMatch?.[1] || '',
        location: localMatch?.[2] || '',
        variants: [
          input,
          `top ${localMatch?.[1] || input} in ${localMatch?.[2] || ''}`,
          `${localMatch?.[1] || input} near me`,
          `recommended ${localMatch?.[1] || input} ${localMatch?.[2] || ''}`,
        ],
      };

    case 'product':
      return {
        intent,
        primary: input,
        variants: [
          input,
          `best ${input}`,
          `${input} review`,
          `${input} recommendation`,
        ],
      };

    case 'brand':
      return {
        intent,
        primary: input,
        variants: [
          input,
          `${input} review`,
          `is ${input} good`,
          `${input} reputation`,
        ],
      };

    case 'professional':
      return {
        intent,
        primary: input,
        variants: [
          input,
          `${input} reviews`,
          `is ${input} recommended`,
        ],
      };

    case 'url':
      return {
        intent,
        primary: input,
        variants: [input],
      };

    default:
      return {
        intent,
        primary: input,
        variants: [input, `best ${input}`, `${input} recommendation`],
      };
  }
}