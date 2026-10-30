import type { Metadata } from 'next';
import { PLATFORMS_SCANNED, SCAN_TIME_LABEL } from '@/lib/publicStats';

export const metadata: Metadata = {
  title: { absolute: 'How It Works | Rankall.io' },
  alternates: { canonical: '/how-it-works' },
  description: `Scan your business across ${PLATFORMS_SCANNED} AI platforms in ${SCAN_TIME_LABEL}. See your score, find competitors, get fixes. Simple 3-step process.`,
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
