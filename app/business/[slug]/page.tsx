import { jsonLdString } from '@/lib/jsonLd';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { supabase, getSupabaseAdmin } from '@/lib/supabase';
import { withCanonicalImpacts } from '@/lib/fixIntelligence';
import { getTrustedBusinessContact } from '@/lib/enrichment';
import { INDUSTRIES, CITIES } from '@/app/[industry]/[city]/page';
import Logo from '@/components/Logo';

export const revalidate = 86400; // ISR: public profile data, no per-user content
// b87h: revalidate alone never took effect live — in Next 16 an
// uncached fetch opts the route out of ISR (every response was
// "private, no-store"). These pages read only public, anonymous
// data, so their fetches are force-cached on the same cadence.
export const fetchCache = 'force-cache';


const PLATFORMS = ['ChatGPT', 'Gemini', 'Google AI Overview', 'Copilot', 'Perplexity', 'Grok', 'Claude', 'DeepSeek', 'Mistral', 'Kimi', 'Groq', 'Meta AI'];

const PROFILE_FAQS: [string, string][] = [
  ['What is the AI Visibility Score?', 'The score (0-100) measures how often 12 AI platforms — ChatGPT, Gemini, Perplexity, and others — recommend this business when people ask for its type of business. It is measured from a live scan, not estimated.'],
  ['Is this your business?', 'If this is your business, claim the profile to run a fresh scan, see your full fix queue, and track your score over time.'],
  ['How can this business improve its score?', 'The top fix preview above shows the single highest-impact improvement from the latest scan. Most businesses improve by adding structured data, claiming directory profiles, and earning verified reviews.'],
];

type Business = {
  id: string;
  canonical_name: string;
  slug: string;
  industry: string | null;
  category: string | null;
  city: string | null;
  state: string | null;
  country_code: string | null;
  address: string | null;
  website: string | null;
  phone: string | null;
  latest_score: number | null;
  latest_scan_id: string | null;
  last_scanned_at: string | null;
};

type PlatformRow = { platform: string; mentioned: boolean };
type TopFix = { fix_title: string | null; predicted_impact: number | null };

async function loadBusiness(slug: string): Promise<Business | null> {
  const { data } = await supabase
    .from('businesses')
    .select('id, canonical_name, slug, industry, category, city, state, country_code, address, website, phone, latest_score, latest_scan_id, last_scanned_at')
    .eq('slug', slug)
    .eq('is_public', true)
    .maybeSingle();
  return (data as Business) ?? null;
}

async function loadPlatforms(scanId: string): Promise<PlatformRow[]> {
  // The anon key can no longer read scan rows (20261016 RLS lockdown); the
  // scan id comes from a public businesses row, and only these columns are read.
  const { data } = await getSupabaseAdmin()
    .from('rankall_platform_results')
    .select('platform, mentioned')
    .eq('scan_id', scanId);
  return (data as PlatformRow[]) ?? [];
}

async function loadTopFix(scanId: string): Promise<TopFix | null> {
  const { data } = await getSupabaseAdmin()
    .from('generated_fixes')
    .select('fix_title, fix_type')
    .eq('scan_id', scanId)
    .order('created_at', { ascending: false })
    .limit(20);
  // ax81: rank by the canonical per-fix number (same as the fix queue),
  // normalised at read time — never the stored legacy predicted_impact.
  return withCanonicalImpacts((data ?? []) as Array<{ fix_title: string | null; fix_type: string | null }>)[0] ?? null;
}

export default async function BusinessProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await loadBusiness(slug);
  if (!business) return notFound();
  // b87d: only show/publish contact details that belong to this business.
  const contact = getTrustedBusinessContact(business);

  // No fabricated 0: a profile without a stored score says "not scanned".
  const score = typeof business.latest_score === 'number' ? business.latest_score : null;
  const scoreColor = score == null ? '#6b7280' : score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444';

  const [platforms, topFix] = business.latest_scan_id
    ? await Promise.all([loadPlatforms(business.latest_scan_id), loadTopFix(business.latest_scan_id)])
    : [[], null];
  const platformByName = new Map(platforms.map((p) => [p.platform, p.mentioned]));
  const mentionedCount = platforms.filter((p) => p.mentioned).length;

  const citySlug = business.city ? business.city.toLowerCase().replace(/\s+/g, '-') : null;
  const industryUrl = business.industry && INDUSTRIES[business.industry] && citySlug && CITIES[citySlug]
    ? `/${business.industry}/${citySlug}`
    : null;
  const industryLabel = business.industry && INDUSTRIES[business.industry]
    ? `${INDUSTRIES[business.industry].plural} in ${business.city ?? ''}`.trim()
    : null;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', fontFamily: 'sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#0f1629', borderBottom: '1px solid #1e2a3a', padding: '20px 40px' }}>
        <a href="/" aria-label="RankAll home" style={{ display: 'inline-flex' }}><Logo variant="white" height={26} /></a>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString({
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        name: business.canonical_name,
        url: contact.website || `https://rankall.io/business/${business.slug}`,
        ...(contact.phone ? { telephone: contact.phone } : {}),
        ...(contact.address || business.city || business.state || business.country_code ? {
          address: {
            '@type': 'PostalAddress',
            ...(contact.address ? { streetAddress: contact.address } : {}),
            ...(business.city ? { addressLocality: business.city } : {}),
            ...(business.state ? { addressRegion: business.state } : {}),
            ...(business.country_code ? { addressCountry: business.country_code } : {}),
          },
        } : {}),
        description: score != null
          ? `${business.canonical_name} scores ${score}/100 for AI visibility across 12 AI platforms, measured by Rankall.`
          : `${business.canonical_name} — AI visibility profile on Rankall (not scanned yet).`,
      }) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: PROFILE_FAQS.map(([q, a]) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      }) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://rankall.io/' },
          { '@type': 'ListItem', position: 2, name: business.canonical_name, item: `https://rankall.io/business/${business.slug}` },
        ],
      }) }} />
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px' }}>
        <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: '#9ca3af', marginBottom: 20 }}>
          <a href="/" style={{ color: '#1B17FF', textDecoration: 'none' }}>Home</a>
          {' / '}
          <span style={{ color: '#fff' }}>{business.canonical_name}</span>
        </nav>
        {/* Business Identity */}
        <h1 style={{ color: 'white', fontSize: 32, fontWeight: 800, margin: '0 0 8px' }}>{business.canonical_name}</h1>
        <p style={{ color: '#9ca3af', fontSize: 16, margin: '0 0 32px' }}>
          {[business.industry, business.city && `${business.city}${business.state ? `, ${business.state}` : ''}`, business.country_code && business.country_code !== 'US' ? business.country_code : null]
            .filter(Boolean)
            .join(' · ')}
        </p>

        {/* AI Visibility Score Card */}
        <div style={{ background: '#0f1629', border: '1px solid #1e2a3a', borderRadius: 16, padding: 32, marginBottom: 24 }}>
          <p style={{ color: '#6b7280', fontSize: 13, textTransform: 'uppercase', letterSpacing: 2, margin: '0 0 8px' }}>AI Visibility Score</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 16 }}>
            {score != null ? (
              <>
                <span style={{ color: scoreColor, fontSize: 72, fontWeight: 900, lineHeight: 1 }}>{score}</span>
                <span style={{ color: '#4b5563', fontSize: 24 }}>/100</span>
              </>
            ) : (
              <span style={{ color: scoreColor, fontSize: 24, fontWeight: 700 }}>Not scanned yet</span>
            )}
          </div>
          <p style={{ color: '#9ca3af', fontSize: 14, margin: 0 }}>
            Tracked across 12 AI platforms{business.last_scanned_at ? ` · Last updated: ${new Date(business.last_scanned_at).toLocaleDateString()}` : ''}
          </p>
        </div>

        {/* Claim CTA */}
        <div style={{ background: '#1a1a2e', border: '1px solid #7c3aed', borderRadius: 12, padding: 24, marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <p style={{ color: 'white', fontWeight: 600, margin: '0 0 4px', fontSize: 16 }}>Is this your business?</p>
            <p style={{ color: '#9ca3af', fontSize: 14, margin: 0 }}>Claim this profile to improve your AI visibility and track your score.</p>
          </div>
          <a
            href={`/?business=${encodeURIComponent(business.canonical_name)}&city=${encodeURIComponent(business.city || '')}`}
            style={{ background: '#7c3aed', color: 'white', padding: '12px 24px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}
          >
            Claim &amp; Improve <svg viewBox="0 0 448 512" width="13" height="13" fill="#fff" aria-hidden="true" style={{verticalAlign: '-2px', marginLeft: 6}}><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
          </a>
        </div>

        {/* Per-platform breakdown (latest scan only; section hidden when the scan wrote no platform rows) */}
        {platforms.length > 0 && (
          <div style={{ background: '#0f1629', border: '1px solid #1e2a3a', borderRadius: 12, padding: 24, marginBottom: 24 }}>
            <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>AI Mentions by Platform</h2>
            <p style={{ color: '#9ca3af', fontSize: 14, margin: '0 0 16px' }}>
              Mentioned on {mentionedCount} of {PLATFORMS.length} AI platforms in the latest scan.
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
              {PLATFORMS.map((platform) => {
                const mentioned = platformByName.get(platform);
                return (
                  <li key={platform} style={{ display: 'flex', justifyContent: 'space-between', color: '#9ca3af', fontSize: 14 }}>
                    <span>{platform}</span>
                    <span style={{ color: mentioned === true ? '#22c55e' : '#6b7280', fontWeight: 600 }}>
                      {mentioned === true ? 'Mentioned' : mentioned === false ? 'Not mentioned' : 'Not in this scan'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Top fix preview (title + estimated impact only; full fix content lives behind the claim flow) */}
        {topFix?.fix_title && (
          <div style={{ background: '#0f1629', border: '1px solid #1e2a3a', borderRadius: 12, padding: 24, marginBottom: 24 }}>
            <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>Top Recommended Fix</h2>
            <p style={{ color: '#e5e7eb', fontSize: 15, margin: '0 0 8px' }}>{topFix.fix_title}</p>
            <p style={{ color: '#9ca3af', fontSize: 14, margin: 0 }}>
              {topFix.predicted_impact != null ? `Estimated impact: +${topFix.predicted_impact} pts (estimate). ` : ''}Claim this profile to see the full fix queue.
            </p>
          </div>
        )}

        {/* Business Details */}
        {(contact.website || contact.address || contact.phone) && (
          <div style={{ background: '#0f1629', border: '1px solid #1e2a3a', borderRadius: 12, padding: 24, marginBottom: 24 }}>
            <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, margin: '0 0 16px' }}>Business Information</h2>
            {contact.website && <p style={{ color: '#9ca3af', fontSize: 14, margin: '0 0 8px' }}><svg viewBox="0 0 512 512" width="14" height="14" fill="currentColor" aria-hidden="true" style={{verticalAlign: '-2px', marginRight: 6}}><path d="M352 256c0 22.2-1.2 43.6-3.3 64l-185.3 0c-2.2-20.4-3.3-41.8-3.3-64s1.2-43.6 3.3-64l185.3 0c2.2 20.4 3.3 41.8 3.3 64zm28.8-64l123.1 0c5.3 20.5 8.1 41.9 8.1 64s-2.8 43.5-8.1 64l-123.1 0c2.1-20.6 3.2-42 3.2-64s-1.1-43.4-3.2-64zm112.6-32l-116.7 0c-10-63.9-29.8-117.4-55.3-151.6c78.3 20.7 142 77.5 171.9 151.6zm-149.1 0l-176.6 0c6.1-36.4 15.5-68.6 27-94.7c10.5-23.6 22.2-40.7 33.5-51.5C239.4 3.2 248.7 0 256 0s16.6 3.2 27.8 13.8c11.3 10.8 23 27.9 33.5 51.5c11.6 26 20.9 58.2 27 94.7zm-209 0L18.6 160C48.6 85.9 112.2 29.1 190.6 8.4C165.1 42.6 145.3 96.1 135.3 160zM8.1 192l123.1 0c-2.1 20.6-3.2 42-3.2 64s1.1 43.4 3.2 64L8.1 320C2.8 299.5 0 278.1 0 256s2.8-43.5 8.1-64zM194.7 446.6c-11.6-26-20.9-58.2-27-94.6l176.6 0c-6.1 36.4-15.5 68.6-27 94.6c-10.5 23.6-22.2 40.7-33.5 51.5C272.6 508.8 263.3 512 256 512s-16.6-3.2-27.8-13.8c-11.3-10.8-23-27.9-33.5-51.5zM135.3 352c10 63.9 29.8 117.4 55.3 151.6C112.2 482.9 48.6 426.1 18.6 352l116.7 0zm358.1 0c-30 74.1-93.6 130.9-171.9 151.6c25.5-34.2 45.2-87.7 55.3-151.6l116.7 0z"/></svg> {contact.website}</p>}
            {contact.address && (
              <p style={{ color: '#9ca3af', fontSize: 14, margin: '0 0 8px' }}>
                <svg viewBox="0 0 384 512" width="14" height="14" fill="currentColor" aria-hidden="true" style={{verticalAlign: '-2px', marginRight: 6}}><path d="M215.7 499.2C267 435 384 279.4 384 192C384 86 298 0 192 0S0 86 0 192c0 87.4 117 243 168.3 307.2c12.3 15.3 35.1 15.3 47.4 0zM192 128a64 64 0 1 1 0 128 64 64 0 1 1 0-128z"/></svg> {[contact.address, business.city, business.state].filter(Boolean).join(', ')}
              </p>
            )}
            {contact.phone && <p style={{ color: '#9ca3af', fontSize: 14, margin: 0 }}><svg viewBox="0 0 512 512" width="14" height="14" fill="currentColor" aria-hidden="true" style={{verticalAlign: '-2px', marginRight: 6}}><path d="M352 256c0 22.2-1.2 43.6-3.3 64l-185.3 0c-2.2-20.4-3.3-41.8-3.3-64s1.2-43.6 3.3-64l185.3 0c2.2 20.4 3.3 41.8 3.3 64zm28.8-64l123.1 0c5.3 20.5 8.1 41.9 8.1 64s-2.8 43.5-8.1 64l-123.1 0c2.1-20.6 3.2-42 3.2-64s-1.1-43.4-3.2-64zm112.6-32l-116.7 0c-10-63.9-29.8-117.4-55.3-151.6c78.3 20.7 142 77.5 171.9 151.6zm-149.1 0l-176.6 0c6.1-36.4 15.5-68.6 27-94.7c10.5-23.6 22.2-40.7 33.5-51.5C239.4 3.2 248.7 0 256 0s16.6 3.2 27.8 13.8c11.3 10.8 23 27.9 33.5 51.5c11.6 26 20.9 58.2 27 94.7zm-209 0L18.6 160C48.6 85.9 112.2 29.1 190.6 8.4C165.1 42.6 145.3 96.1 135.3 160zM8.1 192l123.1 0c-2.1 20.6-3.2 42-3.2 64s1.1 43.4 3.2 64L8.1 320C2.8 299.5 0 278.1 0 256s2.8-43.5 8.1-64zM194.7 446.6c-11.6-26-20.9-58.2-27-94.6l176.6 0c-6.1 36.4-15.5 68.6-27 94.6c-10.5 23.6-22.2 40.7-33.5 51.5C272.6 508.8 263.3 512 256 512s-16.6-3.2-27.8-13.8c-11.3-10.8-23-27.9-33.5-51.5zM135.3 352c10 63.9 29.8 117.4 55.3 151.6C112.2 482.9 48.6 426.1 18.6 352l116.7 0zm358.1 0c-30 74.1-93.6 130.9-171.9 151.6c25.5-34.2 45.2-87.7 55.3-151.6l116.7 0z"/></svg> {contact.phone}</p>}
          </div>
        )}

        {/* FAQ */}
        <div style={{ background: '#0f1629', border: '1px solid #1e2a3a', borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, margin: '0 0 16px' }}>Frequently Asked Questions</h2>
          {PROFILE_FAQS.map(([q, a]) => (
            <div key={q} style={{ marginBottom: 16 }}>
              <p style={{ color: 'white', fontWeight: 600, fontSize: 15, margin: '0 0 4px' }}>{q}</p>
              <p style={{ color: '#9ca3af', fontSize: 14, margin: 0 }}>{a}</p>
            </div>
          ))}
        </div>

        {/* Explore more (internal links — profile is no longer a dead end) */}
        <div style={{ background: '#0f1629', border: '1px solid #1e2a3a', borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, margin: '0 0 16px' }}>Explore More</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
            {industryUrl && industryLabel && (
              <li><a href={industryUrl} style={{ color: '#a78bfa', textDecoration: 'none', fontSize: 14 }}>See all {industryLabel} →</a></li>
            )}
            <li><a href="/leaderboard" style={{ color: '#a78bfa', textDecoration: 'none', fontSize: 14 }}>Compare on the public leaderboard →</a></li>
            <li><a href="/market-index" style={{ color: '#a78bfa', textDecoration: 'none', fontSize: 14 }}>See the AI Recommendation Index →</a></li>
            <li><a href="/blog" style={{ color: '#a78bfa', textDecoration: 'none', fontSize: 14 }}>AI visibility research →</a></li>
          </ul>
        </div>

        {/* Scan your own business CTA */}
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <p style={{ color: '#6b7280', fontSize: 14, margin: '0 0 16px' }}>Want to check YOUR business AI visibility?</p>
          <a href="/" style={{ background: '#7c3aed', color: 'white', padding: '14px 32px', borderRadius: 8, textDecoration: 'none', fontWeight: 700, fontSize: 16 }}>Scan Your Business Free <svg viewBox="0 0 448 512" width="14" height="14" fill="#fff" aria-hidden="true" style={{verticalAlign: '-2px', marginLeft: 6}}><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
        </div>
      </div>
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { data: business } = await supabase
    .from('businesses')
    .select('canonical_name, city, state, industry, latest_score')
    .eq('slug', slug)
    .maybeSingle();

  if (!business) return {};

  const where = [business.city, business.state].filter(Boolean).join(', ') || 'their market';
  return {
    alternates: { canonical: `/business/${slug}` },
    title: { absolute: `${business.canonical_name} — AI Visibility Score | Rankall.io` },
    description: `${business.canonical_name} in ${where}${business.latest_score != null ? ` scores ${business.latest_score}/100 on AI visibility` : ' — AI visibility profile'}. See how often ChatGPT, Gemini, and 9 other AI platforms recommend this ${business.industry || 'local'} business.`,
  };
}
