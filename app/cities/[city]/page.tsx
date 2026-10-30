import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { INDUSTRIES, CITIES } from '@/lib/programmaticData';
import { getCityHubAggregate, MIN_PUBLIC_SAMPLE } from '@/lib/programmaticAggregates';
import { SCAN_TIME_LABEL } from '@/lib/publicStats';
import { jsonLdString } from '@/lib/jsonLd';
import { industryPlural } from '@/lib/industryPlural';

export const revalidate = 86400; // ISR: same cadence as programmatic pages
// b87h: revalidate alone never took effect live — in Next 16 an
// uncached fetch opts the route out of ISR (every response was
// "private, no-store"). These pages read only public, anonymous
// data, so their fetches are force-cached on the same cadence.
export const fetchCache = 'force-cache';


const BASE = 'https://rankall.io';

// City hub (azxg): /cities/chicago, /cities/austin, … — lists every
// industry for the city, with REAL aggregate stats where scan data exists.
// Industries without scans render as plain links, never with fabricated
// stats. (City hubs live under /cities/ because /[industry] already owns
// the root dynamic segment — /chicago would collide with /dentist.)

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string }>;
}): Promise<Metadata> {
  const { city } = await params;
  const cit = CITIES[city];
  if (!cit) return { title: { absolute: 'Rankall.io' } };

  const cityDisplay = cit.country ? `${cit.label}, ${cit.country}` : `${cit.label}, ${cit.state}`;
  const title = `AI Visibility for Businesses in ${cityDisplay}`;
  const aggregate = await getCityHubAggregate(city, cit.label, CITIES, Object.keys(INDUSTRIES));
  const description = aggregate
    ? `Businesses in ${cityDisplay} average ${aggregate.avgScore}/100 AI visibility across ${aggregate.totalScans} scanned businesses in ${aggregate.industriesWithData.length} ${aggregate.industriesWithData.length === 1 ? 'industry' : 'industries'}. See which businesses ChatGPT, Gemini, and Perplexity recommend — in ${cit.label}.`
    : `Not enough businesses in ${cityDisplay} have been scanned yet to publish averages. Run a free AI visibility scan and see how ChatGPT, Gemini, and Perplexity rank your business.`;
  const ogImage = `${BASE}/api/og/marketing?title=${encodeURIComponent(`AI Visibility in ${cit.label}`)}&subtitle=${encodeURIComponent(`See which businesses in ${cit.label} ChatGPT, Gemini, and Perplexity recommend.`)}`;

  return {
    title,
    description,
    alternates: { canonical: `/cities/${city}` },
    // azxg: a hub with no child page above the minimum sample is a thin
    // list of noindex pages — keep it out of the index (and the sitemap).
    ...(aggregate ? {} : { robots: { index: false, follow: true } }),
    openGraph: { title, description, url: `${BASE}/cities/${city}`, images: [{ url: ogImage, width: 1200, height: 628, alt: title }], type: 'website' },
    twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
  };
}

export default async function CityHubPage({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const { city } = await params;
  const cit = CITIES[city];
  if (!cit) notFound();

  const cityDisplay = cit.country ? `${cit.label}, ${cit.country}` : `${cit.label}, ${cit.state}`;
  const aggregate = await getCityHubAggregate(city, cit.label, CITIES, Object.keys(INDUSTRIES));
  const withData = new Set((aggregate?.industriesWithData ?? []).map((i) => i.slug));
  const withoutData = Object.entries(INDUSTRIES)
    .filter(([slug]) => !withData.has(slug))
    .sort((a, b) => a[1].label.localeCompare(b[1].label));

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
      { '@type': 'ListItem', position: 3, name: cit.label, item: `${BASE}/cities/${city}` },
    ],
  };

  return (
    <div style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", background: BG, minHeight: '100vh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbJsonLd) }} />
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '48px 24px 80px' }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: GRAY, marginBottom: 20 }}>
          <Link href="/" style={{ color: BLUE, textDecoration: 'none' }}>Home</Link>
          {' / '}
          <Link href="/cities" style={{ color: BLUE, textDecoration: 'none' }}>Cities</Link>
          {' / '}
          <span style={{ color: NAVY }}>{cit.label}</span>
        </nav>

        <h1 style={{ fontSize: 36, fontWeight: 900, color: NAVY, letterSpacing: '-0.02em', margin: '0 0 12px' }}>
          AI Visibility in {cityDisplay}
        </h1>
        <p style={{ fontSize: 17, color: GRAY, lineHeight: 1.6, margin: '0 0 32px', maxWidth: 720 }}>
          {aggregate
            ? `Businesses in ${cityDisplay} average ${aggregate.avgScore}/100 AI visibility across ${aggregate.totalScans} scanned businesses in ${aggregate.industriesWithData.length} ${aggregate.industriesWithData.length === 1 ? 'industry' : 'industries'} — measured from real Rankall scans, never estimated.`
            : `Not enough businesses in ${cityDisplay} have been scanned yet to publish averages (we need at least ${MIN_PUBLIC_SAMPLE} different businesses per industry). See where your own business stands on AI.`}
        </p>

        {aggregate && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 40 }}>
            {[
              { label: 'Average visibility', value: `${aggregate.avgScore}/100` },
              { label: 'Businesses scanned', value: `${aggregate.totalScans}` },
              { label: 'Industries with scan data', value: `${aggregate.industriesWithData.length}` },
            ].map((s) => (
              <div key={s.label} style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '20px' }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: NAVY }}>{s.value}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {aggregate && aggregate.industriesWithData.length > 0 && (
          <section style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: NAVY, margin: '0 0 16px' }}>Industries with scan data in {cit.label}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {aggregate.industriesWithData.map((i) => {
                const ind = INDUSTRIES[i.slug];
                return (
                  <Link key={i.slug} href={`/${i.slug}/${city}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, background: W, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: '14px 20px', textDecoration: 'none' }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{ind ? `${industryPlural(ind.label)} in ${cit.label}` : `${i.slug} in ${cit.label}`}</span>
                    <span style={{ fontSize: 13, color: GRAY, whiteSpace: 'nowrap' }}>{i.avgScore}/100 avg · {i.scanCount} scanned</span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        <section>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: NAVY, margin: '0 0 16px' }}>
            {aggregate && aggregate.industriesWithData.length > 0 ? 'All other industries' : 'All industries'}
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {withoutData.map(([slug, ind]) => (
              <Link key={slug} href={`/${slug}/${city}`} style={{ fontSize: 14, fontWeight: 600, color: BLUE, background: W, border: `1.5px solid ${BORDER}`, borderRadius: 999, padding: '8px 16px', textDecoration: 'none' }}>
                {industryPlural(ind.label)} in {cit.label}
              </Link>
            ))}
          </div>
        </section>

        <div style={{ marginTop: 48, background: NAVY, borderRadius: 16, padding: '32px', textAlign: 'center' }}>
          <p style={{ fontSize: 20, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>Is your business visible on AI in {cit.label}?</p>
          <p style={{ fontSize: 14, color: '#94A3B8', margin: '0 0 20px' }}>Free scan · No credit card · {SCAN_TIME_LABEL}</p>
          <Link href="/" style={{ display: 'inline-block', background: BLUE, borderRadius: 12, padding: '14px 32px', fontSize: 16, fontWeight: 800, color: '#fff', textDecoration: 'none' }}>
            Scan my business free
          </Link>
        </div>

        <div style={{ marginTop: 32, textAlign: 'center', fontSize: 13, color: LGRAY }}>
          <Link href="/industries" style={{ color: LGRAY }}>All industries</Link>
          {' · '}
          <Link href="/cities" style={{ color: LGRAY }}>All cities</Link>
        </div>
      </div>
    </div>
  );
}
