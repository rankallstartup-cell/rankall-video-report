import { NextResponse } from 'next/server';
import { getCountryConfig } from '@/lib/countryConfig';

export const dynamic = 'force-dynamic';

export async function GET() {
  const countries = ['US','GB','IN','AU','CA','ZA','AE','SG','NG','KE','NZ','PH','IE','VS'];
  const result: Record<string, { working: boolean; currency: string }> = {};
  for (const cc of countries) {
    const cfg = getCountryConfig(cc);
    result[cc] = { working: true, currency: cfg.symbol };
  }
  return NextResponse.json(result);
}
