import type { Metadata } from 'next';
import CityIntelligenceClient from './CityIntelligenceClient';

export const metadata: Metadata = {
  title: { absolute: 'City Intelligence — AI Visibility for Cities & Economic Development | Rankall' },
  alternates: { canonical: '/city-intelligence' },
  description: 'Discover how AI-visible the businesses in your city are. Rankall City Intelligence helps city governments, tourism boards, and chambers of commerce measure and improve their economic AI footprint.',
};

export default function CityIntelligencePage() {
  return <CityIntelligenceClient />;
}
