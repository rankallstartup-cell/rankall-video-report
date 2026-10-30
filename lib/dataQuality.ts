// lib/dataQuality.ts
// Phase 20 — Data Quality Layer (moat protection). PURE TypeScript: zero API
// calls, zero DB calls, zero new dependencies. Every validator fails safe and
// never throws — callers rely on that.

export type DataQualityStatus = 'clean' | 'needs_review' | 'quarantined' | 'blocked';

export interface DataQualityIssue {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  field?: string;
  currentValue?: unknown;
}

export interface DataQualityResult {
  status: DataQualityStatus;
  qualityScore: number;
  issues: DataQualityIssue[];
  shouldEnterIntelligenceGraph: boolean;
}

// ── helpers ─────────────────────────────────────────────────────────────────
function norm(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

const ENTITY_SUFFIXES = /,?\s*\b(llp|llc|l\.?l\.?c\.?|p\.?c\.?|inc\.?|ltd\.?|co\.?|corp\.?|& associates|associates|partners|group)\s*$/i;
const FILLER_WORDS = new Set(['of', 'the', 'and', 'a', 'an', 'in', 'at', 'by', 'for']);

const KNOWN_CITIES = new Set([
  'chicago','york','angeles','houston','dallas','austin','london','sydney','toronto','boston',
  'denver','seattle','miami','atlanta','phoenix','melbourne','manchester','vancouver','mumbai','dubai',
  'portland','detroit','charlotte','nashville','orlando','tampa','minneapolis','pittsburgh','columbus',
  'indianapolis','sacramento','brooklyn','queens','bronx','manhattan','philadelphia','baltimore',
  'milwaukee','memphis','louisville','richmond','raleigh','jacksonville','tucson','fresno','mesa',
  'omaha','oakland','tulsa','honolulu','anchorage','albuquerque','birmingham','edinburgh','glasgow',
  'dublin','belfast','cardiff','bristol','liverpool','leeds','sheffield','nottingham','leicester',
]);

export function normalizeBusinessName(name: string, city?: string): string {
  let s = (name || '').replace(ENTITY_SUFFIXES, '').trim();
  if (city) {
    const re = new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
    s = s.replace(re, '').trim();
  } else {
    const words = s.split(/\s+/);
    if (words.length >= 2 && KNOWN_CITIES.has(words[words.length - 1].toLowerCase())) {
      s = words.slice(0, -1).join(' ');
    }
  }
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

export function businessNamesMatch(a: string, b: string, city?: string): boolean {
  const na = normalizeBusinessName(a, city);
  const nb = normalizeBusinessName(b, city);
  if (!na || !nb) return false;
  // ax87: NO raw substring containment — "grace dental" contains
  // "ace dental" as a substring, so includes() matched a competitor
  // as the business. Containment must be a contiguous WHOLE-WORD
  // sequence ("Ace Dental" in "Ace Dental LLC", never "Ace Dental"
  // in "Grace Dental").
  const wordsA = na.split(' ');
  const wordsB = nb.split(' ');
  const [short, long] = wordsA.length <= wordsB.length ? [wordsA, wordsB] : [wordsB, wordsA];
  for (let i = 0; i <= long.length - short.length; i++) {
    if (short.every((w, j) => long[i + j] === w)) return true;
  }
  const tokA = na.split(' ').filter(w => !FILLER_WORDS.has(w));
  const tokB = nb.split(' ').filter(w => !FILLER_WORDS.has(w));
  const [smaller, larger] = tokA.length <= tokB.length ? [tokA, tokB] : [tokB, tokA];
  if (smaller.length < 2) return false;
  const largerStr = ' ' + larger.join(' ') + ' ';
  return smaller.every(t => largerStr.includes(' ' + t + ' '));
}

// A block issue → status 'blocked' (score 0). A needs_review issue → 'needs_review'
// (score 70). No issues → 'clean' (100). shouldEnter is true only when clean.
function result(issues: DataQualityIssue[]): DataQualityResult {
  const hasBlock = issues.some(i => i.severity === 'critical' || i.severity === 'high');
  const status: DataQualityStatus = hasBlock ? 'blocked' : issues.length > 0 ? 'needs_review' : 'clean';
  const qualityScore = hasBlock ? 0 : issues.length > 0 ? 70 : 100;
  return { status, qualityScore, issues, shouldEnterIntelligenceGraph: status === 'clean' };
}

// Directories / platforms that must never be saved as a competitor.
const COMPETITOR_DIRECTORIES = [
  'yelp', 'google', 'healthgrades', 'zocdoc', 'nhs', 'trustpilot', 'practo',
  'justdial', 'opentable', 'tripadvisor', 'facebook', 'bbb', 'bing', 'yahoo',
  'angi', 'houzz', 'zillow', 'avvo', 'martindale', 'webmd', 'vitals', 'ratemds',
];

const COMPETITOR_GENERICS = [
  'dentists', 'restaurants', 'lawyers', 'near me', 'local', 'best', 'top',
];

const NAME_GENERICS = [
  'test', 'demo', 'example', 'asdf', 'qwerty', 'unknown', 'business', 'company', 'placeholder',
];

// Category words used to detect "category + city" non-names.
const CATEGORY_WORDS = new Set([
  'dentist', 'dentists', 'dental', 'restaurant', 'restaurants', 'lawyer', 'lawyers',
  'attorney', 'attorneys', 'doctor', 'doctors', 'plumber', 'plumbers', 'hvac',
  'electrician', 'electricians', 'salon', 'spa', 'gym', 'clinic', 'cafe', 'bar',
]);

// ── 1. Competitor ─────────────────────────────────────────────────────────
export function validateCompetitor(competitorName: string, businessName: string, city: string): DataQualityResult {
  const issues: DataQualityIssue[] = [];
  const name = (competitorName || '').trim();
  const nName = norm(name);

  if (!name || name.length < 3) {
    issues.push({ type: 'competitor_too_short', severity: 'high', message: 'Competitor name is empty or too short', field: 'competitor_name', currentValue: competitorName });
    return result(issues);
  }
  const nBiz = norm(businessName);
  if (nName && nBiz && (nName === nBiz || nName.includes(nBiz) || nBiz.includes(nName))) {
    issues.push({ type: 'competitor_is_self', severity: 'critical', message: 'Competitor matches the business itself', field: 'competitor_name', currentValue: competitorName });
  }
  if (COMPETITOR_DIRECTORIES.some(d => nName === d || nName.includes(d))) {
    issues.push({ type: 'competitor_is_directory', severity: 'critical', message: `Competitor is a directory/platform (${name})`, field: 'competitor_name', currentValue: competitorName });
  }
  if (COMPETITOR_GENERICS.some(g => nName === norm(g)) || (city && nName === norm(city))) {
    issues.push({ type: 'competitor_is_generic', severity: 'high', message: `Competitor is a city name or generic term (${name})`, field: 'competitor_name', currentValue: competitorName });
  }
  // needs_review: a single word (no spaces) is unusual for a real business name.
  if (issues.length === 0 && !name.includes(' ')) {
    issues.push({ type: 'competitor_single_word', severity: 'low', message: 'Competitor is a single word — unusual for a business name', field: 'competitor_name', currentValue: competitorName });
  }
  return result(issues);
}

// UI-artifact competitor strings that must never be presented as a real
// named competitor (b8b5: the scan row for rankall.io stored
// "If you meant a different service" as competitor_name, and the PDF
// presented it as the capturing competitor). A placeholder is not a
// business — callers treat it as "no competitor".
const COMPETITOR_PLACEHOLDERS = [
  'if you meant',
  'did you mean',
  'different service',
  'select a competitor',
  'choose a competitor',
  'enter a competitor',
  'type a competitor',
  'competitor not listed',
  'no competitor',
];

export function isPlaceholderCompetitor(competitorName: string | null | undefined): boolean {
  const n = (competitorName || '').trim().toLowerCase();
  if (!n) return false;
  return COMPETITOR_PLACEHOLDERS.some((p) => n.includes(p));
}

// ── 2. Score ──────────────────────────────────────────────────────────────
export function validateScore(score: number, recommendationShare?: number): DataQualityResult {
  const issues: DataQualityIssue[] = [];

  if (score === null || score === undefined || typeof score !== 'number' || Number.isNaN(score)) {
    issues.push({ type: 'score_not_a_number', severity: 'critical', message: 'Score is not a valid number', field: 'overall_score', currentValue: score });
    return result(issues);
  }
  if (score < 0 || score > 100) {
    issues.push({ type: 'score_out_of_range', severity: 'critical', message: `Score ${score} is out of the 0–100 range`, field: 'overall_score', currentValue: score });
  }
  if (recommendationShare !== undefined && recommendationShare !== null && (recommendationShare < 0 || recommendationShare > 100)) {
    issues.push({ type: 'share_out_of_range', severity: 'critical', message: `Recommendation share ${recommendationShare} is out of the 0–100 range`, field: 'recommendation_share', currentValue: recommendationShare });
  }
  if (issues.length === 0 && score === 0) {
    issues.push({ type: 'score_zero', severity: 'low', message: 'Score is 0 — may be real but unusual', field: 'overall_score', currentValue: score });
  }
  if (issues.length === 0 && score === 100) {
    issues.push({ type: 'score_perfect', severity: 'low', message: 'Score is 100 — too perfect, verify', field: 'overall_score', currentValue: score });
  }
  return result(issues);
}

// ── 3. Business name ────────────────────────────────────────────────────────
export function validateBusinessName(name: string): DataQualityResult {
  const issues: DataQualityIssue[] = [];
  const raw = (name || '').trim();

  if (!raw || raw.length < 3) {
    issues.push({ type: 'name_too_short', severity: 'high', message: 'Business name is empty or too short', field: 'business_name', currentValue: name });
    return result(issues);
  }
  const lower = raw.toLowerCase();
  if (NAME_GENERICS.some(g => lower === g)) {
    issues.push({ type: 'name_generic', severity: 'high', message: `Business name is a generic placeholder (${raw})`, field: 'business_name', currentValue: name });
  }
  // "category + city" with no actual business name, e.g. "dentist chicago".
  const words = norm(raw).split(' ').filter(Boolean);
  if (issues.length === 0 && words.length >= 2 && words.length <= 3 && CATEGORY_WORDS.has(words[0]) && !/^(the|dr|st)$/.test(words[0])) {
    issues.push({ type: 'name_category_plus_city', severity: 'high', message: `Business name looks like a category + city, not an actual business (${raw})`, field: 'business_name', currentValue: name });
  }
  // needs_review: obvious placeholder tokens.
  if (issues.length === 0 && (/YOUR_|REPLACE_/i.test(raw) || raw.includes('[business]'))) {
    issues.push({ type: 'name_placeholder', severity: 'low', message: 'Business name contains placeholder text', field: 'business_name', currentValue: name });
  }
  return result(issues);
}

// ── 4. Platform response ────────────────────────────────────────────────────
const API_ERROR_PATTERNS = [
  'rate limit', 'unauthorized', 'invalid api key', 'invalid_api_key',
  'internal server error', 'model overloaded', 'failed to fetch',
  '403 forbidden', '401',
];

export function validatePlatformResponse(platform: string, response: string | null, status: string): DataQualityResult {
  const issues: DataQualityIssue[] = [];
  const text = response ?? '';

  if (status === 'success' && (!response || text.trim().length === 0)) {
    issues.push({ type: 'success_but_empty', severity: 'critical', message: `${platform}: marked success but response is empty`, field: 'response', currentValue: null });
    return result(issues);
  }
  const lower = text.toLowerCase();
  if (API_ERROR_PATTERNS.some(p => lower.includes(p))) {
    issues.push({ type: 'response_is_api_error', severity: 'critical', message: `${platform}: response contains an API error pattern`, field: 'response', currentValue: text.slice(0, 120) });
    return result(issues);
  }
  if (text.length > 0 && text.length < 50) {
    issues.push({ type: 'response_too_short', severity: 'low', message: `${platform}: response is suspiciously short (${text.length} chars)`, field: 'response' });
  }
  if (text.length > 50000) {
    issues.push({ type: 'response_too_long', severity: 'low', message: `${platform}: response is suspiciously long (${text.length} chars)`, field: 'response' });
  }
  return result(issues);
}

// ── 5. Revenue estimate (Phase 20B) ─────────────────────────────────────────
export function validateRevenue(revenueGap: number): DataQualityResult {
  const issues: DataQualityIssue[] = [];
  if (revenueGap === null || revenueGap === undefined || typeof revenueGap !== 'number' || Number.isNaN(revenueGap)) {
    issues.push({ type: 'revenue_not_a_number', severity: 'critical', message: 'Revenue gap is not a valid number', field: 'revenue_gap', currentValue: revenueGap });
    return result(issues);
  }
  if (revenueGap < 0) {
    issues.push({ type: 'revenue_negative', severity: 'critical', message: `Revenue gap ${revenueGap} is negative`, field: 'revenue_gap', currentValue: revenueGap });
  }
  // A single local business losing >$1M/month to AI invisibility is not credible.
  if (revenueGap > 1_000_000) {
    issues.push({ type: 'revenue_implausible', severity: 'high', message: `Revenue gap ${revenueGap}/mo is implausibly high for a local business`, field: 'revenue_gap', currentValue: revenueGap });
  }
  return result(issues);
}

// ── 6. Verified outcome (Phase 20B) ─────────────────────────────────────────
// Catches physically-impossible jumps like 0 → 100 in a single day.
export function validateVerifiedOutcome(scoreBefore: number, scoreAfter: number, daysBetween: number): DataQualityResult {
  const issues: DataQualityIssue[] = [];
  const before = validateScore(scoreBefore);
  const after = validateScore(scoreAfter);
  if (before.status === 'blocked') issues.push(...before.issues);
  if (after.status === 'blocked') issues.push(...after.issues);

  const improvement = (Number(scoreAfter) || 0) - (Number(scoreBefore) || 0);
  if (issues.length === 0 && (scoreBefore ?? 0) <= 5 && (scoreAfter ?? 0) >= 90 && (daysBetween ?? 0) <= 1) {
    issues.push({ type: 'outcome_impossible_jump', severity: 'high', message: `Verified outcome jumped ${scoreBefore}→${scoreAfter} in ${daysBetween} day(s) — physically implausible`, field: 'score_improvement', currentValue: improvement });
  }
  return result(issues);
}

// ── 7. Consistency checks (Phase 20B) ───────────────────────────────────────
// Duplicate: two normalized names that are identical.
export function validateDuplicate(nameA: string, nameB: string): DataQualityResult {
  const issues: DataQualityIssue[] = [];
  const a = norm(nameA), b = norm(nameB);
  if (a && b && a === b) {
    issues.push({ type: 'duplicate_entity', severity: 'high', message: `Duplicate detected: "${nameA}" matches "${nameB}"`, field: 'business_name', currentValue: nameA });
  }
  return result(issues);
}

// Country mismatch: the scan's country differs from the expected/derived country.
export function validateCountryConsistency(scanCountry: string, expectedCountry: string): DataQualityResult {
  const issues: DataQualityIssue[] = [];
  const a = norm(scanCountry), b = norm(expectedCountry);
  if (a && b && a !== b) {
    issues.push({ type: 'country_mismatch', severity: 'high', message: `Country mismatch: scan says "${scanCountry}" but expected "${expectedCountry}"`, field: 'country_code', currentValue: scanCountry });
  }
  return result(issues);
}

// Industry mismatch: softer — flag for review, not block.
export function validateIndustryConsistency(detected: string, expected: string): DataQualityResult {
  const issues: DataQualityIssue[] = [];
  const a = norm(detected), b = norm(expected);
  if (a && b && a !== b) {
    issues.push({ type: 'industry_mismatch', severity: 'low', message: `Industry mismatch: detected "${detected}" but expected "${expected}"`, field: 'industry', currentValue: detected });
  }
  return result(issues);
}
