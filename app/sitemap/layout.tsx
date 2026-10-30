import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Sitemap | Rankall' },
  description: 'Every page on rankall.io in one place.',
  alternates: { canonical: '/sitemap' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
