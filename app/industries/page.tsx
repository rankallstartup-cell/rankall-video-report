import { jsonLdString } from '@/lib/jsonLd';
import type { Metadata } from 'next';
import Link from 'next/link';
import { INDUSTRIES } from '@/lib/programmaticData';
import { industryPlural } from '@/lib/industryPlural';
import { topCategories } from '@/lib/topCategories';

const BASE = 'https://rankall.io';

// Hub index (azxg): /industries — every industry hub in one place.
// Pure navigation (no DB queries): per-industry stats live on the hubs.
export const metadata: Metadata = {
  title: { absolute: 'AI Visibility by Industry | Rankall' },
  description: 'Browse AI visibility for every industry in every city we track — dentists, HVAC, restaurants, lawyers, and 70+ more. See which businesses ChatGPT, Gemini, and Perplexity recommend.',
  alternates: { canonical: '/industries' },
  openGraph: {
    title: 'AI Visibility by Industry | Rankall',
    description: 'Browse AI visibility for every industry in every city we track — dentists, HVAC, restaurants, lawyers, and 70+ more.',
    url: `${BASE}/industries`,
    images: [{ url: `${BASE}/api/og/marketing?title=${encodeURIComponent('AI Visibility by Industry')}&subtitle=${encodeURIComponent('Dentists, HVAC, restaurants, lawyers, and 70+ more — in every city we track.')}`, width: 1200, height: 628, alt: 'AI Visibility by Industry' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Visibility by Industry | Rankall',
    description: 'Browse AI visibility for every industry in every city we track.',
    images: [`${BASE}/api/og/marketing?title=${encodeURIComponent('AI Visibility by Industry')}&subtitle=${encodeURIComponent('Dentists, HVAC, restaurants, lawyers, and 70+ more — in every city we track.')}`],
  },
};

export default function IndustriesIndexPage() {
  const NAVY = '#0F172A';
  const BLUE = '#2563EB';
  const GRAY = '#64748B';
  const LGRAY = '#94A3B8';
  const BORDER = '#E2E8F0';
  const BG = '#F8FAFC';
  const W = '#FFFFFF';

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE}/` },
      { '@type': 'ListItem', position: 2, name: 'Industries', item: `${BASE}/industries` },
    ],
  };

  const industries = Object.entries(INDUSTRIES).sort((a, b) => a[1].label.localeCompare(b[1].label));
  const top = topCategories();

  return (
    <div style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", background: BG, minHeight: '100vh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbJsonLd) }} />
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '48px 24px 80px' }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: GRAY, marginBottom: 20 }}>
          <Link href="/" style={{ color: BLUE, textDecoration: 'none' }}>Home</Link>
          {' / '}
          <span style={{ color: NAVY }}>Industries</span>
        </nav>
        <h1 style={{ fontSize: 36, fontWeight: 900, color: NAVY, letterSpacing: '-0.02em', margin: '0 0 12px' }}>AI Visibility by Industry</h1>
        <p style={{ fontSize: 17, color: GRAY, lineHeight: 1.6, margin: '0 0 32px', maxWidth: 720 }}>
          Every industry Rankall tracks, in every city we track. Each hub lists all cities for that industry with real scan data where it exists. Prefer browsing by city?{' '}
          <Link href="/cities" style={{ color: BLUE, fontWeight: 700, textDecoration: 'none' }}>Browse all cities →</Link>
        </p>
        <h2 id="top-categories" style={{ fontSize: 22, fontWeight: 800, color: NAVY, margin: '0 0 6px' }}>Top {top.length} categories</h2>
        <p style={{ fontSize: 14, color: GRAY, lineHeight: 1.6, margin: '0 0 16px', maxWidth: 720 }}>
          The local businesses in the US and UK that invest most in growth: SEO, Google Ads and marketing.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 40 }}>
          {top.map((c, i) => (
            <Link key={c.slug} href={`/${c.slug}`} style={{ background: W, border: `1.5px solid ${BLUE}33`, borderRadius: 12, padding: '16px 20px', textDecoration: 'none', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: BLUE, minWidth: 22 }}>{String(i + 1).padStart(2, '0')}</span>
              <span>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: NAVY }}>{c.emoji} {c.plural}</span>
                <span style={{ display: 'block', fontSize: 13, color: GRAY, marginTop: 4 }}>in every city →</span>
              </span>
            </Link>
          ))}
        </div>
        <h2 id="all-industries" style={{ fontSize: 22, fontWeight: 800, color: NAVY, margin: '0 0 16px' }}>All {industries.length} industries</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {industries.map(([slug, ind]) => (
            <Link key={slug} href={`/${slug}`} style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: '16px 20px', textDecoration: 'none' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{ind.emoji} {industryPlural(ind.label)}</div>
              <div style={{ fontSize: 13, color: GRAY, marginTop: 4 }}>in every city →</div>
            </Link>
          ))}
        </div>
        <div style={{ marginTop: 32, textAlign: 'center', fontSize: 13, color: LGRAY }}>
          <Link href="/cities" style={{ color: LGRAY }}>All cities</Link>
        </div>
      </div>
    </div>
  );
}
