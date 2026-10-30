import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { createElement } from 'react';
import { OgImage } from './og-image';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const business   = searchParams.get('business') || 'Your Business';
  const score      = searchParams.get('score') || '0';
  const competitor = searchParams.get('competitor') || '';
  const industry   = searchParams.get('industry') || '';

  const scoreNum   = parseInt(score, 10);
  const scoreColor = scoreNum >= 70 ? '#059669' : scoreNum >= 40 ? '#D97706' : '#DC2626';
  const businessLabel = business.length > 28 ? business.slice(0, 28) + '…' : business;
  const competitorLabel = competitor.length > 22 ? competitor.slice(0, 22) + '…' : competitor;

  return new ImageResponse(
    createElement(OgImage, {
      businessLabel,
      industry,
      score,
      scoreColor,
      competitor,
      competitorLabel,
    }),
    {
      width: 1200,
      height: 628,
      headers: { 'Cache-Control': 'public, max-age=3600' },
    },
  );
}
