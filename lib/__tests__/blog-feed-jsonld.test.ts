import { describe, it, expect } from 'vitest';
import { toFeedItems, renderRss } from '../blogFeed';
import { jsonLdString } from '../jsonLd';

describe('azxf: RSS skips posts with null/invalid title or date', () => {
  it('drops null title, null date, invalid date and missing slug', () => {
    const items = toFeedItems([
      { title: 'Good post', excerpt: 'x', published_at: '2026-10-01T00:00:00Z', slug: 'good' },
      { title: null, excerpt: null, published_at: '2026-10-01T00:00:00Z', slug: 'no-title' },
      { title: '   ', excerpt: null, published_at: '2026-10-01T00:00:00Z', slug: 'blank' },
      { title: 'No date', excerpt: null, published_at: null, slug: 'no-date' },
      { title: 'Bad date', excerpt: null, published_at: 'not a date', slug: 'bad-date' },
      { title: 'No slug', excerpt: null, published_at: '2026-10-01T00:00:00Z', slug: null },
    ]);
    expect(items.map((i) => i.title)).toEqual(['Good post']);
  });
  it('never prints Invalid Date and escapes XML', () => {
    const xml = renderRss(toFeedItems([
      { title: 'A & B <c>', excerpt: null, published_at: '2026-10-01T00:00:00Z', slug: 'ab' },
      { title: 'x', excerpt: null, published_at: 'garbage', slug: 'x' },
    ]));
    expect(xml).not.toContain('Invalid Date');
    expect(xml).toContain('A &amp; B &lt;c&gt;');
    expect(xml).toContain('<pubDate>Thu, 01 Oct 2026 00:00:00 GMT</pubDate>');
  });
  it('null input yields a valid empty channel', () => {
    const xml = renderRss(toFeedItems(null), new Date('2026-10-16T00:00:00Z'));
    expect(xml).toContain('<lastBuildDate>Fri, 16 Oct 2026 00:00:00 GMT</lastBuildDate>');
    expect(xml).not.toContain('<item>');
  });
});

describe('azxf: JSON-LD escaping', () => {
  it('escapes < so a </script> in data cannot break out', () => {
    const out = jsonLdString({ headline: '</script><script>alert(1)</script>' });
    expect(out).not.toContain('<');
    expect(JSON.parse(out).headline).toBe('</script><script>alert(1)</script>');
  });
});
