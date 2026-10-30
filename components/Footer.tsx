'use client';

import { usePathname } from 'next/navigation';
import { SiteFooter } from './SiteChrome';
import { hideSiteChrome } from '@/lib/appShell';

// Site-wide footer: the landing-page footer (components/SiteChrome.tsx).
// Hidden on the homepage (it renders SiteFooter itself), the demo tour,
// and shared report pages.
export default function Footer() {
  const pathname = usePathname();
  if (hideSiteChrome(pathname)) return null;
  return <SiteFooter />;
}
