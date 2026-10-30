import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'The Intelligence Graph | Rankall' },
  description: 'How AI platforms connect businesses, entities, and recommendations — and where your business sits in the graph.',
  alternates: { canonical: '/intelligence-graph' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
