import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getCountryConfig } from '@/lib/countryConfig';

// ax6z / T8: the Personal page showed the LOCALIZED tier price
// (e.g. £32 for GB) while checkout charges the single USD Stripe
// price ($15), and fell back to `?? 39` (Local Pro's price, not
// Personal's $15) if the tier lookup missed. Prices must be USD
// for every visitor, matching the pricing page's ax6z treatment.
describe('ax6z personal price truth', () => {
  it('personal page shows the USD Personal price, no localized tier, no ?? 39', () => {
    const page = readFileSync(
      join(process.cwd(), 'app/personal/PersonalClient.tsx'), 'utf8');
    // The old line was `country.tiers?.personalPro?.monthly ?? 39`
    // (Local Pro's price, not Personal's $15).
    expect(page).not.toContain('personalPro?.monthly ?? 39');
    expect(page).not.toContain('country.tiers');
    // Single price source: the US tier in lib/countryConfig (= $15).
    expect(page).toContain("getCountryConfig('US')");
    expect(page).toContain('tiers.personalPro.monthly');
    expect(getCountryConfig('US').tiers.personalPro.monthly).toBe(15);
    expect(getCountryConfig('US').symbol).toBe('$');
    expect(page).toContain('All prices in USD');
  });
});
