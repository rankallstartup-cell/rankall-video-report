export const revalidate = 3600; // ISR: public data, no per-user content

import Link from 'next/link'
import type { Metadata } from 'next'
import { supabase } from '@/lib/supabase'
import { jsonLdString } from '@/lib/jsonLd'

const BLOG_TITLE = 'AI Visibility Intelligence | Rankall Blog'
const BLOG_DESCRIPTION =
  'Rankall scans every industry, every city. These are the findings on AI search visibility for local businesses.'
const BLOG_OG_IMAGE =
  'https://rankall.io/api/og/marketing?title=AI%20Visibility%20Intelligence&subtitle=Rankall%20scans%20every%20industry%2C%20every%20city.%20Findings%20on%20AI%20search%20visibility%20for%20local%20businesses.'

export const metadata: Metadata = {
  title: BLOG_TITLE,
  alternates: {
    canonical: '/blog',
    // azxf: RSS autodiscovery — /blog/rss.xml lists all published posts.
    types: { 'application/rss+xml': '/blog/rss.xml' },
  },
  description: BLOG_DESCRIPTION,
  // azxe: blog index shares with its own 1200x630 card, not the logo.
  // Metadata merges are SHALLOW: an openGraph/twitter object with only
  // `images` replaced the root's (dropping og:title/description/url/
  // siteName/type), so both are complete here.
  openGraph: {
    type: 'website',
    url: '/blog',
    siteName: 'Rankall.io',
    locale: 'en_US',
    title: BLOG_TITLE,
    description: BLOG_DESCRIPTION,
    images: [{ url: BLOG_OG_IMAGE, width: 1200, height: 628, alt: 'Rankall Blog — AI Visibility Intelligence' }],
  },
  twitter: {
    card: 'summary_large_image',
    creator: '@rankall_io',
    title: BLOG_TITLE,
    description: BLOG_DESCRIPTION,
    images: [BLOG_OG_IMAGE],
  },
}

const BG = '#F6F6FB'
const W = '#FFFFFF'
const NAVY = '#0A0A14'
const BORDER = '#EDEDF4'
const BLUE = '#1B17FF'
const GRAY = '#55556A'
const LGRAY = '#8A8AA3'

type Post = {
  id: string
  title: string
  excerpt: string | null
  published_at: string | null
  industry: string | null
  city: string | null
  slug: string
}

function formatDate(dateStr: string | null) {
  // azxf: a null/invalid published_at rendered "Invalid Date".
  const d = dateStr ? new Date(dateStr) : null
  if (!d || Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default async function BlogPage() {
  const { data: posts } = await supabase
    .from('blog_posts')
    .select('id, title, excerpt, published_at, industry, city, slug')
    .eq('published', true)
    .order('published_at', { ascending: false })

  const allPosts: Post[] = posts ?? []

  return (
    <div style={{ backgroundColor: BG, minHeight: '100vh', fontFamily: "'Geist','Inter','Helvetica Neue',Arial,sans-serif" }}>
      {/* Hero */}      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString({
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement: allPosts.map((post, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: `https://rankall.io/blog/${post.slug}`,
          name: post.title,
        })),
      }) }} />

      <section
        style={{
          backgroundColor: NAVY,
          padding: '72px 24px',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            color: '#8D8BFF',
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: '16px',
          }}
        >
          Rankall Intelligence
        </p>
        <h1
          style={{
            color: '#FFFFFF',
            fontSize: 'clamp(36px, 5vw, 56px)',
            fontWeight: 700,
            letterSpacing: '-0.04em',
            lineHeight: 1.05,
            margin: '0 0 16px',
          }}
        >
          AI Visibility Intelligence
        </h1>
        <p
          style={{
            color: LGRAY,
            fontSize: '18px',
            maxWidth: '520px',
            margin: '0 auto',
            lineHeight: 1.6,
          }}
        >
          Rankall scans every industry, every city. These are the findings.
        </p>
      </section>

      {/* Post grid */}
      <main
        style={{
          maxWidth: '1100px',
          margin: '0 auto',
          padding: '56px 24px',
        }}
      >
        {allPosts.length === 0 ? (
          <p style={{ color: GRAY, textAlign: 'center', fontSize: '16px' }}>
            No posts published yet. Check back soon.
          </p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '24px',
            }}
          >
            {allPosts.map((post) => (
              <article
                key={post.id}
                style={{
                  backgroundColor: W,
                  border: `1px solid ${BORDER}`,
                  borderRadius: '16px',
                  padding: '28px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  transition: 'box-shadow 0.2s',
                }}
              >
                {/* Chips */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {post.industry && (
                    <span
                      style={{
                        backgroundColor: '#EEF0FF',
                        color: BLUE,
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '3px 10px',
                        borderRadius: '999px',
                        letterSpacing: '0.03em',
                      }}
                    >
                      {post.industry}
                    </span>
                  )}
                  {post.city && (
                    <span
                      style={{
                        backgroundColor: '#F1F5F9',
                        color: GRAY,
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '3px 10px',
                        borderRadius: '999px',
                      }}
                    >
                      {post.city}
                    </span>
                  )}
                </div>

                {/* Title — b891: the heading itself is a link, not
                    just the 'Read more' footer link. */}
                <h2
                  style={{
                    fontSize: '17px',
                    fontWeight: 700,
                    lineHeight: 1.4,
                    margin: 0,
                  }}
                >
                  <Link href={`/blog/${post.slug}`} style={{ color: NAVY, textDecoration: 'none' }}>
                    {post.title}
                  </Link>
                </h2>

                {/* Excerpt */}
                {post.excerpt && (
                  <p
                    style={{
                      color: GRAY,
                      fontSize: '14px',
                      lineHeight: 1.6,
                      margin: 0,
                      flexGrow: 1,
                    }}
                  >
                    {post.excerpt}
                  </p>
                )}

                {/* Footer */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: '8px',
                    borderTop: `1px solid ${BORDER}`,
                    marginTop: 'auto',
                  }}
                >
                  <time
                    dateTime={post.published_at ?? undefined}
                    style={{ color: LGRAY, fontSize: '12px' }}
                  >
                    {formatDate(post.published_at)}
                  </time>
                  <Link
                    href={`/blog/${post.slug}`}
                    style={{
                      color: BLUE,
                      fontSize: '13px',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    Read more →
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
