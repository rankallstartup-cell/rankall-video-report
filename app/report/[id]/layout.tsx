import type { Metadata } from 'next';

// ax8b: scan reports are PRIVATE. No canonical, no OG image, no DB-driven
// title (the old generateMetadata queried a `competitor` column that does
// not exist, 400'd, and still emitted a canonical + OG for the report URL).
// Crawlers must not index any report URL; the page itself gates access.
// (ax7w: the same old generateMetadata is why the tab title said
// "AI Visibility Score: 0/100" while the body said 4/100.)
// Round 2: the root layout's `alternates: { canonical: './' }` and
// `openGraph.url: './'` were INHERITED here (shallow merge), so every
// private report still emitted a self-canonical + og:url. Both are replaced
// (canonical: null emits no <link rel=canonical>; the openGraph object has
// no url). title.absolute avoids the root template doubling "Rankall.io".
export const metadata: Metadata = {
  title: { absolute: 'AI Visibility Report | Rankall.io' },
  description: 'Private AI visibility report. Sign in to view.',
  robots: { index: false, follow: false },
  alternates: { canonical: null },
  openGraph: { type: 'website', siteName: 'Rankall.io', title: 'AI Visibility Report', description: 'Private AI visibility report.' },
};

export default function ReportLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
};
