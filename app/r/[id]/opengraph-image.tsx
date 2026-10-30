import { ImageResponse } from 'next/og';
import { loadShareableScanRow } from '@/lib/publicShare';
import { getTrustedDisplayName } from '@/lib/enrichment';

export const alt = 'Rankall AI Visibility Report';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// ax8b item 2: the OG image applies the SAME rule as the /r/[id] page —
// ownerless (outreach) scans or owned scans the owner shared (is_public).
// Anything else gets a generic card with no name / score / competitor.
// The name goes through getTrustedDisplayName (#39): a stale stored
// Google name for another business is never rendered.
function genericCard() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', fontFamily: 'system-ui, sans-serif', gap: 16 }}>
        <span style={{ fontSize: 56, fontWeight: 800, color: '#0F172A' }}>Rankall</span>
        <span style={{ fontSize: 28, color: '#64748B', fontWeight: 600 }}>AI Visibility Report</span>
      </div>
    ),
    { ...size },
  );
}

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const scan = await loadShareableScanRow(id);
  if (!scan) return genericCard();

  const google = (scan.enrichment as { google?: Parameters<typeof getTrustedDisplayName>[3] } | null)?.google;
  const businessName = getTrustedDisplayName(
    scan.input as string | null,
    scan.location as string | null,
    scan.user_business_name as string | null,
    google,
  );
  const score = Number(scan.overall_score) || 0;
  const mentioned = Number(scan.mentioned_count) || 0;
  const competitor = (scan.competitor_name as string | null) || null;
  const category = String(scan.industry || '').toLowerCase();
  const location = String(scan.location || '');

  const scoreColor = score > 30 ? '#059669' : score > 0 ? '#D97706' : '#DC2626';
  const scoreBg = score > 30 ? '#F0FDF4' : score > 0 ? '#FFFBEB' : '#FEF2F2';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#F8FAFC',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Top bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '28px 48px',
            borderBottom: '2px solid #E2E8F0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: '#0F172A',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                fontSize: 18,
                fontWeight: 800,
              }}
            >
              R
            </div>
            <span style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
              Rankall
            </span>
          </div>
          <span style={{ fontSize: 16, color: '#94A3B8', fontWeight: 600 }}>
            AI Visibility Report
          </span>
        </div>

        {/* Main content */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '0 48px',
            gap: 32,
          }}
        >
          {/* Business name */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span
              style={{
                fontSize: 44,
                fontWeight: 800,
                color: '#0F172A',
                lineHeight: 1.1,
                maxWidth: 900,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {businessName}
            </span>
            {(category || location) && (
              <span style={{ fontSize: 20, color: '#64748B', fontWeight: 600 }}>
                {category}{category && location ? ' · ' : ''}{location}
              </span>
            )}
          </div>

          {/* Stats row */}
          <div style={{ display: 'flex', gap: 24 }}>
            {/* Platforms card — primary */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: scoreBg,
                border: `3px solid ${scoreColor}`,
                borderRadius: 16,
                padding: '24px 48px',
                minWidth: 200,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 64, fontWeight: 800, color: scoreColor, lineHeight: 1 }}>
                  {mentioned}
                </span>
                <span style={{ fontSize: 28, fontWeight: 700, color: scoreColor, opacity: 0.7 }}>
                  / 11
                </span>
              </div>
              <span style={{ fontSize: 16, color: '#64748B', fontWeight: 600, marginTop: 8 }}>
                AI platforms
              </span>
            </div>

            {/* Competitor card */}
            {competitor && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  background: '#FFFFFF',
                  border: '2px solid #E2E8F0',
                  borderRadius: 16,
                  padding: '24px 32px',
                  flex: 1,
                }}
              >
                <span style={{ fontSize: 14, color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Top competitor
                </span>
                <span
                  style={{
                    fontSize: 24,
                    fontWeight: 800,
                    color: '#0F172A',
                    marginTop: 8,
                    maxWidth: 400,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {competitor}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px 48px',
            borderTop: '2px solid #E2E8F0',
          }}
        >
          <span style={{ fontSize: 16, color: '#94A3B8', fontWeight: 600 }}>
            rankall.io
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
