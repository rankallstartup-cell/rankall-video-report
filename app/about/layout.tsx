import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'About | Rankall.io' },
  alternates: { canonical: '/about' },
  description: 'Rankall helps businesses understand and improve their AI visibility across ChatGPT, Gemini, Perplexity and 8 other AI platforms.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
