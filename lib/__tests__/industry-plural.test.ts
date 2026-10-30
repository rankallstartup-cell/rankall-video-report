import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { industryPlural } from '../industryPlural';
import { INDUSTRIES } from '../programmaticData';

describe('industry plurals — b86p / b8bc', () => {
  it('fixes the reported labels', () => {
    expect(industryPlural('Bakery')).toBe('Bakeries');
    expect(industryPlural('Car Wash')).toBe('Car Washes');
    expect(industryPlural('Fence Company')).toBe('Fence Companies');
    expect(industryPlural('Martial Arts')).toBe('Martial Arts Schools');
    expect(industryPlural('Music Lessons')).toBe('Music Teachers');
  });
  it('keeps regular plurals', () => {
    expect(industryPlural('Dentist')).toBe('Dentists');
    expect(industryPlural('Locksmith')).toBe('Locksmiths');
    expect(industryPlural('Med Spa')).toBe('Med Spas');
    expect(industryPlural('Gym')).toBe('Gyms');
  });
  it('no industry ends in a doubled or broken plural', () => {
    for (const { label } of Object.values(INDUSTRIES)) {
      const p = industryPlural(label);
      expect(p).not.toMatch(/(ss|shs|chs)$|[^aeiou]ys$/i);
    }
  });
  it('no page appends a bare "s" to an industry label', () => {
    for (const f of ['components/Footer.tsx', 'app/page.tsx', 'app/industries/page.tsx', 'app/[industry]/page.tsx', 'app/[industry]/[city]/page.tsx', 'app/cities/[city]/page.tsx']) {
      expect(readFileSync(join(process.cwd(), f), 'utf8')).not.toMatch(/(ind|data)\.label\}s/);
    }
  });
  it('sitemap Local Business link no longer points at /pricing', () => {
    expect(readFileSync(join(process.cwd(), 'app/sitemap/page.tsx'), 'utf8')).not.toContain("{ label: 'Local Business', href: '/pricing' }");
  });
});
