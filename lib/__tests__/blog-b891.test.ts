import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b891 — /blog index is clean (posts from the DB, dates match
// bylines, bogus params/slugs handled). Its own S6 minor: post
// headings were not links — only the footer "Read more" was.

const page = readFileSync(join(process.cwd(), 'app/blog/page.tsx'), 'utf8');

describe('b891 — blog index cards', () => {
  it('the post title links to the post', () => {
    expect(page).toContain('<Link href={`/blog/${post.slug}`} style={{ color: NAVY, textDecoration: \'none\' }}>');
    expect(page).toContain('Read more →');
  });
});
