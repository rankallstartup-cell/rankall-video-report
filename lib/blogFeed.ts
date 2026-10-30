// RSS item builder for /blog/rss.xml (azxf). Pure so it can be unit-tested.
// A post with a null/blank title or a missing/invalid published_at used to
// either crash the route (escapeXml(null).replace) or print
// "<pubDate>Invalid Date</pubDate>" — such posts are now skipped.

export type FeedPostRow = {
  title: string | null;
  excerpt: string | null;
  published_at: string | null;
  slug: string | null;
};

export type FeedItem = { title: string; link: string; pubDate: string; description: string };

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Valid posts only, as feed items (input order preserved). */
export function toFeedItems(posts: FeedPostRow[] | null | undefined, base = 'https://rankall.io'): FeedItem[] {
  const items: FeedItem[] = [];
  for (const p of posts ?? []) {
    const title = typeof p.title === 'string' ? p.title.trim() : '';
    const slug = typeof p.slug === 'string' ? p.slug.trim() : '';
    if (!title || !slug || !p.published_at) continue;
    const date = new Date(p.published_at);
    if (Number.isNaN(date.getTime())) continue;
    items.push({
      title,
      link: `${base}/blog/${encodeURIComponent(slug)}`,
      pubDate: date.toUTCString(),
      description: p.excerpt ?? '',
    });
  }
  return items;
}

export function renderRss(items: FeedItem[], now: Date = new Date()): string {
  const lastBuildDate = items[0]?.pubDate ?? now.toUTCString();
  const body = items
    .map((it) => `    <item>
      <title>${escapeXml(it.title)}</title>
      <link>${escapeXml(it.link)}</link>
      <guid isPermaLink="true">${escapeXml(it.link)}</guid>
      <pubDate>${it.pubDate}</pubDate>
      <description>${escapeXml(it.description)}</description>
    </item>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Rankall Blog — AI Visibility Intelligence</title>
    <link>https://rankall.io/blog</link>
    <description>Rankall scans every industry, every city. Findings on AI search visibility for local businesses.</description>
    <language>en-US</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="https://rankall.io/blog/rss.xml" rel="self" type="application/rss+xml" />
${body}
  </channel>
</rss>`;
}
