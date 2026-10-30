// lib/categoryQueryClassifier.ts
// SERVER-SIDE category-vs-business classifier for the trial 1-location cap.
//
// Kept out of lib/trialCaps.ts on purpose: trialCaps is imported by client
// pages (signup, pricing, usePlan) and this module pulls in the full
// 434-category vocabulary.
//
// History: the classifier used to be "starts with best/top/find/… or
// contains 'near me' ⇒ category". That let a trialing user dodge the
// 1-location cap by WORDING alone — "best Smith Dental Austin" or "Smith
// Dental near me" are specific businesses, yet both matched the prefix rule
// and were treated as category searches (no location consumed, no cap).
//
// Rule now: a scan is a CATEGORY search only when
//   1. it is phrased like a customer search (category prefix or "near me"),
//   2. its subject is made ONLY of category vocabulary (lib/categories) and
//      generic search modifiers ("emergency", "family", "24 hour"…), with at
//      least one real category word — no proper-noun / unknown token that
//      could be a business name, no corporate marker (LLC, Inc, &, 's), and
//   3. any location part ("in Austin", trailing "austin tx") is a known
//      place or an "<town> <STATE>" pair.
// Anything else counts as a business / location. This is deliberately
// conservative: an unusual-but-genuine category phrasing may use the trial's
// one location, but a specific business can never dodge it.

import { CATEGORIES } from './categories';
import { isKnownPlaceName, US_STATE_ABBREVS, US_STATE_NAMES } from './countryConfig';

const CATEGORY_SEARCH_PREFIX = /^(best|top|find|near|search|recommended|highest|cheapest|affordable|looking|good|leading|great)\b/i;
const NEAR_ME = /\bnear\s+me\b/gi;
// Corporate / possessive markers only ever appear in business names.
const BUSINESS_MARKER = /&|\b\w+['’]s\b|\b(llc|llp|pllc|inc|ltd|corp|co|pc|plc|gmbh|pty)\b\.?/i;

// Words in category labels that are themselves proper nouns / brand names —
// they must not let a business name pass as category vocabulary.
const VOCAB_EXCLUDE = new Set(['alexander', 'bowen', 'kumon', 'mathnasium', 'walker', 'live', 'smart', 'power', 'castle', 'church', 'temple', 'in', 'of', 'and', 'for', 'it', 'end', 'first', 'well', 'rock', 'bar', 'pub']);

// Adjectival / plural forms customers type that the category labels don't
// spell out (labels say "Dentist", people type "dental").
const VOCAB_EXTRA = [
  'dental', 'dentists', 'plumbing', 'roofing', 'electrical', 'veterinary', 'vets', 'chiropractic',
  'orthodontic', 'legal', 'accounting', 'accountants', 'doctors', 'attorneys', 'lawyers', 'clinics',
  'contractors', 'cleaners', 'movers', 'moving', 'landscaping', 'restaurants', 'cafes', 'gyms',
  'salons', 'barbers', 'barbershop', 'mechanics', 'hvac', 'ac', 'heating', 'cooling', 'pest',
  'realtors', 'agents', 'therapists', 'physio', 'dermatology', 'pediatric', 'cosmetic', 'pizza',
  'coffee', 'bakeries', 'florists', 'vet', 'ortho', 'implants', 'implant', 'whitening', 'braces',
  'injury', 'divorce', 'immigration', 'criminal', 'defense', 'estate', 'tax', 'repair', 'repairs',
  'service', 'services', 'company', 'companies', 'shop', 'shops', 'store', 'stores', 'office',
  'offices', 'practice', 'center', 'centre', 'centers', 'clinic', 'specialist', 'specialists',
];

// Generic search modifiers / filler. They neither name a business nor a
// category, so they are allowed but do not on their own make a category.
const MODIFIERS = new Set([
  'a', 'an', 'the', 'for', 'my', 'me', 'to', 'with', 'and', 'or', 'of', 'that', 'who', 'is', 'are',
  'best', 'top', 'rated', 'toprated', 'highly', 'most', 'highest', 'good', 'great', 'cheap',
  'cheapest', 'affordable', 'reliable', 'trusted', 'local', 'nearby', 'nearest', 'closest',
  'recommended', 'leading', 'looking', 'find', 'search', 'reviewed', 'reviews', 'review', 'open',
  'now', 'today', 'emergency', 'same', 'day', 'hour', 'hours', '24', '7', '24/7', 'kid', 'kids',
  'friendly', 'female', 'male', 'new', 'patients', 'accepting', 'family', 'experienced',
  'licensed', 'certified', 'quality', 'professional', 'small', 'large', 'budget', 'luxury',
  'walk', 'ins', 'online', 'mobile', 'residential', 'commercial', 'free', 'consultation',
  'consultations', 'weekend', 'late', 'night', 'urgent', 'quick', 'fast', 'expert', 'experts',
  'popular', 'famous', 'reputable', 'certified', 'insured', 'what', 'which', 'where',
]);

const PLACE_TRAILERS = new Set(['usa', 'us', 'uk', 'united states', 'america']);

let VOCAB: Set<string> | null = null;
function vocab(): Set<string> {
  if (VOCAB) return VOCAB;
  const v = new Set<string>();
  for (const e of Object.values(CATEGORIES)) {
    for (const w of `${e.label} ${e.queryTerm}`.toLowerCase().split(/[^a-z]+/)) {
      if (w.length >= 2 && !VOCAB_EXCLUDE.has(w)) v.add(w);
    }
  }
  for (const w of VOCAB_EXTRA) v.add(w);
  VOCAB = v;
  return v;
}

function stems(token: string): string[] {
  const out = [token];
  if (token.endsWith('ies')) out.push(token.slice(0, -3) + 'y');
  if (token.endsWith('es')) out.push(token.slice(0, -2));
  if (token.endsWith('s')) out.push(token.slice(0, -1));
  return out;
}

function isCategoryWord(token: string): boolean {
  const v = vocab();
  return stems(token).some(s => v.has(s));
}

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^\p{L}\p{N}/'’-]+/gu, ' ').replace(/-/g, ' ').trim().split(/\s+/).filter(Boolean);
}

/** A location phrase is a known place, or "<1–3 word town> <STATE>". */
export function isPlaceLike(raw: string): boolean {
  let tokens = raw.replace(/,/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  // Drop a trailing country word ("usa", "uk").
  while (tokens.length > 0 && PLACE_TRAILERS.has(tokens[tokens.length - 1].toLowerCase())) tokens = tokens.slice(0, -1);
  if (tokens.length === 0) return true;
  let hadState = false;
  const last = tokens[tokens.length - 1];
  if (US_STATE_ABBREVS.has(last.toUpperCase()) && last.length === 2) {
    hadState = true;
    tokens = tokens.slice(0, -1);
  } else {
    for (const n of [2, 1]) {
      if (tokens.length >= n && US_STATE_NAMES.has(tokens.slice(-n).join(' ').toLowerCase())) {
        hadState = true;
        tokens = tokens.slice(0, -n);
        break;
      }
    }
  }
  if (tokens.length === 0) return true;
  const rest = tokens.join(' ');
  if (isKnownPlaceName(rest)) return true;
  // Unknown town + valid state ("Elgin IL") — but never a phrase that
  // carries category words or business markers ("Smith Dental TX").
  if (hadState && tokens.length <= 3) {
    return !BUSINESS_MARKER.test(rest) && !tokens.some(t => isCategoryWord(t.toLowerCase()));
  }
  return false;
}

/** True only for a genuine customer-style category search (see header). */
export function isCategorySearchQuery(input: string | null | undefined): boolean {
  const q = typeof input === 'string' ? input.normalize('NFKC').trim() : '';
  if (!q || q.length > 200) return false;
  const hasNearMe = /\bnear\s+me\b/i.test(q);
  if (!CATEGORY_SEARCH_PREFIX.test(q) && !hasNearMe) return false;
  if (BUSINESS_MARKER.test(q)) return false;

  // Split off the location part at the first "in" / "near" / "around".
  const withoutNearMe = q.replace(NEAR_ME, ' ').replace(/[?!.]+$/g, '').trim();
  const m = /^(.*?)\s+\b(in|near|around|at)\b\s+(.*)$/i.exec(withoutNearMe);
  const subject = m ? m[1] : withoutNearMe;
  const location = m ? m[3] : '';
  if (location && !isPlaceLike(location)) return false;

  const tokens = tokenize(subject);
  let categoryHits = 0;
  let i = 0;
  for (; i < tokens.length; i++) {
    const t = tokens[i];
    if (isCategoryWord(t)) { categoryHits++; continue; }
    if (MODIFIERS.has(t)) continue;
    break;
  }
  if (categoryHits === 0) return false;
  if (i === tokens.length) return true;
  // Trailing words after the category run must be a place ("plumbers austin tx").
  return isPlaceLike(tokens.slice(i).join(' '));
}

/** True when a scan by a trialing user counts as a (business) location for
 *  the trial caps. The server classifier decides; a client / detect-query
 *  signal that the input IS a specific business (isBusinessName, a Places
 *  match) can only make the scan count — it can never exempt one. */
export function trialScanCountsAsLocation(
  input: string | null | undefined,
  signals: { resolvesToBusiness?: boolean } = {},
): boolean {
  if (signals.resolvesToBusiness === true) return true;
  return !isCategorySearchQuery(input);
}
