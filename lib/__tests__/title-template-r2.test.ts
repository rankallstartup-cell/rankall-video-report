import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Fix round 2: the root title template '%s | Rankall.io' doubled the brand
// on every page whose own title already ends in "| Rankall…" / "— Rankall"
// (blog posts: "X | Rankall Blog | Rankall.io"). Those titles must use
// title.absolute. openGraph/twitter titles are not templated (indent > 2
// inside a metadata object is fine).
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (e === '__tests__' || e === 'api') continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/(page|layout)\.tsx$/.test(p)) out.push(p);
  }
  return out;
}

describe('no doubled brand in page titles', () => {
  it('top-level branded titles use title.absolute', () => {
    const offenders: string[] = [];
    for (const f of walk(join(process.cwd(), 'app'))) {
      if (f.endsWith(join('app', 'layout.tsx'))) continue;
      const src = readFileSync(f, 'utf-8');
      if (/^ {2}title: ['`][^'`\n]*(\| Rankall|— Rankall)[^'`\n]*['`],/m.test(src)) offenders.push(f);
      if (/return \{ title: ['`][^'`\n]*Rankall/.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
  it('blog post metadata: absolute title + OG siteName', () => {
    const src = readFileSync(join(process.cwd(), 'app/blog/[slug]/page.tsx'), 'utf-8');
    expect(src).toContain('title: { absolute: `${post.title} | Rankall Blog` }');
    expect(src).toContain("siteName: 'Rankall.io'");
  });
});
