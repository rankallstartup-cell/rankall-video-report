import { NextRequest, NextResponse } from 'next/server';
import { fetchGooglePlaces } from '@/lib/enrichment';

export async function POST(req: NextRequest) {
  try {
    const { businessName, location } = await req.json();
    if (!businessName) return NextResponse.json({ error: 'Missing businessName' }, { status: 400 });

    const google = await fetchGooglePlaces(businessName, location || '');
    console.log('[enrich-business] result for', businessName, ':', google ? 'data returned' : 'no data / undefined');
    return NextResponse.json({ success: true, google });
  } catch (error) {
    console.error('Enrich business error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
