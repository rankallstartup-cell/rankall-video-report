export const revalidate = 3600; // ISR: public data, no per-user content

import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { supabase } from '@/lib/supabase'
import { jsonLdString } from '@/lib/jsonLd'

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
  content: string
  published_at: string | null
  industry: string | null
  city: string | null
  slug: string
}

type RelatedPost = {
  id: string
  title: string
  excerpt: string | null
  published_at: string | null
  slug: string
  city: string | null
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const { data: post } = await supabase
    .from('blog_posts')
    .select('title, excerpt')
    .eq('slug', slug)
    .eq('published', true)
    .single()

  if (!post) {
    return { title: { absolute: 'Post Not Found | Rankall Blog' } }
  }

  // azxf: post-specific 1200x630 share card (generic marketing generator).
  // The Article JSON-LD below references this same image.
  const ogImage = `https://rankall.io/api/og/marketing?title=${encodeURIComponent(post.title)}&subtitle=${encodeURIComponent(post.excerpt ?? 'Rankall scans every industry, every city. Findings on AI search visibility for local businesses.')}`;
  // Round 2: title.absolute — the root '%s | Rankall.io' template turned
  // this into "X | Rankall Blog | Rankall.io". OG gains siteName.
  return {
    title: { absolute: `${post.title} | Rankall Blog` },
    description: post.excerpt ?? undefined,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      type: 'article',
      siteName: 'Rankall.io',
      title: `${post.title} | Rankall Blog`,
      description: post.excerpt ?? undefined,
      url: `https://rankall.io/blog/${slug}`,
      images: [{ url: ogImage, width: 1200, height: 628, alt: post.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${post.title} | Rankall Blog`,
      description: post.excerpt ?? undefined,
      images: [ogImage],
    },
  }
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const { data: post, error: postError } = await supabase
    .from('blog_posts')
    .select('id, title, excerpt, content, published_at, industry, city, slug')
    .eq('slug', slug)
    .eq('published', true)
    .single<Post>()

  if (postError && postError.code !== 'PGRST116') console.error('[blog] post query failed', slug, postError.message)

  if (!post) {
    notFound()
  }

  // Related posts from same industry
  let relatedPosts: RelatedPost[] = []
  if (post.industry) {
    const { data } = await supabase
      .from('blog_posts')
      .select('id, title, excerpt, published_at, slug, city')
      .eq('published', true)
      .eq('industry', post.industry)
      .neq('id', post.id)
      .order('published_at', { ascending: false })
      .limit(3)
    relatedPosts = (data as RelatedPost[]) ?? []
  }

  const ctaQuery = post.industry && post.city
    ? encodeURIComponent(`${post.industry} in ${post.city}`)
    : post.industry
    ? encodeURIComponent(post.industry)
    : ''

  const author = 'Rankall Intelligence Team'

  // azxf: Article schema — headline, datePublished, author, image.
  // Author matches the visible byline ('Rankall Intelligence Team').
  // dateModified = published_at: blog_posts has no updated_at column.
  // Image = this post's OG share card (same URL as generateMetadata).
  const articleOgImage = `https://rankall.io/api/og/marketing?title=${encodeURIComponent(post.title)}&subtitle=${encodeURIComponent(post.excerpt ?? 'Rankall scans every industry, every city. Findings on AI search visibility for local businesses.')}`;
  const publishedDate = post.published_at ? new Date(post.published_at) : null
  const publishedIso = publishedDate && !Number.isNaN(publishedDate.getTime()) ? publishedDate.toISOString() : null
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt ?? undefined,
    image: [articleOgImage],
    // azxf: new Date(null).toISOString() throws — omit the dates instead.
    ...(publishedIso ? { datePublished: publishedIso, dateModified: publishedIso } : {}),
    author: { '@type': 'Organization', name: 'Rankall Intelligence Team', url: 'https://rankall.io' },
    publisher: {
      '@type': 'Organization',
      name: 'Rankall',
      url: 'https://rankall.io',
      logo: { '@type': 'ImageObject', url: 'https://rankall.io/rankall-logo-dark.png' },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `https://rankall.io/blog/${post.slug}` },
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rankall.io/' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://rankall.io/blog' },
      { '@type': 'ListItem', position: 3, name: post.title, item: `https://rankall.io/blog/${post.slug}` },
    ],
  };

  return (
    <div style={{ backgroundColor: BG, minHeight: '100vh', fontFamily: "'Geist','Inter',sans-serif", padding: '40px 24px 80px' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(articleJsonLd) }} />
      <nav aria-label="Breadcrumb" style={{ maxWidth: 800, margin: '0 auto 20px', fontSize: 13, color: GRAY }}>
        <Link href="/" style={{ color: BLUE, textDecoration: 'none' }}>Home</Link>
        {' / '}
        <Link href="/blog" style={{ color: BLUE, textDecoration: 'none' }}>Blog</Link>
        {' / '}
        <span style={{ color: NAVY }}>{post.title}</span>
      </nav>
      {/* Back link */}
      <div style={{ maxWidth: '720px', margin: '0 auto 32px' }}>
        <Link
          href="/blog"
          style={{
            color: BLUE,
            fontSize: '14px',
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          ← Back to Blog
        </Link>
      </div>

      <article
        style={{
          maxWidth: '720px',
          margin: '0 auto',
          backgroundColor: W,
          border: `1px solid ${BORDER}`,
          borderRadius: '16px',
          padding: 'clamp(28px, 5vw, 56px)',
        }}
      >
        {/* Chips + date */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
            alignItems: 'center',
            marginBottom: '20px',
          }}
        >
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
          <time
            dateTime={post.published_at ?? undefined}
            style={{ color: LGRAY, fontSize: '12px', marginLeft: 'auto' }}
          >
            {formatDate(post.published_at)}
          </time>
        </div>

        {/* Title */}
        <h1
          style={{
            color: NAVY,
            fontSize: 'clamp(22px, 4vw, 34px)',
            fontWeight: 800,
            lineHeight: 1.25,
            margin: '0 0 16px',
          }}
        >
          {post.title}
        </h1>

        {/* Byline */}
        <p
          style={{
            color: LGRAY,
            fontSize: '13px',
            marginBottom: '36px',
            paddingBottom: '28px',
            borderBottom: `1px solid ${BORDER}`,
          }}
        >
          {author} · {formatDate(post.published_at)}
        </p>

        {/* Content */}
        <div
          style={{
            color: NAVY,
            fontSize: '16px',
            lineHeight: 1.75,
            whiteSpace: 'pre-wrap',
          }}
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        {/* CTA box */}
        {ctaQuery && (
          <div
            style={{
              marginTop: '48px',
              backgroundColor: '#EEF0FF',
              border: `1px solid #C9D4FF`,
              borderRadius: '12px',
              padding: '28px',
              textAlign: 'center',
            }}
          >
            <p
              style={{
                color: NAVY,
                fontWeight: 700,
                fontSize: '17px',
                marginBottom: '16px',
              }}
            >
              Is your{post.industry ? ` ${post.industry}` : ''} business visible to AI?
            </p>
            <Link
              href={`/?q=${ctaQuery}`}
              style={{
                display: 'inline-block',
                backgroundColor: BLUE,
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: '15px',
                padding: '12px 28px',
                borderRadius: '8px',
                textDecoration: 'none',
              }}
            >
              Scan your{post.industry ? ` ${post.industry}` : ''} business free →
            </Link>
          </div>
        )}
      </article>

      {/* Related posts */}
      {relatedPosts.length > 0 && (
        <section
          style={{
            maxWidth: '720px',
            margin: '56px auto 0',
          }}
        >
          <h2
            style={{
              color: NAVY,
              fontSize: '20px',
              fontWeight: 700,
              marginBottom: '20px',
            }}
          >
            Related Reports
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {relatedPosts.map((related) => (
              <Link
                key={related.id}
                href={`/blog/${related.slug}`}
                style={{ textDecoration: 'none' }}
              >
                <div
                  style={{
                    backgroundColor: W,
                    border: `1px solid ${BORDER}`,
                    borderRadius: '10px',
                    padding: '20px 24px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '16px',
                  }}
                >
                  <div>
                    <p
                      style={{
                        color: NAVY,
                        fontWeight: 600,
                        fontSize: '15px',
                        margin: '0 0 4px',
                      }}
                    >
                      {related.title}
                    </p>
                    {related.city && (
                      <p style={{ color: LGRAY, fontSize: '12px', margin: 0 }}>
                        {related.city} · {formatDate(related.published_at)}
                      </p>
                    )}
                  </div>
                  <span style={{ color: BLUE, fontSize: '18px', flexShrink: 0 }}>→</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
