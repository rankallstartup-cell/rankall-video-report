import type { Metadata } from 'next';
import { PRICE_LOCAL_USD, PRICE_PERSONAL_USD, PRICE_AGENCY_USD } from '@/lib/publicStats';

// Prices come from lib/publicStats.ts (single source of truth) — no copy
// of a price lives in this file.
const TITLE = 'Pricing | Rankall.io';
const DESCRIPTION = `Simple transparent pricing for AI visibility. Local Business $${PRICE_LOCAL_USD}/month, Personal Brand $${PRICE_PERSONAL_USD}/month, Agency $${PRICE_AGENCY_USD}/month. See which AI platforms recommend your business.`;
const CARD_SUBTITLE = `Local Business $${PRICE_LOCAL_USD}/mo · Personal Brand $${PRICE_PERSONAL_USD}/mo · Agency $${PRICE_AGENCY_USD}/mo. See which AI platforms recommend your business.`;
const OG_IMAGE = `https://rankall.io/api/og/marketing?title=${encodeURIComponent('Simple, transparent pricing')}&subtitle=${encodeURIComponent(CARD_SUBTITLE)}`;
const OG_ALT = `Rankall pricing — Local Business $${PRICE_LOCAL_USD}/mo, Personal Brand $${PRICE_PERSONAL_USD}/mo, Agency $${PRICE_AGENCY_USD}/mo`;

export const metadata: Metadata = {
  title: { absolute: TITLE },
  alternates: { canonical: '/pricing' },
  description: DESCRIPTION,
  // azxe: pricing shares with its own 1200x630 card. Metadata merges are
  // SHALLOW — an openGraph object with only `images` replaced the root's
  // whole openGraph (losing og:title/description/url/siteName/type), so
  // both objects are complete here.
  openGraph: {
    type: 'website',
    url: '/pricing',
    siteName: 'Rankall.io',
    locale: 'en_US',
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: OG_IMAGE, width: 1200, height: 628, alt: OG_ALT }],
  },
  twitter: {
    card: 'summary_large_image',
    creator: '@rankall_io',
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
