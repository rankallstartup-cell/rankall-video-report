import type { CountryConfig } from './countryConfig';
import type { PlanType } from './planConfig';
import { tierPrice } from './publicStats';

/**
 * Monthly Rankall price for a plan in a country, from the founder-set
 * pricing in countryConfig. Returns the plan's own tier price when one is
 * listed; otherwise falls back to Local Pro pricing (country.monthly) and
 * reports exactPlanPrice: false so callers can label the basis honestly
 * instead of presenting Local Pro pricing as the user's own plan price.
 */
export function planMonthlyPrice(
  plan: PlanType,
  country: CountryConfig,
): { monthly: number; exactPlanPrice: boolean } {
  if (plan === 'personal_pro') return { monthly: country.tiers.personalPro.monthly, exactPlanPrice: true };
  if (plan === 'agency') return { monthly: country.tiers.agency.monthly, exactPlanPrice: true };
  if (plan === 'agency_seo') return { monthly: country.tiers.agencySeo.monthly, exactPlanPrice: true };
  // country.monthly IS the Local Pro / business price.
  if (plan === 'business' || plan === 'local_pro') return { monthly: country.monthly, exactPlanPrice: true };
  // b8ac: enterprise + government have founder-set USD prices but no
  // country tiers — use the USD founder price (still exact for the plan,
  // labelled by the caller with the country symbol as an approximation).
  if (plan === 'enterprise') return { monthly: tierPrice('Enterprise'), exactPlanPrice: true };
  if (plan === 'government') return { monthly: tierPrice('Government'), exactPlanPrice: true };
  return { monthly: country.monthly, exactPlanPrice: false };
}
