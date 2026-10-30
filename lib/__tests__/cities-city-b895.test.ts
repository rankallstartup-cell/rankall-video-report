import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// b895 — /cities/[city] itself is honest (withholds averages below
// the 5-business threshold; bogus slugs 404 without leaking). Its
// own minor defect: the 404 was the bare framework page with no
// way forward in the content.

describe('b895 — city not-found gives a way forward', () => {
  it('a segment not-found exists with exits', () => {
    const p = join(process.cwd(), 'app/cities/[city]/not-found.tsx');
    expect(existsSync(p)).toBe(true);
    const src = readFileSync(p, 'utf8');
    expect(src).toContain("We don&apos;t track that city yet.");
    expect(src).toContain('href="/cities"');
    expect(src).toContain('href="/"');
  });

  it('the [city] page still 404s unknown slugs', () => {
    const page = readFileSync(join(process.cwd(), 'app/cities/[city]/page.tsx'), 'utf8');
    expect(page).toContain('if (!cit) notFound();');
  });
});
