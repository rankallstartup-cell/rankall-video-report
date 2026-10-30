// The 20 local-business categories that spend the most on growth (SEO,
// Google Ads, marketing) in the US and UK, ranked by spend and customer
// value. Sources: WordStream/LocaliQ 2026 search ad benchmarks (CPC/CPL by
// industry); UK names map to the same local categories. The footer shows
// this list; /industries shows it first, then every industry Rankall tracks.
import { INDUSTRIES, CITIES } from './programmaticData';
import { industryPlural } from './industryPlural';

export const TOP_CATEGORY_SLUGS = [
  'personal-injury-lawyer',
  'lawyer',
  'dentist',
  'med-spa',
  'roofing',
  'hvac',
  'plumber',
  'remodeling',
  'solar-installer',
  'pest-control',
  'moving-company',
  'locksmith',
  'real-estate',
  'mortgage-broker',
  'accountant',
  'chiropractor',
  'veterinarian',
  'auto-repair',
  'tutoring',
  'senior-care',
] as const;

export type TopCategory = { slug: string; label: string; plural: string; emoji: string };

export function topCategories(): TopCategory[] {
  return TOP_CATEGORY_SLUGS.filter(slug => INDUSTRIES[slug]).map(slug => {
    const ind = INDUSTRIES[slug];
    return { slug, label: ind.label, plural: industryPlural(ind.label), emoji: ind.emoji };
  });
}

// Footer grouping (same 20, by sector) so visitors find their trade fast.
// Every slug here must also be in TOP_CATEGORY_SLUGS (tested).
export const TOP_CATEGORY_GROUPS: { title: string; slugs: string[] }[] = [
  { title: 'Legal & Finance', slugs: ['personal-injury-lawyer', 'lawyer', 'accountant', 'mortgage-broker', 'real-estate'] },
  { title: 'Health & Care', slugs: ['dentist', 'med-spa', 'chiropractor', 'veterinarian', 'senior-care'] },
  { title: 'Home Services', slugs: ['roofing', 'hvac', 'plumber', 'remodeling', 'solar-installer', 'pest-control'] },
  { title: 'Local Services', slugs: ['moving-company', 'locksmith', 'auto-repair', 'tutoring'] },
];

export function topCategoryGroups(): { title: string; items: TopCategory[] }[] {
  const all = new Map(topCategories().map(c => [c.slug, c]));
  return TOP_CATEGORY_GROUPS.map(g => ({ title: g.title, items: g.slugs.map(s => all.get(s)).filter((c): c is TopCategory => !!c) }));
}

// Biggest US + UK markets for the footer's city links (/cities/<slug>).
export const TOP_CITY_SLUGS = ['new-york', 'los-angeles', 'chicago', 'houston', 'dallas', 'miami', 'london', 'manchester', 'birmingham'] as const;

export function topCities(): { slug: string; label: string }[] {
  return TOP_CITY_SLUGS.filter(s => CITIES[s]).map(s => ({ slug: s, label: CITIES[s].label }));
}
