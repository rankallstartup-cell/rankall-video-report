import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FOUNDER_PRICING_USD, PRICE_LOCAL_USD, PRICE_PERSONAL_USD, PRICE_AGENCY_USD, tierPrice,
  TRUST_SIGNAL_COUNT, TRUST_SIGNALS_LABEL, SCAN_TIME_LABEL, MARKETS_COVERED, PLATFORMS_SCANNED,
  PLATFORM_SCORING_WEIGHTS,
} from '../publicStats';
import { ACTIVE_PLATFORMS } from '../platforms';
import { COUNTRY_CONFIGS } from '../countryConfig';
import { buildAlinaPrompt } from '../constants';

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8');

describe('publicStats is the single source of truth (ax75/azxh)', () => {
  it('founder prices match the product decision', () => {
    expect(PRICE_PERSONAL_USD).toBe(15);
    expect(PRICE_LOCAL_USD).toBe(39);
    expect(PRICE_AGENCY_USD).toBe(259);
    expect(() => tierPrice('Publisher Pro')).toThrow();
  });
  it('scoring weights match the canonical platform weights (b8bg)', () => {
    // Single source of truth: lib/platforms.ts PLATFORMS weights.
    expect(PLATFORM_SCORING_WEIGHTS).toHaveLength(PLATFORMS_SCANNED);
    expect(PLATFORM_SCORING_WEIGHTS).toHaveLength(ACTIVE_PLATFORMS.length);
    for (let i = 0; i < ACTIVE_PLATFORMS.length; i++) {
      expect(PLATFORM_SCORING_WEIGHTS[i].name).toBe(ACTIVE_PLATFORMS[i].name);
      // Display percents are the largest-remainder integer allocation of the
      // renormalized weights, so each is within 1 of naive rounding.
      expect(Math.abs(PLATFORM_SCORING_WEIGHTS[i].weightPct - Math.round(ACTIVE_PLATFORMS[i].weight * 100))).toBeLessThanOrEqual(1);
    }
    // Renormalized Oct 26 (hackathon, Nandish-approved): raw weights sum to 100%,
    // and the displayed integer column sums to 100 as well. Scoring is unaffected
    // (lib/scoring normalizes by responded weight).
    expect(ACTIVE_PLATFORMS.reduce((s, p) => s + p.weight, 0)).toBeCloseTo(1, 10);
    expect(PLATFORM_SCORING_WEIGHTS.reduce((s, p) => s + p.weightPct, 0)).toBe(100);
    expect(PLATFORM_SCORING_WEIGHTS.map((p) => p.name)).toContain('Meta AI');
  });
  it('derived labels', () => {
    expect(TRUST_SIGNALS_LABEL).toBe(`${Math.floor(TRUST_SIGNAL_COUNT / 10) * 10}+`);
    expect(MARKETS_COVERED).toBe(Object.keys(COUNTRY_CONFIGS).length);
    expect(SCAN_TIME_LABEL).toBe('about 90 seconds');
  });

  it('pricing page + layout read prices from publicStats (no literals)', () => {
    const client = read('app/pricing/PricingClient.tsx');
    expect(client).toContain('monthly: PRICE_LOCAL_USD');
    expect(client).toContain('monthly: PRICE_AGENCY_USD');
    expect(client).toContain('monthly: PRICE_PERSONAL_USD');
    const layout = read('app/pricing/layout.tsx');
    expect(layout).toContain("from '@/lib/publicStats'");
    expect(layout).not.toMatch(/\$(15|39|259)\b/);
  });

  it('terms list every founder tier and no invented ones', () => {
    const terms = read('app/terms/page.tsx');
    expect(terms).toContain('FOUNDER_PRICING_USD.map');
    expect(terms).not.toContain('$169');
    expect(terms).not.toContain('Publisher Pro');
  });

  it('chatbot prompt is built from publicStats, with composites labelled', () => {
    const route = read('app/api/chat/route.ts');
    expect(route).toContain('tiers: FOUNDER_PRICING_USD');
    const prompt = buildAlinaPrompt({ tiers: FOUNDER_PRICING_USD, platformsScanned: PLATFORMS_SCANNED, trustSignalsLabel: TRUST_SIGNALS_LABEL, scanTimeLabel: SCAN_TIME_LABEL });
    for (const t of FOUNDER_PRICING_USD) expect(prompt).toContain(`${t.name}: $${t.monthly.toLocaleString('en-US')}/mo`);
    expect(prompt).toContain('illustrative composites');
    expect(prompt).not.toMatch(/KEY RESULTS|24 to 71|38 to 79/);
    const constants = read('lib/constants.ts');
    expect(constants.slice(constants.indexOf('ALINA CHATBOT PROMPT'))).not.toMatch(/\$\d/);
  });

  it('no stale timing / signal / market literals in owned public copy', () => {
    const files = [
      'app/layout.tsx', 'app/how-it-works/layout.tsx', 'app/how-it-works/page.tsx', 'app/vs/page.tsx',
      'app/intelligence-graph/page.tsx', 'app/api/og/marketing/route.ts', 'app/llms.txt/route.ts',
      'app/llms-full.txt/route.ts', 'app/press/PressPageClient.tsx', 'app/brands/page.tsx',
      'app/brands/BrandsClient.tsx', 'app/[industry]/[city]/page.tsx', 'app/[industry]/page.tsx',
      'app/cities/[city]/page.tsx', 'app/pricing/PricingClient.tsx',
    ];
    for (const f of files) {
      const src = read(f);
      expect(src, f).not.toMatch(/in 60 seconds|60 seconds|Takes 60|'60s'/);
      expect(src, f).not.toMatch(/\b(32|35|54|60\+) (trust )?signals/);
      expect(src, f).not.toMatch(/(14|30) countries/);
    }
  });
});

describe('round 2: displayed tier prices agree with publicStats', () => {
  it('US countryConfig tiers equal the founder tiers', () => {
    const us = COUNTRY_CONFIGS.US;
    expect(us.monthly).toBe(tierPrice('Local Pro'));
    expect(us.tiers.personalPro.monthly).toBe(tierPrice('Personal Brand Pro'));
    expect(us.tiers.productPro.monthly).toBe(tierPrice('Product Pro'));
    expect(us.tiers.agency.monthly).toBe(tierPrice('Agency'));
    expect(us.tiers.seoAutopilot.monthly).toBe(tierPrice('SEO'));
  });
  it('homepage never prints a price for a non-founder tier', () => {
    const page = read('app/page.tsx');
    expect(page).not.toContain('usPricing.tiers.publisherPro');
    expect(page).not.toContain('usPricing.tiers.seoAutopilot');
    expect(page).toContain("tierPrice('Global Brand Intelligence')");
  });
  it('brands page uses the founder price, no invented $15k/$50k tiers', () => {
    const brands = read('app/brands/BrandsClient.tsx');
    expect(brands).not.toMatch(/\$15,000|\$50,000/);
    expect(brands).toContain("tierPrice('Global Brand Intelligence')");
  });
});
