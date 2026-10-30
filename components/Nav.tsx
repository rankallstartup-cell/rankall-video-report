'use client';

import { usePathname } from 'next/navigation';
import { SiteHeader } from './SiteChrome';
import { hideSiteChrome } from '@/lib/appShell';

// Site-wide header: the landing-page header (components/SiteChrome.tsx).
// Hidden on the homepage (it renders SiteHeader itself, wired to its demo
// video), the demo tour, and shared report pages.
export default function Nav() {
  const path = usePathname();
  if (hideSiteChrome(path)) return null;
  return <SiteHeader />;
}
