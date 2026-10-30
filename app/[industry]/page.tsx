import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { INDUSTRIES, CITIES } from '@/lib/programmaticData';
import { getIndustryHubAggregate, MIN_PUBLIC_SAMPLE } from '@/lib/programmaticAggregates';
import { SCAN_TIME_LABEL, PLATFORMS_SCANNED } from '@/lib/publicStats';
import { jsonLdString } from '@/lib/jsonLd';
import { industryPlural } from '@/lib/industryPlural';

export const revalidate = 86400; // ISR: same cadence as programmatic pages
// b87h: revalidate alone never took effect live — in Next 16 an
// uncached fetch opts the route out of ISR (every response was
// "private, no-store"). These pages read only public, anonymous
// data, so their fetches are force-cached on the same cadence.
export const fetchCache = 'force-cache';


const BASE = 'https://rankall.io';

// Industry hub (azxg): /dentist, /hvac, … — lists every city for the
// industry, with REAL aggregate stats (total scans, avg score, per-city
// scan counts) where scan data exists. Cities without scans render as
// plain links, never with fabricated stats. This is the authority hub
// that programmatic pages link up to (and that the footer links down to):
// homepage → /dentist → /dentist/austin is 2 clicks.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ industry: string }>;
}): Promise<Metadata> {
  const { industry } = await params;
  const ind = INDUSTRIES[industry];
  if (!ind) return { title: { absolute: 'Rankall.io' } };

  const title = `AI Visibility for ${industryPlural(ind.label)} in Every City We Track`;
  const aggregate = await getIndustryHubAggregate(industry, CITIES);
  const description = aggregate
    ? `${industryPlural(ind.label)} average ${aggregate.avgScore}/100 AI visibility across ${aggregate.totalScans} scanned businesses in ${aggregate.citiesWithData.length} ${aggregate.citiesWithData.length === 1 ? 'city' : 'cities'}. See which ${ind.plural} ChatGPT, Gemini, and Perplexity recommend — in every city we track.`
    : `Not enough ${ind.plural} have been scanned in any one city yet to publish averages. Run a free AI visibility scan and see how ChatGPT, Gemini, and Perplexity rank your business.`;
  const ogImage = `${BASE}/api/og/marketing?title=${encodeURIComponent(`AI Visibility for ${industryPlural(ind.label)}`)}&subtitle=${encodeURIComponent(`See which ${ind.plural} ChatGPT, Gemini, and Perplexity recommend — in every city we track.`)}`;

  return {
    title,
    description,
    alternates: { canonical: `/${industry}` },
    // azxg: a hub with no child page above the minimum sample is a thin
    // list of noindex pages — keep it out of the index (and the sitemap).
    ...(aggregate ? {} : { robots: { index: false, follow: true } }),
    openGraph: { title, description, url: `${BASE}/${industry}`, images: [{ url: ogImage, width: 1200, height: 628, alt: title }], type: 'website' },
    twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
  };
}

export default async function IndustryHubPage({
  params,
}: {
  params: Promise<{ industry: string }>;
}) {
  const { industry } = await params;
  const ind = INDUSTRIES[industry];
  if (!ind) notFound();
  // b8ap: CITIES has two 'Aurora' (CO / IL) and two 'Hamilton' (Canada / NZ).
  // They are different cities — disambiguate the display label with the
  // state instead of deduping (which would delete real city pages).
  const labelCounts = new Map<string, number>();
  for (const cit of Object.values(CITIES)) labelCounts.set(cit.label, (labelCounts.get(cit.label) ?? 0) + 1);
  const cityDisplay = (slug: string, label: string) => {
    const state = CITIES[slug]?.state;
    return (labelCounts.get(label) ?? 0) > 1 && state ? `${label}, ${state}` : label;
  };

  const aggregate = await getIndustryHubAggregate(industry, CITIES);
  const withData = new Set((aggregate?.citiesWithData ?? []).map((c) => c.slug));
  const withoutData = Object.entries(CITIES)
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
      { '@type': 'ListItem', position: 2, name: `${industryPlural(ind.label)}`, item: `${BASE}/${industry}` },
    ],
  };

  // b87g: the hub had no FAQ at all (the city pages have both the
  // visible FAQ and its FAQPage schema). Same pattern, industry-
  // general wording; the average answer uses the hub aggregate
  // only when one is publishable.
  const faqs = [
    {
      q: `How do I improve my ${ind.label.toLowerCase()} ranking in AI search?`,
      a: `A common high-impact fix for ${ind.plural} is ${ind.topFix}. Other high-impact improvements include adding FAQ structured data, building consistent citations across directories, and generating more verified reviews. Rankall shows you the exact fixes for your specific business.`,
    },
    {
      q: `Which AI platforms matter most for ${ind.plural.toLowerCase()}?`,
      a: `It varies by business — which is why Rankall checks all ${PLATFORMS_SCANNED} platforms (including ChatGPT, Gemini, Perplexity, and Google AI Overview) in every scan, so you see exactly where you are and aren't recommended.`,
    },
    {
      q: `What is the average AI visibility score for ${ind.plural}?`,
      a: aggregate
        ? `${industryPlural(ind.label)} average ${aggregate.avgScore}/100 on the Rankall AI visibility scale, measured across ${aggregate.totalScans} scanned businesses in ${aggregate.citiesWithData.length} ${aggregate.citiesWithData.length === 1 ? 'city' : 'cities'} (each business counted once, using its latest scan). Run a free scan to see where your own business sits against that average.`
        : `Not enough ${ind.plural} have been scanned in any one city yet to publish a reliable average — Rankall only shows a city average once at least ${MIN_PUBLIC_SAMPLE} different businesses in that city have been scanned. Run a free scan to see your own score now.`,
    },
    {
      q: `How long does it take to improve AI visibility for my ${ind.label.toLowerCase()}?`,
      a: `It depends on how quickly AI platforms re-index your changes, which varies by platform. When you mark a fix as applied, Rankall runs a verification rescan about 7 days later and shows you the before/after, so you can see what actually moved.`,
    },
    {
      q: `Is Rankall free for ${ind.label.toLowerCase()}s?`,
      a: `Yes — scanning is completely free. Enter your search query, see real AI responses from all ${PLATFORMS_SCANNED} platforms, and discover who's winning. A free account gives you your full AI visibility score, trust signal breakdown, and fix queue.`,
    },
  ];

  return (
    <div style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", background: BG, minHeight: '100vh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map((faq) => ({
          '@type': 'Question',
          name: faq.q,
          acceptedAnswer: { '@type': 'Answer', text: faq.a },
        })),
      }) }} />
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '48px 24px 80px' }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: GRAY, marginBottom: 20 }}>
          <Link href="/" style={{ color: BLUE, textDecoration: 'none' }}>Home</Link>
          {' / '}
          <span style={{ color: NAVY }}>{industryPlural(ind.label)}</span>
        </nav>

        <h1 style={{ fontSize: 36, fontWeight: 900, color: NAVY, letterSpacing: '-0.02em', margin: '0 0 12px' }}>
          {ind.emoji} AI Visibility for {industryPlural(ind.label)}
        </h1>
        <p style={{ fontSize: 17, color: GRAY, lineHeight: 1.6, margin: '0 0 32px', maxWidth: 720 }}>
          {aggregate
            ? `${industryPlural(ind.label)} average ${aggregate.avgScore}/100 AI visibility across ${aggregate.totalScans} scanned businesses in ${aggregate.citiesWithData.length} ${aggregate.citiesWithData.length === 1 ? 'city' : 'cities'} — measured from real Rankall scans, never estimated.`
            : `Not enough ${ind.plural} have been scanned in any one city yet to publish averages (we need at least ${MIN_PUBLIC_SAMPLE} different businesses per city). See where your own business stands on AI.`}
        </p>

        {aggregate && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 40 }}>
            {[
              { label: 'Average visibility', value: `${aggregate.avgScore}/100` },
              { label: 'Businesses scanned', value: `${aggregate.totalScans}` },
              { label: 'Cities with scan data', value: `${aggregate.citiesWithData.length}` },
            ].map((s) => (
              <div key={s.label} style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '20px' }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: NAVY }}>{s.value}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {aggregate && aggregate.citiesWithData.length > 0 && (
          <section style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: NAVY, margin: '0 0 16px' }}>Cities with scan data</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {aggregate.citiesWithData.map((c) => (
                <Link key={c.slug} href={`/${industry}/${c.slug}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, background: W, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: '14px 20px', textDecoration: 'none' }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{industryPlural(ind.label)} in {cityDisplay(c.slug, c.label)}</span>
                  <span style={{ fontSize: 13, color: GRAY, whiteSpace: 'nowrap' }}>{c.avgScore}/100 avg · {c.scanCount} scanned</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: NAVY, margin: '0 0 16px' }}>
            {aggregate && aggregate.citiesWithData.length > 0 ? 'All other cities' : 'All cities'}
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {withoutData.map(([slug, cit]) => (
              <Link key={slug} href={`/${industry}/${slug}`} style={{ fontSize: 14, fontWeight: 600, color: BLUE, background: W, border: `1.5px solid ${BORDER}`, borderRadius: 999, padding: '8px 16px', textDecoration: 'none' }}>
                {industryPlural(ind.label)} in {cityDisplay(slug, cit.label)}
              </Link>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 48 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: NAVY, margin: '0 0 16px' }}>
            FAQ — {industryPlural(ind.label)}
          </h2>
          {faqs.map((faq, i) => (
            <details key={i} style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: '16px 20px', marginBottom: 10 }}>
              <summary style={{ fontSize: 15, fontWeight: 700, color: NAVY, cursor: 'pointer' }}>{faq.q}</summary>
              <p style={{ fontSize: 14, color: GRAY, lineHeight: 1.7, marginTop: 12 }}>{faq.a}</p>
            </details>
          ))}
        </section>

        <div style={{ marginTop: 48, background: NAVY, borderRadius: 16, padding: '32px', textAlign: 'center' }}>
          <p style={{ fontSize: 20, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>Is your {ind.label.toLowerCase()} visible on AI?</p>
          <p style={{ fontSize: 14, color: '#94A3B8', margin: '0 0 20px' }}>Free scan · No credit card · {SCAN_TIME_LABEL}</p>
          <Link href="/" style={{ display: 'inline-block', background: BLUE, borderRadius: 12, padding: '14px 32px', fontSize: 16, fontWeight: 800, color: '#fff', textDecoration: 'none' }}>
            Scan my {ind.label.toLowerCase()} free
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
