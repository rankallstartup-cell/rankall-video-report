import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'AI Visibility Leaderboard | Rankall.io' },
  alternates: { canonical: '/leaderboard' },
  description: 'See which businesses lead AI recommendations in your city and industry. Real scores from ChatGPT, Gemini, Perplexity and more.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
