import type { Metadata } from 'next';
import PersonalClient from './PersonalClient';

export const metadata: Metadata = {
  title: { absolute: 'Personal Brand — AI Visibility for Professionals | Rankall' },
  alternates: { canonical: '/personal' },
  description: 'Find out if AI recommends you by name. Rankall Personal Brand tracks your AI visibility across 12 platforms so doctors, lawyers, consultants, and executives can stay visible to the clients who matter.',
};

export default function PersonalPage() {
  return <PersonalClient />;
}
