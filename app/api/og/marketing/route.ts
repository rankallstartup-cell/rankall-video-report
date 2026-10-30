import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { createElement } from 'react';
import { MarketingOgImage } from './og-image';
import { sanitizeOgText, OG_TITLE_MAX, OG_SUBTITLE_MAX } from '@/lib/ogText';
import { PLATFORMS_SCANNED, SCAN_TIME_LABEL } from '@/lib/publicStats';

const DEFAULT_TITLE = 'Rankall — AI Visibility';
const DEFAULT_SUBTITLE = `Rankall scans ${PLATFORMS_SCANNED} AI platforms in ${SCAN_TIME_LABEL} and shows if ChatGPT, Gemini and Perplexity recommend your business or your competitor.`;

export const dynamic = 'force-dynamic';

// Generic marketing OG share card (azxe) — same pattern as /api/og/report,
// but title + value prop instead of a score box. Used by the homepage
// (via root layout metadata) and pricing / blog metadata overrides.
// 1200x630 (628). Query params: ?title=...&subtitle=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  // Length-capped + control/bidi chars stripped (lib/ogText); truncation
  // also keeps long titles inside the 2-line headline area.
  const title = sanitizeOgText(searchParams.get('title'), OG_TITLE_MAX, DEFAULT_TITLE);
  const subtitle = sanitizeOgText(searchParams.get('subtitle'), OG_SUBTITLE_MAX, DEFAULT_SUBTITLE);

  return new ImageResponse(
    createElement(MarketingOgImage, { title, subtitle }),
    {
      width: 1200,
      height: 628,
      headers: { 'Cache-Control': 'public, max-age=3600' },
    },
  );
}
