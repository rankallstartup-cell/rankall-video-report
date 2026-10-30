import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Interactive Product Tour | Rankall' },
  description: 'Take a guided tour of Rankall: see a real AI visibility scan, the fix queue, and the score breakdown across 12 AI platforms.',
  alternates: { canonical: '/demo' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
