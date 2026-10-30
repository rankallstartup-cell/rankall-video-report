import type { Metadata } from 'next';
import { PLATFORMS_SCANNED } from '@/lib/publicStats';

export const metadata: Metadata = {
  title: { absolute: 'How Rankall Scores You | Rankall.io' },
  alternates: { canonical: '/methodology' },
  description: `Rankall's open scoring methodology: how your AI Visibility Score is calculated across ${PLATFORMS_SCANNED} AI platforms, what counts as a mention, and the honest limits of every scan.`,
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
