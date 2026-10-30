import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { TOP_CATEGORY_SLUGS, topCategories } from '../topCategories';
import { INDUSTRIES } from '../programmaticData';

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('top 20 growth-spending categories', () => {
  it('lists 20 unique slugs that all have an industry hub', () => {
    expect(TOP_CATEGORY_SLUGS).toHaveLength(20);
    expect(new Set(TOP_CATEGORY_SLUGS).size).toBe(20);
    for (const slug of TOP_CATEGORY_SLUGS) expect(INDUSTRIES[slug], slug).toBeDefined();
    expect(topCategories()).toHaveLength(20);
  });

  it('plurals read correctly', () => {
    const bySlug = Object.fromEntries(topCategories().map(c => [c.slug, c.plural]));
    expect(bySlug['personal-injury-lawyer']).toBe('Personal Injury Lawyers');
    expect(bySlug['senior-care']).toBe('Senior Care Providers');
    expect(bySlug['solar-installer']).toBe('Solar Installers');
  });

  it('the shared footer shows the top list and a More industries link to /industries', () => {
    const s = src('components/SiteChrome.tsx');
    expect(s).toContain('topCategoryGroups()');
    expect(s).toContain('topCities()');
    expect(s).toMatch(/href="\/industries"[^>]*>More industries/);
  });

  it('/industries shows the top list first, then every industry', () => {
    const s = src('app/industries/page.tsx');
    expect(s.indexOf('top-categories')).toBeGreaterThan(-1);
    expect(s.indexOf('top-categories')).toBeLessThan(s.indexOf('all-industries'));
  });

  it('onboarding offers the top categories as selectable industries', () => {
    expect(src('app/onboarding/page.tsx')).toContain('TOP_INDUSTRIES.map');
  });
  it('footer groups cover all 20 categories exactly once', async () => {
    const { TOP_CATEGORY_GROUPS, topCategoryGroups } = await import('../topCategories');
    const slugs = TOP_CATEGORY_GROUPS.flatMap(g => g.slugs);
    expect(slugs.length).toBe(20);
    expect(new Set(slugs)).toEqual(new Set(TOP_CATEGORY_SLUGS));
    expect(topCategoryGroups().flatMap(g => g.items).length).toBe(20);
  });

  it('top cities are real city hubs in the US and UK', async () => {
    const { topCities, TOP_CITY_SLUGS } = await import('../topCategories');
    expect(topCities().length).toBe(TOP_CITY_SLUGS.length);
    expect(topCities().map(c => c.slug)).toEqual(expect.arrayContaining(['new-york', 'london']));
  });
});
