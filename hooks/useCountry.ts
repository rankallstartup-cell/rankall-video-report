'use client';

import { useState, useEffect } from 'react';
import { getCountryConfig, DEFAULT_COUNTRY, type CountryConfig } from '@/lib/countryConfig';

function readCountryCookie(): string {
  if (typeof document === 'undefined') return DEFAULT_COUNTRY;
  const match = document.cookie.match(/(?:^|;\s*)rankall_country=([^;]+)/);
  return match?.[1] ?? DEFAULT_COUNTRY;
}

export function useCountry(): CountryConfig {
  const [config, setConfig] = useState<CountryConfig>(getCountryConfig(DEFAULT_COUNTRY));

  useEffect(() => {
    const code = readCountryCookie();
    if (code !== DEFAULT_COUNTRY) setConfig(getCountryConfig(code));
  }, []);

  return config;
}
