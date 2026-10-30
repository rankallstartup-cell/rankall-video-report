import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Developers — Rankall API',
  description: 'Embed Rankall AI visibility scores on any website.',
};

export default function DevelopersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
