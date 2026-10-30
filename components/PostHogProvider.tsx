'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { initPostHog } from '@/lib/posthog';

/**
 * CONV-00: first-touch traffic source capture. On the first page load,
 * records UTM params (?utm_source / ?utm_medium / ?utm_campaign / ?ref=)
 * into the rk_src cookie (30 days, first-touch wins). Server routes read
 * it via lib/funnel.ts readSourceCookie() to segment funnel events.
 */
function captureSource() {
  try {
    if (document.cookie.split('; ').some((c) => c.startsWith('rk_src='))) return;
    const q = new URLSearchParams(window.location.search);
    const us = q.get('utm_source');
    const um = q.get('utm_medium');
    const uc = q.get('utm_campaign');
    const ref = q.get('ref');
    if (!us && !um && !uc && !ref) {
      // Still record the landing so "cold/direct" is explicit, not missing.
      document.cookie = 'rk_src=' + encodeURIComponent(JSON.stringify({})) + '; path=/; max-age=2592000; SameSite=Lax';
      return;
    }
    const payload: Record<string, unknown> = {};
    if (us) payload.us = us.slice(0, 80);
    if (um) payload.um = um.slice(0, 80);
    if (uc) payload.uc = uc.slice(0, 80);
    if (ref) payload.ref = true;
    document.cookie = 'rk_src=' + encodeURIComponent(JSON.stringify(payload)) + '; path=/; max-age=2592000; SameSite=Lax';
  } catch {
    /* never break the page */
  }
}

export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  const path = usePathname();

  useEffect(() => { initPostHog(); }, []);
  useEffect(() => { captureSource(); }, []);
  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      import('posthog-js').then(({ default: posthog }) => posthog.capture('$pageview', { path }));
    }
  }, [path]);

  return <>{children}</>;
}
