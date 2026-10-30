// ── Public stats + pricing: the SINGLE source of truth (azxh) ─────────────
// Before azxh, every public number lived in its own copy: the homepage said
// 35 trust signals while llms.txt said 32; the homepage said 8 markets while
// the country config has 14; schema offers hardcoded 15/1200/8. Each copy
// drifted independently. Now the homepage, the schema offers, and the
// llms.txt / llms-full.txt routes all read from this module.
//
// Counts are DERIVED from the canonical data modules where a runtime count
// exists (trust-signal catalog, country configs, industry/city lists), so
// they cannot drift when the underlying data changes. The two literals
// (platforms, fix types) are counts of things whose canonical lists are a
// UI array (homepage PLATFORMS) and a TS union (FixType) — neither is
// countable at runtime — so they are literals with a pointer to the source.

import { TRUST_SIGNALS } from './trustSignals';
import { INDUSTRIES, CITIES } from './programmaticData';
import { COUNTRY_CONFIGS } from './countryConfig';

// 12 AI platforms the product actually scans (homepage PLATFORMS array).
// Meta AI is the 12th, live via the Meta Model API (hackathon).
export const PLATFORMS_SCANNED = 12;

// b8bg: how much each platform counts toward a Rankall score, in
// percent. These are SCORING WEIGHTS, not market shares — /vs used to
// print them as "share" with wrong numbers (Perplexity 11% instead of
// 9%, Grok 8% instead of 7%, Claude 7% instead of 6%) and omitted
// Google AI + Copilot entirely. Literal with a pointer, like
// PLATFORMS_SCANNED: the source of truth is lib/platforms.ts
// PLATFORMS weights (Meta AI included at 5% — the 12th platform,
// live via the Meta Model API; the integer percents below are the
// largest-remainder allocation of the renormalized lib/platforms.ts
// weights (Oct 26, Nandish-approved), so the column sums to 100%), and
// the public-stats consistency test enforces the match, so the two
// can never drift apart again.
export const PLATFORM_SCORING_WEIGHTS: Array<{ name: string; weightPct: number }> = [
  { name: 'ChatGPT', weightPct: 24 },
  { name: 'Gemini', weightPct: 17 },
  { name: 'Google AI', weightPct: 14 },
  { name: 'Copilot', weightPct: 9 },
  { name: 'Perplexity', weightPct: 8 },
  { name: 'Grok', weightPct: 7 },
  { name: 'Claude', weightPct: 6 },
  { name: 'DeepSeek', weightPct: 4 },
  { name: 'Mistral', weightPct: 3 },
  { name: 'Kimi', weightPct: 2 },
  { name: 'Groq', weightPct: 1 },
  { name: 'Meta AI', weightPct: 5 },
];

// Canonical trust-signal catalog size (lib/trustSignals.ts TRUST_SIGNALS).
export const TRUST_SIGNAL_COUNT = Object.keys(TRUST_SIGNALS).length; // 35

// ax75/azxh: the PUBLIC trust-signal claim. A given scan is only evaluated
// on the signals applicable to its country + industry (TRUST_SIGNALS
// countriesApplicable / industriesApplicable — no NHS check for a US
// dentist, no Healthgrades for a UK one), so the per-scan count varies and
// is always below the catalog size. Public copy therefore says "30+"
// (catalog size floored to the ten), never a precise number that a
// specific scan would contradict. Copy that used 32 / 35 / 54 / 60+ now
// reads this.
export const TRUST_SIGNALS_LABEL = `${Math.floor(TRUST_SIGNAL_COUNT / 10) * 10}+`; // "30+"

// ax75/azxh: public scan-duration claim. /api/scan has maxDuration 60 with
// a 45s master timeout on the platform fan-out, and the homepage runs
// enrich-business + detect-query before it — so "60 seconds" was a best
// case, not a promise. "about 90 seconds" covers the whole flow (and
// matches the homepage schema's "under 90 seconds"). Use this everywhere
// a timing claim is made.
export const SCAN_TIME_LABEL = 'about 90 seconds';

// Countries with a pricing/market config (lib/countryConfig.ts).
export const MARKETS_COVERED = Object.keys(COUNTRY_CONFIGS).length; // 14

// Programmatic coverage (lib/programmaticData.tsx).
export const INDUSTRIES_TRACKED = Object.keys(INDUSTRIES).length; // 75
export const CITIES_TRACKED = Object.keys(CITIES).length; // 293

// Fix-type count = FixType union members in lib/fixTypes.ts (not countable
// at runtime — update this literal if the union changes).
export const FIX_TYPE_COUNT = 13;

// ── Founder-set USD pricing (Oct 2026) ─────────────────────────────────────
// The 8 tiers Nandish set. The per-country display on the homepage/pricing
// page comes from countryConfig (localized pricing); for US visitors those
// values equal these. Do NOT invent tiers or prices anywhere else —
// homepage schema offers, llms.txt, and the chatbot prompt all read here.
export type PublicTier = { name: string; monthly: number; blurb: string };

export const FOUNDER_PRICING_USD: PublicTier[] = [
  { name: 'Local Pro', monthly: 39, blurb: 'for a single local business' },
  { name: 'Personal Brand Pro', monthly: 15, blurb: 'for an individual personal brand' },
  { name: 'Product Pro', monthly: 45, blurb: 'for an e-commerce / SaaS product' },
  { name: 'Agency', monthly: 259, blurb: 'multi-client tools and white-label client reporting' },
  { name: 'Enterprise', monthly: 499, blurb: 'chains and multi-location brands' },
  { name: 'Government', monthly: 1200, blurb: 'public-sector organizations' },
  { name: 'SEO', monthly: 39, blurb: 'AI-visibility SEO tooling' },
  { name: 'Global Brand Intelligence', monthly: 999, blurb: 'global brand monitoring' },
];

/** USD monthly price for a founder tier — throws on an unknown name so a
 *  typo can never silently publish a wrong price. */
export function tierPrice(name: string): number {
  const t = FOUNDER_PRICING_USD.find((x) => x.name === name);
  if (!t) throw new Error(`unknown public tier: ${name}`);
  return t.monthly;
}

// The three self-serve plans quoted on pricing / signup / meta copy.
export const PRICE_LOCAL_USD = tierPrice('Local Pro'); // 39
export const PRICE_PERSONAL_USD = tierPrice('Personal Brand Pro'); // 15
export const PRICE_AGENCY_USD = tierPrice('Agency'); // 259

// Schema.org AggregateOffer values, derived from the tier list.
export const PRICE_RANGE_USD = {
  lowPrice: String(Math.min(...FOUNDER_PRICING_USD.map((t) => t.monthly))),
  highPrice: String(Math.max(...FOUNDER_PRICING_USD.map((t) => t.monthly))),
  offerCount: String(FOUNDER_PRICING_USD.length),
  priceCurrency: 'USD',
};
