'use client';

import { usePathname } from 'next/navigation';
import { SiteAnnouncement } from './SiteChrome';
import { hasAppShell } from '@/lib/appShell';

// Site-wide promo bar: the landing-page bar (components/SiteChrome.tsx).
export default function AnnouncementBar() {
  const pathname = usePathname();
  // The demo tour keeps its bar (as before); app-shell pages do not.
  if (pathname === '/' || pathname.startsWith('/r/') || hasAppShell(pathname)) return null;
  return <SiteAnnouncement />;
}
