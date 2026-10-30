import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Rankall vs Competitors | Rankall.io' },
  alternates: { canonical: '/vs' },
  description: 'How Rankall compares to other AI visibility tools. 12 platforms vs 6. Fix Engine. Trust Layer. Personal Brand scanning.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
