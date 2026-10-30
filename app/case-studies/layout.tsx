import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Case Studies | Rankall.io' },
  alternates: { canonical: '/case-studies' },
  description: 'Illustrative examples, not real customers: the fixes a typical business of each type would apply first and the score Rankall would estimate from them.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
