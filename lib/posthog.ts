'use client';
import posthog from 'posthog-js';

let initialised = false;

export function initPostHog() {
  if (initialised || typeof window === 'undefined') return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  posthog.init(key, { api_host: 'https://app.posthog.com', capture_pageview: true });
  initialised = true;
}

export function track(event: string, props?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  initPostHog();
  posthog.capture(event, props);
}
