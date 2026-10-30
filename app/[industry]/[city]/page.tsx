import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getComboAggregate, MIN_PUBLIC_SAMPLE } from '@/lib/programmaticAggregates';
import { PLATFORMS_SCANNED, SCAN_TIME_LABEL } from '@/lib/publicStats';

const BASE = 'https://rankall.io';

// ── Static data ────────────────────────────────────────────────────────────────

// azxg: INDUSTRIES + CITIES now live in lib/programmaticData.tsx (shared
// with hub pages, sitemap, and footers). Re-exported so the existing
// sitemap import from this page keeps working.
import { INDUSTRIES, CITIES } from '@/lib/programmaticData';
import { jsonLdString } from '@/lib/jsonLd';
import { industryPlural } from '@/lib/industryPlural';
export { INDUSTRIES, CITIES } from '@/lib/programmaticData';

export const revalidate = 86400; // ISR: render on demand, cache 24h
// b87h: revalidate alone never took effect live — in Next 16 an
// uncached fetch opts the route out of ISR (every response was
// "private, no-store"). These pages read only public, anonymous
// data, so their fetches are force-cached on the same cadence.
export const fetchCache = 'force-cache';


// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: Promise<{ industry: string; city: string }> }
): Promise<Metadata> {
  const { industry, city } = await params;
  const ind = INDUSTRIES[industry];
  const cit = CITIES[city];
  if (!ind || !cit) return { title: { absolute: 'Rankall.io' } };

  const cityDisplay = cit.country ? `${cit.label}, ${cit.country}` : `${cit.label}, ${cit.state}`;
  const title = `AI Visibility for ${industryPlural(ind.label)} in ${cityDisplay}`;
  // azxc (ported from ax8c): the average below is REAL (measured from
  // rankall_scans for this exact city + industry), never the old
  // hardcoded per-industry avgScore.
  const aggregate = await getComboAggregate(industry, city, cit.label, CITIES);
  if (!aggregate) {
    // Fewer than MIN_PUBLIC_SAMPLE distinct businesses scanned (azxc):
    // noindex + honest description with no numbers. No OG score override
    // either — the page inherits the root layout's default OG image.
    return {
      title,
      description: `Not enough ${ind.plural} in ${cityDisplay} have been scanned yet to publish an average. Run a free AI visibility scan and see how ChatGPT, Gemini, and Perplexity rank your business.`,
      robots: { index: false, follow: true },
      alternates: { canonical: `/${industry}/${city}` },
    };
  }
  const desc = `${ind.plural.charAt(0).toUpperCase() + ind.plural.slice(1)} in ${cityDisplay} avg ${aggregate.avgScore}/100 AI visibility score across ${aggregate.scanCount} scanned businesses. See who ChatGPT, Gemini, and Perplexity recommend — and how to beat them.`;
  // Round 2: og:image AND twitter:image both come from the colocated
  // opengraph-image.tsx / twitter-image.tsx (file conventions), so no
  // image URLs are set here — the old twitter.images pointed at a
  // different card (the og report route) than og:image.
  return {
    title,
    description: desc,
    alternates: { canonical: `/${industry}/${city}` },
    openGraph: {
      title,
      description: desc,
      url: `${BASE}/${industry}/${city}`,
      type: 'website',
    },
    twitter: { card: 'summary_large_image', title, description: desc },
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function IndustryCityPage(
  { params }: { params: Promise<{ industry: string; city: string }> }
) {
  const { industry, city } = await params;
  const ind = INDUSTRIES[industry];
  const cit = CITIES[city];

  if (!ind || !cit) {
    notFound();
  }

  // azxc (ported from ax8c): real aggregate for this exact city +
  // industry (avg score, scan count, top competitor, per-platform
  // mention rates) — or null when fewer than MIN_PUBLIC_SAMPLE distinct
  // businesses in this combo have been scanned. The old code queried a `competitor` column that does
  // not exist on rankall_scans, so the query 400'd and topCompetitor
  // was silently null; the lib uses competitor_name.
  const aggregate = await getComboAggregate(industry, city, cit.label, CITIES);
  const topCompetitor = aggregate?.topCompetitor ?? null;

  const scanQuery = ind.queryTemplate.replace('{city}', cit.country ? `${cit.label} ${cit.country}` : cit.label);
  // azxc: the old "monthly revenue gap" stat multiplied a hardcoded
  // per-industry avgOrder by a made-up 8 customers/point, and the "+N pts"
  // top-fix uplift was a fixed per-industry constant — neither was derived
  // from data, so both are gone. Only measured numbers are shown.
  const topPlatform = aggregate?.platformRates[0] ?? null;

  const NAVY = '#0F172A';
  const BLUE = '#2563EB';
  const GREEN = '#059669';
  const RED = '#DC2626';
  const GRAY = '#64748B';
  const LGRAY = '#94A3B8';
  const BORDER = '#E2E8F0';
  const BG = '#F8FAFC';
  const W = '#FFFFFF';
  const PURPLE = '#7C3AED';
  const AMBER = '#D97706';

  const nearbyIndustries = Object.entries(INDUSTRIES)
    .filter(([k]) => k !== industry)
    .slice(0, 4);

  const nearbyCities = (cit.nearby || [])
    .filter(c => CITIES[c])
    .slice(0, 3);

  const faqs = [
    {
      q: `How do I improve my ${ind.label.toLowerCase()} ranking in AI search in ${cit.label}?`,
      a: `A common high-impact fix for ${ind.plural} is ${ind.topFix}. Other high-impact improvements include adding FAQ structured data, building consistent citations across directories, and generating more verified reviews. Rankall shows you the exact fixes for your specific business.`,
    },
    {
      q: `Which AI platforms matter most for ${ind.plural} in ${cit.label}?`,
      a: topPlatform
        ? `Across the ${aggregate!.scanCount} ${ind.plural} in ${cit.label} that Rankall has scanned, ${topPlatform.platform} recommended them most often (${topPlatform.mentionRate}% of scans). Rankall checks all ${PLATFORMS_SCANNED} platforms in every scan so you see the complete picture for your own business.`
        : `It varies by business — which is why Rankall checks all ${PLATFORMS_SCANNED} platforms (including ChatGPT, Gemini, Perplexity, and Google AI Overview) in every scan, so you see exactly where you are and aren't recommended.`,
    },
    {
      q: `What is the average AI visibility score for ${ind.plural} in ${cit.label}?`,
      a: aggregate
        ? `${ind.plural.charAt(0).toUpperCase() + ind.plural.slice(1)} in ${cit.label} average ${aggregate.avgScore}/100 on the Rankall AI visibility scale, measured across ${aggregate.scanCount} scanned businesses (each business counted once, using its latest scan). Run a free scan to see where your own business sits against that average.`
        : `Not enough ${ind.plural} in ${cit.label} have been scanned yet to publish a reliable average — Rankall only shows a city average once at least ${MIN_PUBLIC_SAMPLE} different businesses have been scanned. Run a free scan to see your own score now.`,
    },
    {
      q: `How long does it take to improve AI visibility for my ${ind.label.toLowerCase()} in ${cit.label}?`,
      a: `It depends on how quickly AI platforms re-index your changes, which varies by platform. When you mark a fix as applied, Rankall runs a verification rescan about 7 days later and shows you the before/after, so you can see what actually moved.`,
    },
    {
      q: `Is Rankall free for ${ind.plural} in ${cit.label}?`,
      a: `Yes — scanning is completely free. Enter your search query, see real AI responses from all ${PLATFORMS_SCANNED} platforms, and discover who's winning. A free account gives you your full AI visibility score, trust signal breakdown, and fix queue.`,
    },
  ];

  return (
    <div style={{ fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif", background: BG, minHeight: '100vh' }}>

      {/* NAV */}      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rankall.io/' },
          { '@type': 'ListItem', position: 2, name: `${industryPlural(ind.label)} in ${cit.label}`, item: `${BASE}/${industry}/${city}` },
        ],
      }) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqs.map((faq) => ({
          '@type': 'Question',
          name: faq.q,
          acceptedAnswer: { '@type': 'Answer', text: faq.a },
        })),
      }) }} />
      <nav aria-label="Breadcrumb" style={{ padding: '12px 24px 0', fontSize: 13, color: GRAY }}>
        <a href="/" style={{ color: BLUE, textDecoration: 'none' }}>Home</a>
        {' / '}
        <span style={{ color: NAVY }}>{industryPlural(ind.label)} in {cit.label}</span>
      </nav>

      {/* Header: the shared site header (components/SiteChrome.tsx) renders above. */}

      {/* HERO */}
      <div style={{ background: NAVY, padding: '60px 24px 48px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(37,99,235,0.2)', border: '1px solid rgba(37,99,235,0.4)', borderRadius: 100, padding: '6px 16px', marginBottom: 20 }}>
            <span style={{ fontSize: 20, display:'inline-flex' }}>{ind.icon}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#93C5FD' }}>{industryPlural(ind.label)} · {cit.label}, {cit.state}</span>
          </div>
          <h1 style={{ fontSize: 44, fontWeight: 900, color: '#fff', letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 16 }}>
            AI Visibility for {industryPlural(ind.label)}<br />in {cit.label}, {cit.state}
          </h1>
          <p style={{ fontSize: 18, color: '#94A3B8', lineHeight: 1.7, marginBottom: 32, maxWidth: 580, margin: '0 auto 32px' }}>
            When a customer asks ChatGPT or Gemini to recommend a {ind.label.toLowerCase()} in {cit.label} — does your business show up?
          </p>

          {/* Primary CTA button */}
          <a
            href={`/?q=${encodeURIComponent(scanQuery)}`}
            style={{ display: 'inline-block', background: BLUE, borderRadius: 14, padding: '18px 40px', fontSize: 18, fontWeight: 800, color: '#fff', textDecoration: 'none', boxShadow: '0 8px 30px rgba(37,99,235,0.5)', letterSpacing: '-0.01em' }}
          >
            Scan your {ind.label.toLowerCase()} in {cit.label} free <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
          </a>
          <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
            {[`Takes ${SCAN_TIME_LABEL}`, 'No signup required', `${PLATFORMS_SCANNED} AI platforms checked`].map((t, i) => (
              <span key={i} style={{ fontSize: 13, color: '#64748B', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ color: '#10B981', display:'inline-flex' }}><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg></span> {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* azxc: no-data banner — fewer than MIN_PUBLIC_SAMPLE distinct
          businesses scanned for this combo. The page stays useful
          (guidance + scan CTA) but publishes no numbers. */}
      {!aggregate && (
        <div style={{ background: '#FFFBEB', borderBottom: '1.5px solid #FDE68A', padding: '20px 24px', textAlign: 'center' }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#92400E', margin: 0 }}>
            Not enough {ind.plural} in {cit.label} have been scanned yet to publish an average.
          </p>
          <p style={{ fontSize: 13, color: '#78716C', margin: '6px 0 0' }}>
            We show a city average once at least {MIN_PUBLIC_SAMPLE} different businesses have been scanned. Your own scan is free.
          </p>
        </div>
      )}

      {/* STATS ROW */}
      <div style={{ background: W, borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 0 }}>
          {[
            { num: aggregate ? `${aggregate.avgScore}/100` : '—', label: aggregate ? `Avg score for ${industryPlural(ind.label)} in ${cit.label}` : `Not enough ${industryPlural(ind.label)} scanned in ${cit.label} yet`, color: aggregate && aggregate.avgScore < 35 ? RED : AMBER },
            { num: aggregate ? `${aggregate.scanCount}` : '—', label: aggregate ? 'Businesses measured (latest scan each)' : `Average published from ${MIN_PUBLIC_SAMPLE} businesses`, color: NAVY },
            { num: `${PLATFORMS_SCANNED}`, label: 'AI platforms checked in every scan', color: BLUE },
          ].map((s, i) => (
            <div key={i} style={{ padding: '24px', textAlign: 'center', borderRight: i < 2 ? `1px solid ${BORDER}` : 'none' }}>
              <p style={{ fontSize: 28, fontWeight: 900, color: s.color, letterSpacing: '-0.03em', marginBottom: 4 }}>{s.num}</p>
              <p style={{ fontSize: 12, color: GRAY, lineHeight: 1.4 }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '48px 24px' }}>

        {/* TOP COMPETITOR */}
        {topCompetitor && (
          <div style={{ background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: 16, padding: '24px 28px', marginBottom: 32 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: RED, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Leading competitor in AI recommendations</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 4 }}>{topCompetitor}</p>
                <p style={{ fontSize: 14, color: GRAY }}>Currently winning AI recommendations for {ind.plural} in {cit.label}</p>
              </div>
              <a href={`/?q=${encodeURIComponent(scanQuery)}`} style={{ background: BLUE, borderRadius: 10, padding: '12px 20px', fontSize: 14, fontWeight: 700, color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                Beat them <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
              </a>
            </div>
          </div>
        )}

        {/* azxc (ported from ax8c): per-platform mention rates — real,
            measured from this combo's scans. Omitted entirely when no
            platform rows exist. */}
        {aggregate && aggregate.platformRates.length > 0 && (
          <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '28px', marginBottom: 32 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: NAVY, marginBottom: 8 }}>How often AI platforms recommend {ind.plural} in {cit.label}</h2>
            <p style={{ fontSize: 14, color: GRAY, marginBottom: 20 }}>
              Share of scanned {ind.plural} that each platform recommended, measured across {aggregate.scanCount} scanned businesses in {cit.label}.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {aggregate.platformRates.map((pr) => (
                <div key={pr.platform} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: NAVY, width: 140 }}>{pr.platform}</span>
                  <div style={{ flex: 1, height: 10, background: '#F1F5F9', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: `${pr.mentionRate}%`, height: '100%', background: BLUE, borderRadius: 999 }} />
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: NAVY, width: 44, textAlign: 'right' }}>{pr.mentionRate}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* HOW RANKALL WORKS FOR THIS INDUSTRY */}
        <div style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 28, fontWeight: 900, color: NAVY, letterSpacing: '-0.03em', marginBottom: 8 }}>
            How Rankall works for {ind.plural} in {cit.label}
          </h2>
          <p style={{ fontSize: 15, color: GRAY, lineHeight: 1.7, marginBottom: 32 }}>
            When someone in {cit.label} asks ChatGPT &quot;best {ind.label.toLowerCase()} near me&quot; or asks Perplexity &quot;{scanQuery.toLowerCase()}&quot; — Rankall captures the real AI response and shows you exactly what they see.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(200px,100%),1fr))', gap: 16 }}>
            {[
              { n:'01', color: BLUE, bg:'#EFF6FF', border:'#BFDBFE', title:`Scan "${scanQuery}"`, desc:`We fire that exact query across all ${PLATFORMS_SCANNED} AI platforms and capture every response. Real data, not estimates.` },
              { n:'02', color: PURPLE, bg:'#F5F3FF', border:'#DDD6FE', title:`See who wins`, desc:`Find out which ${ind.plural} in ${cit.label} are being recommended — and on which platforms you're invisible.` },
              { n:'03', color: GREEN, bg:'#ECFDF5', border:'#A7F3D0', title:`Fix the gaps`, desc:`Get generated fixes specific to your ${ind.label.toLowerCase()} — ${ind.topFix}, review strategy, structured data. Ready to paste.` },
            ].map((p, i) => (
              <div key={i} style={{ background: p.bg, border: `1.5px solid ${p.border}`, borderRadius: 14, padding: '20px' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: p.color, letterSpacing: '0.1em' }}>{p.n}</span>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: NAVY, margin: '8px 0' }}>{p.title}</h3>
                <p style={{ fontSize: 13, color: GRAY, lineHeight: 1.65 }}>{p.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* PLATFORM GRID */}
        <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '28px', marginBottom: 48 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: NAVY, marginBottom: 8 }}>{PLATFORMS_SCANNED} AI platforms we scan for {ind.plural} in {cit.label}</h2>
          <p style={{ fontSize: 14, color: GRAY, marginBottom: 20 }}>Real queries. Real responses. Every scan checks all {PLATFORMS_SCANNED} simultaneously.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[
              {name:'ChatGPT',c:'#10A37F'},{name:'Gemini',c:'#4285F4'},{name:'Perplexity',c:'#20808D'},
              {name:'Copilot',c:'#0078D4'},{name:'Grok',c:'#334155'},{name:'Claude',c:'#CC785C'},
              {name:'DeepSeek',c:'#4D6BFE'},{name:'Mistral',c:'#FF7000'},{name:'Kimi',c:'#6366F1'},
              {name:'Groq',c:'#F55036'},{name:'Google AI',c:'#EA4335'},
            ].map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, background: BG, border: `1px solid ${BORDER}`, borderRadius: 100, padding: '6px 14px' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: p.c }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{p.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 28, fontWeight: 900, color: NAVY, letterSpacing: '-0.03em', marginBottom: 32 }}>
            FAQ — {industryPlural(ind.label)} in {cit.label}
          </h2>
          {faqs.map((faq, i) => (
            <details key={i} style={{ borderBottom: `1px solid ${BORDER}`, padding: '16px 0' }}>
              <summary style={{ fontSize: 15, fontWeight: 700, color: NAVY, cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {faq.q}
                <span style={{ fontSize: 20, color: LGRAY, marginLeft: 16, flexShrink: 0 }}>+</span>
              </summary>
              <p style={{ fontSize: 14, color: GRAY, lineHeight: 1.7, marginTop: 12, paddingRight: 40 }}>{faq.a}</p>
            </details>
          ))}
        </div>

        {/* INTERNAL LINKS */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

          {/* Same city, other industries */}
          <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '20px' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Other industries in {cit.label}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* azxg: this page's city hub */}
              <a href={`/cities/${city}`} style={{ fontSize: 14, color: BLUE, textDecoration: 'none', fontWeight: 600, padding: '4px 0' }}>
                All industries in {cit.label} <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
              </a>
              {nearbyIndustries.map(([slug, data]) => (
                <a key={slug} href={`/${slug}/${city}`} style={{ fontSize: 14, color: BLUE, textDecoration: 'none', fontWeight: 600, padding: '4px 0' }}>
                  {data.icon} AI Visibility for {industryPlural(data.label)} in {cit.label} <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
                </a>
              ))}
            </div>
          </div>

          {/* Same industry, nearby cities */}
          <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '20px' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>{industryPlural(ind.label)} in nearby cities</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {nearbyCities.filter(c => CITIES[c]).map(c => (
                <a key={c} href={`/${industry}/${c}`} style={{ fontSize: 14, color: BLUE, textDecoration: 'none', fontWeight: 600, padding: '4px 0' }}>
                  {ind.icon} {industryPlural(ind.label)} in {CITIES[c].label} <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
                </a>
              ))}
              {/* azxg: this page's industry hub */}
              <a href={`/${industry}`} style={{ fontSize: 14, color: BLUE, textDecoration: 'none', fontWeight: 600, padding: '4px 0' }}>
                {ind.icon} All {industryPlural(ind.label)} in every city <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
              </a>
              <a href={`/leaderboard?industry=${industry}&city=${city}`} style={{ fontSize: 14, color: BLUE, textDecoration: 'none', fontWeight: 600, padding: '4px 0' }}>
                <svg viewBox="0 0 576 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M400 0L176 0c-26.5 0-48.1 21.8-47.1 48.2c.2 5.3 .4 10.6 .7 15.8L24 64C10.7 64 0 74.7 0 88c0 92.6 33.5 157 78.5 200.7c44.3 43.1 98.3 64.8 138.1 75.8c23.4 6.5 39.4 26 39.4 45.6c0 20.9-17 37.9-37.9 37.9L192 448c-17.7 0-32 14.3-32 32s14.3 32 32 32l192 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-26.1 0C337 448 320 431 320 410.1c0-19.6 15.9-39.2 39.4-45.6c39.9-11 93.9-32.7 138.2-75.8C542.5 245 576 180.6 576 88c0-13.3-10.7-24-24-24L446.4 64c.3-5.2 .5-10.4 .7-15.8C448.1 21.8 426.5 0 400 0zM48.9 112l84.4 0c9.1 90.1 29.2 150.3 51.9 190.6c-24.9-11-50.8-26.5-73.2-48.3c-32-31.1-58-76-63-142.3zM464.1 254.3c-22.4 21.8-48.3 37.3-73.2 48.3c22.7-40.3 42.8-100.5 51.9-190.6l84.4 0c-5.1 66.3-31.1 111.2-63 142.3z"/></svg> {ind.label} leaderboard in {cit.label} <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
              </a>
            </div>
          </div>
        </div>

      </div>

      {/* BOTTOM CTA */}
      <div style={{ background: NAVY, padding: '72px 24px', marginTop: 40 }}>
        <div style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#93C5FD', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 16 }}>Free · No credit card · {SCAN_TIME_LABEL}</p>
          <h2 style={{ fontSize: 36, fontWeight: 900, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: 12 }}>
            Is your {ind.label.toLowerCase()} visible<br />on AI in {cit.label}?
          </h2>
          <p style={{ fontSize: 16, color: '#94A3B8', marginBottom: 12 }}>
            {aggregate ? (
              <>{ind.plural.charAt(0).toUpperCase() + ind.plural.slice(1)} in {cit.label} average <strong style={{ color: '#fff' }}>{aggregate.avgScore}/100</strong> AI visibility across {aggregate.scanCount} scanned businesses.</>
            ) : (
              <>Not enough {ind.plural} in {cit.label} have been scanned yet to publish an average — see where you stand first.</>
            )}
          </p>
          <p style={{ fontSize: 14, color: '#64748B', marginBottom: 32 }}>See exactly where you stand — and how to beat every competitor.</p>
          <a
            href={`/?q=${encodeURIComponent(scanQuery)}`}
            style={{ display: 'inline-block', background: BLUE, borderRadius: 14, padding: '18px 44px', fontSize: 18, fontWeight: 800, color: '#fff', textDecoration: 'none', boxShadow: '0 8px 30px rgba(37,99,235,0.5)', letterSpacing: '-0.01em', marginBottom: 16 }}
          >
            Scan my {ind.label.toLowerCase()} in {cit.label} <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
          </a>
          <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
            {['No credit card', 'No signup to scan', `Results in ${SCAN_TIME_LABEL}`].map((t, i) => (
              <span key={i} style={{ fontSize: 13, color: '#475569' }}>· {t}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Footer: the shared site footer (components/SiteChrome.tsx) renders below. */}

    </div>
  );
}
