import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { toFeedItems, renderRss, type FeedPostRow } from '@/lib/blogFeed';

// RSS 2.0 feed for the Rankall blog (azxf): /blog/rss.xml lists all
// published posts (newest first, capped at 100). Excerpt-only descriptions
// — post.content is raw HTML and is not embedded in the feed. Posts with a
// null title/slug or an invalid published_at are skipped (lib/blogFeed).
export const revalidate = 3600; // ISR: same cadence as the blog index

export async function GET() {
  let rows: FeedPostRow[] = [];
  try {
    const { data } = await supabase
      .from('blog_posts')
      .select('title, excerpt, published_at, slug')
      .eq('published', true)
      .not('published_at', 'is', null)
      .order('published_at', { ascending: false })
      .limit(100);
    rows = (data ?? []) as FeedPostRow[];
  } catch (err) {
    // An empty-but-valid feed beats a 500 for feed readers.
    console.error('[blog/rss] query failed', err);
  }

  return new NextResponse(renderRss(toFeedItems(rows)), {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
