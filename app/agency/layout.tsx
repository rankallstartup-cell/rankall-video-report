import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'AI Visibility for Agencies | Rankall' },
  description: 'White-label AI visibility reports for marketing agencies. Scan every client across ChatGPT, Gemini, Perplexity and 8 more AI platforms, and prove ROI with before/after rescans.',
  alternates: { canonical: '/agency' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
