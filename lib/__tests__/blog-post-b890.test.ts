import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// b890 — /blog/[slug] post page passes (content from the DB,
// bogus slugs 404 without leaking). Its own minor: the 404 was
// the bare framework page with no way forward in the body.

describe('b890 — blog post not-found gives a way forward', () => {
  it('a segment not-found exists with exits', () => {
    const p = join(process.cwd(), 'app/blog/[slug]/not-found.tsx');
    expect(existsSync(p)).toBe(true);
    const src = readFileSync(p, 'utf8');
    expect(src).toContain('Post not found.');
    expect(src).toContain('href="/blog"');
    expect(src).toContain('href="/"');
  });
});
