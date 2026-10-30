// lib/stripeProducts.ts
// Stripe price IDs + currency config. Stripe is integrated via the REST API
// (fetch) ONLY — never the `stripe` SDK.
//
// Required Vercel env vars for Stripe (set when TIN arrives):
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET
//   NEXT_PUBLIC_APP_URL

// ── Currency: display vs billing ───────────────────────────────────────────
// Some markets show a local price for clarity but are CHARGED in USD (no Stripe
// settlement currency / local card network). showsLocalPrice=false flags those.
export interface CountryCurrencyConfig {
  displayCurrency: string;
  displaySymbol: string;
  billingCurrency: string;
  billingSymbol: string;
  showsLocalPrice: boolean;
  note?: string;
}

const CURRENCY_CONFIG: Record<string, CountryCurrencyConfig> = {
  US: { displayCurrency: 'USD', displaySymbol: '$',   billingCurrency: 'USD', billingSymbol: '$',   showsLocalPrice: true },
  GB: { displayCurrency: 'GBP', displaySymbol: '£',   billingCurrency: 'GBP', billingSymbol: '£',   showsLocalPrice: true },
  AU: { displayCurrency: 'AUD', displaySymbol: 'A$',  billingCurrency: 'AUD', billingSymbol: 'A$',  showsLocalPrice: true },
  CA: { displayCurrency: 'CAD', displaySymbol: 'C$',  billingCurrency: 'CAD', billingSymbol: 'C$',  showsLocalPrice: true },
  SG: { displayCurrency: 'SGD', displaySymbol: 'S$',  billingCurrency: 'SGD', billingSymbol: 'S$',  showsLocalPrice: true },
  NZ: { displayCurrency: 'NZD', displaySymbol: 'NZ$', billingCurrency: 'NZD', billingSymbol: 'NZ$', showsLocalPrice: true },
  IE: { displayCurrency: 'EUR', displaySymbol: '€',   billingCurrency: 'EUR', billingSymbol: '€',   showsLocalPrice: true },
  IN: { displayCurrency: 'INR', displaySymbol: '₹',   billingCurrency: 'USD', billingSymbol: '$',   showsLocalPrice: false, note: 'Displayed in ₹, charged in USD' },
  AE: { displayCurrency: 'AED', displaySymbol: 'AED', billingCurrency: 'USD', billingSymbol: '$',   showsLocalPrice: false, note: 'Displayed in AED, charged in USD' },
  NG: { displayCurrency: 'NGN', displaySymbol: '₦',   billingCurrency: 'USD', billingSymbol: '$',   showsLocalPrice: false, note: 'Displayed in ₦, charged in USD' },
  KE: { displayCurrency: 'KES', displaySymbol: 'KSh', billingCurrency: 'USD', billingSymbol: '$',   showsLocalPrice: false, note: 'Displayed in KSh, charged in USD' },
  GH: { displayCurrency: 'GHS', displaySymbol: '₵',   billingCurrency: 'USD', billingSymbol: '$',   showsLocalPrice: false, note: 'Displayed in ₵, charged in USD' },
  ZA: { displayCurrency: 'ZAR', displaySymbol: 'R',   billingCurrency: 'USD', billingSymbol: '$',   showsLocalPrice: false, note: 'Displayed in R, charged in USD' },
  PH: { displayCurrency: 'PHP', displaySymbol: '₱',   billingCurrency: 'USD', billingSymbol: '$',   showsLocalPrice: false, note: 'Displayed in ₱, charged in USD' },
};

export function getCurrencyConfig(countryCode: string): CountryCurrencyConfig {
  return CURRENCY_CONFIG[countryCode] || CURRENCY_CONFIG.US;
}
export function getDisplaySymbol(countryCode: string): string {
  return getCurrencyConfig(countryCode).displaySymbol;
}
export function getBillingCurrency(countryCode: string): string {
  return getCurrencyConfig(countryCode).billingCurrency;
}

// ── Price IDs ──────────────────────────────────────────────────────────────
// PLACEHOLDER — replace each with the real Stripe price id once TIN arrives and
// products are created in the Stripe dashboard. getStripePrice returns null for
// any unreplaced placeholder, so checkout safely declines until they're set.
const PRICE_IDS: Record<string, string> = {
  starter_monthly:  'price_1TzLqMGZWEa0XL3VC4g21h4h',
  starter_annual:   'REPLACE_WITH_STRIPE_PRICE_ID',
  business_monthly: 'price_1U0mt6GZWEa0XL3VMCBKUHZX',
  business_annual:  'REPLACE_WITH_STRIPE_PRICE_ID',
  agency_monthly:   'price_1U0mtaGZWEa0XL3VuASCMvLu',
  agency_annual:    'REPLACE_WITH_STRIPE_PRICE_ID',
  personal_pro_monthly: 'price_1U0mtNGZWEa0XL3VKapQ65W0',
  personal_pro_annual:  'REPLACE_WITH_STRIPE_PRICE_ID',
};

// Read lazily (not at module load) so the value always reflects the env.
function stripeLive(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

// A price id is usable only when it is a real Stripe price id. Unreplaced
// 'REPLACE_' placeholders (all annual prices today) and blanks return null,
// so create-checkout answers with the waitlist notice instead of a Stripe
// "No such price" error.
export function isConfiguredPriceId(id: string | null | undefined): id is string {
  return typeof id === 'string' && id.startsWith('price_') && !id.startsWith('REPLACE_');
}

export function getStripePrice(
  plan: string,
  interval: 'monthly' | 'annual' = 'monthly',
  _countryCode: string = 'US',
): string | null {
  if (!stripeLive()) return null;
  const priceId = PRICE_IDS[`${plan}_${interval}`];
  return isConfiguredPriceId(priceId) ? priceId : null;
}

// True only when the secret key is set AND every monthly price id is real.
export function isStripeReady(): boolean {
  const monthlyIds = [PRICE_IDS.starter_monthly, PRICE_IDS.business_monthly, PRICE_IDS.agency_monthly, PRICE_IDS.personal_pro_monthly];
  return stripeLive() && monthlyIds.every(isConfiguredPriceId);
}

// Startup-safe configuration report (no network, never throws): which
// plan/interval prices are configured. Used by GET /api/billing/status so
// the owner can see at a glance that e.g. annual prices are still
// placeholders. Exposes only booleans, never the ids.
export function getPriceConfigStatus(): { stripeKeySet: boolean; prices: Record<string, boolean> } {
  const prices: Record<string, boolean> = {};
  for (const [key, id] of Object.entries(PRICE_IDS)) prices[key] = isConfiguredPriceId(id);
  return { stripeKeySet: stripeLive(), prices };
}

// ── Back-compat (legacy callers) ───────────────────────────────────────────
export function getCurrencyForCountry(countryCode: string): string {
  return getBillingCurrency(countryCode);
}
export function getPriceId(plan: string, _currency: string): string | null {
  return getStripePrice(plan, 'monthly');
}
