import { ImageResponse } from 'next/og';
import { INDUSTRIES, CITIES } from './page';
import { getComboAggregate } from '@/lib/programmaticAggregates';
import { PLATFORMS_SCANNED } from '@/lib/publicStats';
import { industryPlural } from '@/lib/industryPlural';
import { OgLogo } from '@/lib/ogLogo';

export const runtime = 'edge';
export const size = { width: 1200, height: 628 };
export const contentType = 'image/png';

export default async function Image(
  { params }: { params: Promise<{ industry: string; city: string }> }
) {
  const { industry, city } = await params;
  const ind = INDUSTRIES[industry];
  const cit = CITIES[city];

  const label = ind ? `${industryPlural(ind.label)} in ${cit?.label ?? city}` : industry;
  // azxc residual: the old card rendered the HARDCODED per-industry
  // avgScore (the same number for all 293 cities) as this city's
  // average. The card now uses the same real aggregate as the page;
  // below the minimum sample (lib/programmaticAggregates MIN_PUBLIC_SAMPLE)
  // it shows a dash, never a fabricated number.
  const aggregate = await getComboAggregate(industry, city, cit?.label ?? city, CITIES);
  const score = aggregate?.avgScore ?? null;
  const scoreColor = score == null ? '#94A3B8' : score < 35 ? '#DC2626' : score < 55 ? '#D97706' : '#059669';

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 628,
          background: '#0F172A',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
          padding: 64,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', marginBottom: 32 }}>
          <OgLogo size={40} />
        </div>

        <div style={{ fontSize: 48, marginBottom: 16 }}>{ind?.emoji ?? '📊'}</div>

        <h1 style={{ fontSize: 52, fontWeight: 900, color: '#fff', textAlign: 'center', lineHeight: 1.1, marginBottom: 20, letterSpacing: '-0.03em' }}>
          AI Visibility for<br />{label}
        </h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: 32, marginBottom: 32 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 64, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{score ?? '—'}</div>
            <div style={{ fontSize: 16, color: '#94A3B8' }}>{score != null ? `avg score /100 · ${aggregate!.scanCount} scanned` : 'not enough data yet'}</div>
          </div>
          <div style={{ width: 1, height: 60, background: 'rgba(255,255,255,0.2)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 36, fontWeight: 900, color: '#2563EB', lineHeight: 1 }}>{PLATFORMS_SCANNED}</div>
            <div style={{ fontSize: 16, color: '#94A3B8' }}>AI platforms</div>
          </div>
          {/* azxc: the "+N pts top fix" stat was a fixed per-industry
              constant, not derived from data — removed. */}
        </div>

        <div style={{ background: '#2563EB', borderRadius: 12, padding: '12px 32px', fontSize: 18, fontWeight: 700, color: '#fff' }}>
          Scan free at rankall.io →
        </div>
      </div>
    ),
    { ...size }
  );
}
