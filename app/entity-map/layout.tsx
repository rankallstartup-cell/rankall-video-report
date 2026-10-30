import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'EntityMap — See Your Business the Way AI Sees It | Rankall' },
  description: 'EntityMap shows how AI platforms understand your business entity — what they know, what they miss, and what to fix.',
  alternates: { canonical: '/entity-map' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
