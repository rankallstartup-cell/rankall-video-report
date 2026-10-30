import { NextRequest, NextResponse } from 'next/server';
import { COUNTRY_CONFIGS, CountryCode } from '@/lib/countryConfig';

export const dynamic = 'force-dynamic';

const VALID_CODES = new Set<string>(['US','GB','AU','CA','IE','NZ','SG','AE','ZA','NG','KE','GH','IN','PH']);

// GET /api/outreach/country-config?country=US — returns outreach config for a country
// Used by email generation, Apollo webhooks, and WhatsApp templates to pick locale-correct copy
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const raw = (searchParams.get('country') || 'US').toUpperCase();
  const country = (VALID_CODES.has(raw) ? raw : 'US') as CountryCode;

  const config = COUNTRY_CONFIGS[country] || COUNTRY_CONFIGS['US'];

  return NextResponse.json({
    country_code: country,
    currency_symbol: config.symbol,
    monthly_price: config.monthly,
    avg_customer_value: config.avgCustomerValue,
    example_queries: config.exampleQueries,
    search_helper_text: config.searchHelperText,
    trust_sources: config.trustSources,
    blacklisted_domains: [],
    email_locale: {
      greeting: country === 'IN' ? 'Namaste' : country === 'NG' || country === 'GH' ? 'Hello' : 'Hi',
      currency_note: config.symbol !== '$' ? `Prices shown in local currency (${config.symbol})` : null,
    },
  });
}
