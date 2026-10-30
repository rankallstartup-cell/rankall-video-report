import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact Rankall',
  description: 'Questions about AI visibility, pricing, or agency plans? Talk to the Rankall team.',
  alternates: { canonical: '/contact' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
