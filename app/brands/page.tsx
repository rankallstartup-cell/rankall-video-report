import type { Metadata } from 'next';
import BrandsClient from './BrandsClient';
import { MARKETS_COVERED, PLATFORMS_SCANNED } from '@/lib/publicStats';

export const metadata: Metadata = {
  title: { absolute: 'Brand AI Intelligence — Enterprise AI Visibility | Rankall' },
  alternates: { canonical: '/brands' },
  description: `Understand how AI platforms represent your brand across ${MARKETS_COVERED} countries and ${PLATFORMS_SCANNED} platforms. Rankall Brand Intelligence gives enterprise marketing teams the competitive data they need to win the AI era.`,
};

export default function BrandsPage() {
  return <BrandsClient />;
}
