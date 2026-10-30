// lib/countryDetection.ts
// Single source of truth for the country-resolution priority chain:
//   1. Query text (strongest — "dentist in London" → GB)
//   2. Cookie override (set by /gb /us etc.)
//   3. IP geolocation
//   4. US default
// detectCountryFromQuery wraps inferCountryFromText (which scans CITY_MAP +
// INTL_LOCATION_TO_COUNTRY in lib/countryConfig.ts).

import { inferCountryFromText } from './countryConfig';

export function detectCountryFromQuery(query: string): string | null {
  if (!query) return null;
  // inferCountryFromText scans both a location hint and the full text — passing
  // the query as both lets it catch "best dentist in London" and bare "London".
  return inferCountryFromText(query, query);
}

export function resolveCountry(
  query: string,
  cookieCountry: string | null,
  ipCountry: string | null,
): string {
  const queryCountry = detectCountryFromQuery(query);
  if (queryCountry) return queryCountry;   // 1. query text
  if (cookieCountry) return cookieCountry;  // 2. cookie
  if (ipCountry) return ipCountry;          // 3. IP
  return 'US';                              // 4. default
}
