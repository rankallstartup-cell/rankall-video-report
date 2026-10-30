// b8ap — pluralization: every industry label now uses the curated
// `plural` field from lib/programmaticData (bakeries, car washes, …),
// never a naive label + 's'. City duplicates are disambiguated, not deleted.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8');

const FILES = [
  'components/Footer.tsx',
  'app/page.tsx',
  'app/industries/page.tsx',
  'app/[industry]/page.tsx',
  'app/[industry]/[city]/page.tsx',
  'app/[industry]/[city]/opengraph-image.tsx',
  'app/cities/[city]/page.tsx',
];

describe('industry pluralization (b8ap)', () => {
  it('no file builds a plural by appending s to the label', () => {
    for (const f of FILES) {
      const src = read(f);
      expect(src, f).not.toMatch(/ind\.label\}s/);
      expect(src, f).not.toMatch(/ind\.label\.toLowerCase\(\)\}s/);
      expect(src, f).not.toMatch(/\$\{ind\.label\}s/);
      expect(src, f).not.toMatch(/\$\{ind\.label\.toLowerCase\(\)\}s/);
      expect(src, f).not.toMatch(/\$\{data\.label\}s/);
    }
  });

  it('uses the curated plural field', () => {
    // Footer.tsx is now just a SiteChrome wrapper and app/page.tsx
    // renders no industry plurals at all, so neither can carry the
    // field; the files that do render industries use the curated
    // plural mechanism — the ind.plural field or the industryPlural()
    // helper built on it.
    const RENDERING = FILES.filter((f) => f !== 'components/Footer.tsx' && f !== 'app/page.tsx');
    expect(RENDERING).toHaveLength(5);
    for (const f of RENDERING) {
      const src = read(f);
      expect(src.includes('ind.plural') || src.includes('industryPlural('), f).toBe(true);
    }
  });

  it('"every city" is qualified as "every city we track"', () => {
    for (const f of ['app/industries/page.tsx', 'app/[industry]/page.tsx', 'app/[industry]/[city]/page.tsx']) {
      const src = read(f);
      expect(src, f).not.toMatch(/in every city(?! we track)/);
      expect(src, f).toContain('in every city we track');
    }
  });

  it('duplicate city labels are disambiguated with the state, not deduped', () => {
    const hub = read('app/[industry]/page.tsx');
    expect(hub).toContain('cityDisplay');
    expect(hub).toContain('Aurora');
    expect(hub).toContain('Hamilton');
    const data = read('lib/programmaticData.tsx');
    expect(data).toContain("'aurora':");
    expect(data).toContain("'aurora-il':");
    expect(data).toContain("'hamilton':");
    expect(data).toContain("'hamilton-nz':");
  });
});
