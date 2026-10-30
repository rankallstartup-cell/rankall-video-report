import type { Metadata } from 'next';
import Link from 'next/link';
import { CITIES } from '@/lib/programmaticData';
import { jsonLdString } from '@/lib/jsonLd';

const BASE = 'https://rankall.io';

// Hub index (azxg): /cities — every city hub in one place.
// Pure navigation (no DB queries): per-city stats live on the hubs.
export const metadata: Metadata = {
  title: { absolute: 'AI Visibility by City | Rankall' },
  description: 'Browse AI visibility for businesses in every city and district we track — New York, Los Angeles, Chicago, Austin, and 280+ more. See which businesses ChatGPT, Gemini, and Perplexity recommend.',
  alternates: { canonical: '/cities' },
  openGraph: {
    title: 'AI Visibility by City | Rankall',
    description: 'Browse AI visibility for businesses in every city and district we track — New York, Los Angeles, Chicago, Austin, and 280+ more.',
    url: `${BASE}/cities`,
    images: [{ url: `${BASE}/api/og/marketing?title=${encodeURIComponent('AI Visibility by City')}&subtitle=${encodeURIComponent('New York, Los Angeles, Chicago, Austin, and 280+ more cities.')}`, width: 1200, height: 628, alt: 'AI Visibility by City' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI Visibility by City | Rankall',
    description: 'Browse AI visibility for businesses in every city and district we track.',
    images: [`${BASE}/api/og/marketing?title=${encodeURIComponent('AI Visibility by City')}&subtitle=${encodeURIComponent('New York, Los Angeles, Chicago, Austin, and 280+ more cities.')}`],
  },
};

export default function CitiesIndexPage() {
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
      { '@type': 'ListItem', position: 2, name: 'Cities', item: `${BASE}/cities` },
    ],
  };

  const cities = Object.entries(CITIES).sort((a, b) => a[1].label.localeCompare(b[1].label));

  return (
    <div style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", background: BG, minHeight: '100vh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbJsonLd) }} />
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '48px 24px 80px' }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: GRAY, marginBottom: 20 }}>
          <Link href="/" style={{ color: BLUE, textDecoration: 'none' }}>Home</Link>
          {' / '}
          <span style={{ color: NAVY }}>Cities</span>
        </nav>
        <h1 style={{ fontSize: 36, fontWeight: 900, color: NAVY, letterSpacing: '-0.02em', margin: '0 0 12px' }}>AI Visibility by City</h1>
        <p style={{ fontSize: 17, color: GRAY, lineHeight: 1.6, margin: '0 0 32px', maxWidth: 720 }}>
          Every city and district Rankall tracks, across every industry. Each hub lists all industries for that city with real scan data where it exists. Prefer browsing by industry?{' '}
          <Link href="/industries" style={{ color: BLUE, fontWeight: 700, textDecoration: 'none' }}>Browse all industries →</Link>
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {cities.map(([slug, cit]) => (
            <Link key={slug} href={`/cities/${slug}`} style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: '16px 20px', textDecoration: 'none' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{cit.label}</div>
              {/* b896: 'Washington DC' already ends with its region —
                  printing both read "Washington DC DC". */}
              <div style={{ fontSize: 13, color: GRAY, marginTop: 4 }}>{cit.label.endsWith(` ${cit.country ?? cit.state}`) ? 'all industries →' : `${cit.country ?? cit.state} · all industries →`}</div>
            </Link>
          ))}
        </div>
        <div style={{ marginTop: 32, textAlign: 'center', fontSize: 13, color: LGRAY }}>
          <Link href="/industries" style={{ color: LGRAY }}>All industries</Link>
        </div>
      </div>
    </div>
  );
}
