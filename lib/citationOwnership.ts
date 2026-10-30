// lib/citationOwnership.ts
// STD-07: classify the citation sources extracted from AI answers
// (lib/analyser-ml.ts extractCitationSources) into ownership categories.
//
// The extractor matches a fixed list of well-known source names, so the
// categories here are: review platforms, UGC/community, directories,
// social, and search. Anything unrecognized is 'other' — never forced
// into a category it doesn't belong in.

export type CitationCategory = 'review' | 'ugc' | 'directory' | 'social' | 'search' | 'other';

const CATEGORY_MAP: Record<string, CitationCategory> = {
  // Review platforms
  yelp: 'review',
  healthgrades: 'review',
  zocdoc: 'review',
  vitals: 'review',
  ratemds: 'review',
  tripadvisor: 'review',
  opentable: 'review',
  trustpilot: 'review',
  avvo: 'review',
  martindale: 'review',
  // UGC / community
  reddit: 'ugc',
  quora: 'ugc',
  // Directories
  bbb: 'directory',
  angi: 'directory',
  homeadvisor: 'directory',
  houzz: 'directory',
  thumbtack: 'directory',
  webmd: 'directory',
  // Social
  facebook: 'social',
  instagram: 'social',
  linkedin: 'social',
  // Search
  google: 'search',
  amazon: 'search',
};

export const CATEGORY_LABELS: Record<CitationCategory, string> = {
  review: 'Review platforms',
  ugc: 'Community (UGC)',
  directory: 'Directories',
  social: 'Social',
  search: 'Search & marketplaces',
  other: 'Other sources',
};

export function classifyCitationSource(source: string): CitationCategory {
  const key = source.trim().toLowerCase();
  return CATEGORY_MAP[key] ?? 'other';
}

export interface GroupedCitations {
  category: CitationCategory;
  label: string;
  sources: Array<{ name: string; count: number }>;
  total: number;
}

// Group raw citation source names (with duplicates = multiple platforms
// cited them) into categories, most-cited first within each group.
export function groupCitationSources(sources: string[]): GroupedCitations[] {
  const counts = new Map<string, number>();
  const canonical = new Map<string, string>();
  for (const s of sources) {
    const key = s.trim().toLowerCase();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!canonical.has(key)) canonical.set(key, s.trim());
  }

  const byCat = new Map<CitationCategory, Array<{ name: string; count: number }>>();
  for (const [key, count] of counts) {
    const cat = classifyCitationSource(key);
    const list = byCat.get(cat) ?? [];
    list.push({ name: canonical.get(key) ?? key, count });
    byCat.set(cat, list);
  }

  const order: CitationCategory[] = ['review', 'ugc', 'directory', 'social', 'search', 'other'];
  return order
    .filter(c => byCat.has(c))
    .map(c => {
      const list = byCat.get(c)!.sort((a, b) => b.count - a.count);
      return {
        category: c,
        label: CATEGORY_LABELS[c],
        sources: list,
        total: list.reduce((sum, s) => sum + s.count, 0),
      };
    });
}
