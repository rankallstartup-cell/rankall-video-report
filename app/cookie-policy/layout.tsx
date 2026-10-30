import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Cookie Policy | Rankall' },
  description: 'What cookies Rankall uses, why, and how to control them.',
  alternates: { canonical: '/cookie-policy' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
