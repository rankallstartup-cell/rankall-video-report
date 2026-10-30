import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, DM_Sans } from 'next/font/google';
import './globals.css';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import AnnouncementBar from '@/components/AnnouncementBar';
import TimedPopup from '@/components/TimedPopup';
import ExitIntentPopup from '@/components/ExitIntentPopup';
import Chatbot from '@/components/Chatbot';
import PostHogProvider from '@/components/PostHogProvider';
import CountryBadge from '@/components/CountryBadge';
import { jsonLdString } from '@/lib/jsonLd';
import { SOCIAL_PROFILE_URLS } from '@/lib/socialLinks';

import { PLATFORMS_SCANNED, SCAN_TIME_LABEL } from '@/lib/publicStats';
import { isProdRankallDeployment } from '@/lib/planConfig';

// b87h: brand fonts via next/font (self-hosted, non-render-blocking).
// Replaces the old render-blocking Google Fonts <link> tags — same
// families (globals.css body font-family is unchanged), now served
// from our own domain with display=swap.
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
});
const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-dm-sans',
  display: 'swap',
});

function isKnownNonProdDeployment(): boolean {
  const productionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL;
  if (!productionUrl) return false;
  return !isProdRankallDeployment(productionUrl, undefined);
}

const IS_DEV = process.env.NODE_ENV !== 'production';

// ax75/azxh: timing + platform count come from lib/publicStats.ts (the old
// copy promised a 60-second scan — the scan route alone may take up to 60s
// after enrichment + query detection).
const SITE_TITLE = 'Rankall — Is AI sending customers to you or your competitor?';
const SITE_DESCRIPTION = `Rankall scans ${PLATFORMS_SCANNED} AI platforms in ${SCAN_TIME_LABEL} and shows if ChatGPT, Gemini and Perplexity recommend your business or your competitor.`;
const SITE_OG_IMAGE = `https://rankall.io/api/og/marketing?title=${encodeURIComponent('Is AI sending customers to you or your competitor?')}&subtitle=${encodeURIComponent(SITE_DESCRIPTION)}`;
const ORG_JSON_LD = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Rankall',
    url: 'https://rankall.io',
    logo: 'https://rankall.io/rankall-logo-dark.png',
    description: SITE_DESCRIPTION,
    // b86p: sameAs lists only profiles that exist (lib/socialLinks).
    ...(SOCIAL_PROFILE_URLS.length ? { sameAs: SOCIAL_PROFILE_URLS } : {}),
    contactPoint: { '@type': 'ContactPoint', contactType: 'customer service', url: 'https://rankall.io/contact' },
  },
  { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Rankall', url: 'https://rankall.io', inLanguage: 'en' },
];

export const metadata: Metadata = {
  metadataBase: new URL('https://rankall.io'),
  // azxe regression fix: this used to be `canonical: '/'`, and because
  // metadata is inherited, EVERY route without its own `alternates`
  // (/score/[slug], /simulator/[shareId], /reports/[scan_id], /join, …)
  // declared the HOMEPAGE as its canonical — telling Google to drop them.
  // './' is resolved by Next per request against the route's own pathname
  // (resolveRelativeUrl → path.posix.resolve(pathname, './')), so the
  // homepage gets https://rankall.io and every other page a self-canonical
  // (query string stripped). Routes that set their own `alternates`
  // replace this object entirely (shallow merge), so no page gets two.
  alternates: { canonical: './' },
  title: {
    default: SITE_TITLE,
    template: '%s | Rankall.io',
  },
  description: SITE_DESCRIPTION,
  keywords: ['AI visibility', 'AI reputation', 'ChatGPT ranking', 'Gemini ranking', 'AI search optimization', 'GEO', 'generative engine optimization', 'AI recommendation intelligence', 'cross-AI visibility', 'AEO', 'answer engine optimization'],
  verification: {
    google: 'mFNzV4h65XDooVyrGGRXW06ggfDOZODC9Zm6JThJUks',
  },
  authors: [{ name: 'Rankall.io' }],
  creator: 'Rankall.io',
  openGraph: {
    type: 'website',
    // azxe: a real 1200x630 share card (generic marketing generator),
    // not the logo PNG. Child routes override with their own card.
    images: [{ url: SITE_OG_IMAGE, width: 1200, height: 628, alt: SITE_TITLE }],
    locale: 'en_US',
    // Same per-route resolution as the canonical: og:url must not claim
    // the homepage on pages that inherit this openGraph object.
    url: './',
    siteName: 'Rankall.io',
    title: 'Rankall — Is AI sending customers to you or your competitor?',
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Rankall — Is AI sending customers to you or your competitor?',
    description: SITE_DESCRIPTION,
    creator: '@rankall_io',
    // azxe: same marketing card as openGraph (twitter does not inherit
    // openGraph.images reliably across scrapers).
    images: [SITE_OG_IMAGE],
  },
  // b87f: staging and previews sent "X-Robots-Tag: noindex" (proxy) but
  // <meta name="robots" content="index, follow">. The meta now matches:
  // only the rankall.io production project is indexable.
  // Fail open: noindex only when Vercel reports a production URL that is
  // positively not rankall.io (rankall-staging). An unset variable keeps
  // the old index/follow, so production can never be de-indexed by mistake.
  robots: isKnownNonProdDeployment()
    ? { index: false, follow: false }
    : { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${dmSans.variable}`}>
      <head>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(ORG_JSON_LD) }} />
      </head>
      <body style={{ overflowX: 'hidden' }}>
        <PostHogProvider>
          <AnnouncementBar />
          <Nav />
          <main>{children}</main>
          <Footer />
          <TimedPopup />
          <ExitIntentPopup />
          <Chatbot />
          {/* Show badge in dev always; on prod only when country is overridden (admin only) */}
          <CountryBadge showAlways={IS_DEV} />
        </PostHogProvider>
      </body>
    </html>
  );
}