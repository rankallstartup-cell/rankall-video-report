import type { Metadata } from 'next';
import PressPageClient from './PressPageClient';

export const metadata: Metadata = {
  title: { absolute: 'Press & Media Kit | Rankall.io' },
  alternates: { canonical: '/press' },
  description: 'Press resources, brand assets, and media kit for journalists covering Rankall.io and AI visibility for local businesses.',
};

export default function PressPage() {
  return <PressPageClient />;
}
