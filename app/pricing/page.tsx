'use client';

import { useEffect, useState, Suspense } from 'react';
import { getCountryConfig, type CountryConfig } from '@/lib/countryConfig';
import PricingClient from './PricingClient';

const DEFAULT = getCountryConfig('US');

function PricingPageInner() {
  const [country, setCountry] = useState<CountryConfig>(DEFAULT);

  useEffect(() => {
    const match = document.cookie
      .split('; ')
      .find(r => r.startsWith('rankall_country='));
    const code = match ? match.split('=')[1] : 'US';
    setCountry(getCountryConfig(code));
  }, []);

  return <PricingClient country={country} />;
}

export default function PricingPage() {
  return (
    <Suspense fallback={null}>
      <PricingPageInner />
    </Suspense>
  );
}
