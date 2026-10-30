import type { Metadata } from 'next';

// ax8b item 2: /r/[id] is a share page for one business — never indexed.
// The old layout emitted a canonical for every id (an indexing signal on a
// page robots.ts also disallowed, so crawlers never saw a noindex). Now:
// noindex via metadata, no canonical, and robots.ts no longer Disallows
// /r/ so crawlers can actually read the noindex.
// Round 2: also replace the root's inherited `alternates.canonical: './'`
// and `openGraph.url: './'` (shallow merge) — canonical: null emits no
// canonical link and this openGraph object carries no url. og:image still
// comes from the sibling opengraph-image.tsx file convention.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  alternates: { canonical: null },
  openGraph: { type: 'website', siteName: 'Rankall.io', title: 'AI Visibility Score | Rankall.io', description: 'How AI platforms recommend this business — scanned by Rankall.' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
