import { notFound } from 'next/navigation';
import { CATEGORIES } from '@/lib/categories';
import { loadPublicShare } from '@/lib/publicShare';
import Logo from '@/components/Logo';

// ax8b item 2: server component. The old client page read rankall_scans,
// rankall_platform_results, scan_competitors and generated_fixes (every
// fix's generated_content) with the anon key for ANY id. Data now comes
// from lib/publicShare (service role) and only for scans that may be
// shown publicly: ownerless outreach scans, or owned scans the owner
// explicitly shared (is_public). Anything else is a real 404. noindex is
// set in layout.tsx.
export const dynamic = 'force-dynamic';

const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#E2E8F0';
const GRAY   = '#64748B';
const LGRAY  = '#94A3B8';
const BLUE   = '#1B17FF';
const GREEN  = '#059669';
const AMBER  = '#D97706';
const RED    = '#DC2626';

export default async function OutreachReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadPublicShare(id);
  if (!data) notFound();
  const { scan, platforms, competitors, fix } = data;

  // #39: trusted display name — a stale wrong-business Google name is
  // never shown (getTrustedDisplayName inside lib/publicShare).
  const businessName = scan.displayName;
  const crawlerBlocked = (scan.crawler_blocked_bots?.length ?? 0) > 0;
  const rawCategory = scan.resolved_category || scan.industry || 'business';
  const categoryEntry = CATEGORIES[rawCategory];
  const category = (categoryEntry?.queryTerm || rawCategory.replace(/-/g, ' ')).toLowerCase();
  const city = scan.location || '';
  const respondedPlatforms = platforms.filter(p => !p.error);
  const totalPlatforms = respondedPlatforms.length || platforms.length || 11;
  const mentionedCount = scan.mentioned_count || 0;
  const scanDate = new Date(scan.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

  const businessInList = competitors.find(
    c => c.business_name.toLowerCase().trim() === businessName.toLowerCase().trim()
  );

  const topCompetitor = competitors.find(
    c => c.business_name.toLowerCase().trim() !== businessName.toLowerCase().trim()
  );

  const ctaUrl = `/signup?plan=local_business&ref=${scan.id}`;

  return (
    <>
      <div style={{ minHeight: '100vh', background: '#F8FAFC' }}>

        {/* Minimal header */}
        <div style={{ padding: '16px 24px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Logo height={24} />
        </div>

        <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 20px 80px' }}>

          {/* 1. HEADLINE */}
          <div style={{ marginBottom: 40 }}>
            {crawlerBlocked ? (
              <h1 style={{ fontSize: 28, fontWeight: 800, color: NAVY, lineHeight: 1.3, margin: '0 0 12px' }}>
                <span style={{ color: RED }}>Your website is blocking ChatGPT from reading it.</span>{' '}
                {businessName} appears in{' '}
                <span style={{ color: mentionedCount >= 6 ? GREEN : mentionedCount >= 3 ? AMBER : RED }}>{mentionedCount} of {totalPlatforms}</span>{' '}
                AI platforms — but it could rank higher.
              </h1>
            ) : (
              <h1 style={{ fontSize: 28, fontWeight: 800, color: NAVY, lineHeight: 1.3, margin: '0 0 12px' }}>
                AI recommends {category} companies in {city}.{' '}
                <span style={{ color: mentionedCount > 0 ? NAVY : RED }}>
                  {businessName}
                </span>{' '}
                {mentionedCount > 0
                  ? <>appears in <span style={{ color: mentionedCount >= 6 ? GREEN : mentionedCount >= 3 ? AMBER : RED }}>{mentionedCount} of {totalPlatforms}</span>.</>
                  : <>does not appear at all.</>
                }
              </h1>
            )}
            <p style={{ fontSize: 13, color: LGRAY, margin: 0 }}>
              Scanned {scanDate}.{' '}
              <a href={ctaUrl} style={{ color: BLUE, textDecoration: 'none', fontWeight: 600 }}>Scan again — free trial</a>
            </p>
            <p style={{ fontSize: 12, color: LGRAY, margin: '6px 0 0', opacity: 0.8 }}>
              AI answers change between runs. This is a snapshot from {scanDate} — the same question asked today may return slightly different names.
            </p>
          </div>

          {/* 2. COMPETITOR LIST */}
          {competitors.length > 0 && (
          <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '24px 24px', marginBottom: 32 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: NAVY, margin: '0 0 16px' }}>
              Who AI recommends instead
            </h2>

            {competitors.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {competitors.map((c, i) => {
                  const isYou = c.business_name.toLowerCase().trim() === businessName.toLowerCase().trim();
                  return (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '14px 16px',
                        borderRadius: isYou ? 12 : 0,
                        background: isYou ? '#FEF2F2' : 'transparent',
                        border: isYou ? `2px solid ${RED}` : 'none',
                        borderBottom: isYou ? `2px solid ${RED}` : `1px solid ${BORDER}`,
                        margin: isYou ? '4px 0' : 0,
                      }}
                    >
                      <span style={{
                        width: 28, height: 28, borderRadius: '50%', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800,
                        background: isYou ? RED : i === 0 ? GREEN : '#F1F5F9',
                        color: isYou || i === 0 ? W : NAVY,
                        flexShrink: 0,
                      }}>
                        {c.rank}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          fontSize: 14, fontWeight: isYou ? 800 : 600, color: isYou ? RED : NAVY,
                          margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {c.business_name}
                          {isYou && <span style={{ fontSize: 11, fontWeight: 700, marginLeft: 8, color: RED }}>YOUR BUSINESS</span>}
                        </p>
                        {/* blurbs removed — only real Places data shown */}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <span style={{
                          fontSize: 18, fontWeight: 800,
                          color: c.platform_count >= 6 ? GREEN : c.platform_count >= 3 ? AMBER : RED,
                        }}>
                          {c.platform_count}
                        </span>
                        <span style={{ fontSize: 12, color: LGRAY }}> / {totalPlatforms}</span>
                      </div>
                    </div>
                  );
                })}

                {!businessInList && (() => {
                  const competitorCounts = competitors
                    .filter(c => c.business_name.toLowerCase().trim() !== businessName.toLowerCase().trim())
                    .map(c => c.platform_count);
                  const maxCompetitor = competitorCounts.length > 0 ? Math.max(...competitorCounts) : 0;
                  const avgCompetitor = competitorCounts.length > 0
                    ? competitorCounts.reduce((a, b) => a + b, 0) / competitorCounts.length : 0;
                  const rankingWell = mentionedCount > 0 && mentionedCount >= maxCompetitor;
                  const rowColor = mentionedCount === 0 ? RED : rankingWell ? GREEN : AMBER;
                  const rowBg = mentionedCount === 0 ? '#FEF2F2' : rankingWell ? '#F0FDF4' : '#FFFBEB';
                  let copyText: string;
                  if (mentionedCount === 0) {
                    copyText = 'Not mentioned by any platform';
                  } else if (rankingWell) {
                    copyText = `Mentioned by ${mentionedCount} platform${mentionedCount === 1 ? '' : 's'} — ranking above all tracked competitors`;
                  } else if (mentionedCount >= avgCompetitor) {
                    copyText = `Mentioned by ${mentionedCount} platform${mentionedCount === 1 ? '' : 's'} — but not yet the top recommendation`;
                  } else {
                    copyText = `Mentioned by ${mentionedCount} platform${mentionedCount === 1 ? '' : 's'} — but not ranking in top recommendations`;
                  }
                  return (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 16px', borderRadius: 12,
                    background: rowBg,
                    border: `2px solid ${rowColor}`,
                    marginTop: 4,
                  }}>
                    <span style={{
                      width: 28, height: 28, borderRadius: '50%', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800,
                      background: rowColor, color: W, flexShrink: 0,
                    }}>
                      {mentionedCount > 0 ? mentionedCount : '—'}
                    </span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 14, fontWeight: 800, color: rowColor, margin: 0 }}>
                        {businessName}
                        <span style={{ fontSize: 11, fontWeight: 700, marginLeft: 8 }}>YOUR BUSINESS</span>
                      </p>
                      <p style={{ fontSize: 12, color: rowColor, margin: '2px 0 0', opacity: 0.8 }}>
                        {copyText}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{ fontSize: 18, fontWeight: 800, color: rowColor }}>{mentionedCount}</span>
                      <span style={{ fontSize: 12, color: LGRAY }}> / {totalPlatforms}</span>
                    </div>
                  </div>
                  );
                })()}
              </div>
            ) : null}
          </div>
          )}

          {/* 3. WHY IT MATTERS */}
          <div style={{ marginBottom: 32, padding: '0 4px' }}>
            <p style={{ fontSize: 15, color: NAVY, lineHeight: 1.6, margin: 0 }}>
              Google rankings and AI recommendations are two different systems.
              When someone asks ChatGPT, Perplexity, or Google AI for a recommendation,
              the answer comes from a different process than search results — and right
              now, most businesses aren&apos;t part of it.
            </p>
          </div>

          {/* 4. VERIFY IT YOURSELF */}
          {scan.queries_used && scan.queries_used.length > 0 && (
            <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '24px 24px', marginBottom: 32 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: NAVY, margin: '0 0 4px' }}>
                Verify it yourself
              </h2>
              <p style={{ fontSize: 13, color: GRAY, margin: '0 0 16px' }}>
                Open ChatGPT and ask these. See who comes up.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {scan.queries_used.map((q, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '10px 14px', background: '#F8FAFC', borderRadius: 10,
                      border: `1px solid ${BORDER}`, fontSize: 14, color: NAVY,
                      fontStyle: 'italic',
                    }}
                  >
                    &ldquo;{q}&rdquo;
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 5. THE FIRST FIX (only if exists) */}
          {fix && fix.generated_content && (
            <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '24px 24px', marginBottom: 32 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: NAVY, margin: '0 0 4px' }}>
                One fix you can make today
              </h2>
              <p style={{ fontSize: 13, color: GRAY, margin: '0 0 4px' }}>
                {fix.fix_title}
                {fix.time_to_implement && <span style={{ color: LGRAY }}> · {fix.time_to_implement}</span>}
              </p>
              {fix.predicted_impact != null && fix.predicted_impact > 0 && (
                <p style={{ fontSize: 12, fontWeight: 700, color: GREEN, margin: '0 0 12px' }}>
                  Estimated impact: +{fix.predicted_impact} points
                </p>
              )}
              <div style={{
                background: '#F8FAFC', borderRadius: 10, border: `1px solid ${BORDER}`,
                padding: '16px', fontSize: 13, color: NAVY, lineHeight: 1.6,
                overflowX: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'monospace',
              }}>
                {fix.generated_content}
              </div>
            </div>
          )}

          {/* 6. SINGLE CTA */}
          <div style={{
            background: NAVY, borderRadius: 16, padding: '32px 24px', textAlign: 'center',
          }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: W, margin: '0 0 8px' }}>
              See all {totalPlatforms} platforms. Get every fix.
            </h2>
            <p style={{ fontSize: 14, color: '#94A3B8', margin: '0 0 20px' }}>
              7-day free trial. Card required — nothing charged until the trial ends.
            </p>
            <a
              href={ctaUrl}
              style={{
                display: 'inline-block', padding: '14px 40px',
                background: BLUE, color: W, fontSize: 16, fontWeight: 800,
                borderRadius: 12, textDecoration: 'none',
              }}
            >
              Start free trial
            </a>
          </div>

          {/* Footer — just the scan date, nothing else */}
          <p style={{ textAlign: 'center', fontSize: 11, color: LGRAY, marginTop: 32 }}>
            Report generated by Rankall · {scanDate}
          </p>
        </div>

        {/* Mobile sticky CTA */}
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          padding: '12px 20px', background: NAVY,
          borderTop: `1px solid ${BORDER}`,
          display: 'none',
        }}
          className="mobile-sticky-cta"
        >
          <a
            href={ctaUrl}
            style={{
              display: 'block', textAlign: 'center', padding: '12px 0',
              background: BLUE, color: W, fontSize: 15, fontWeight: 800,
              borderRadius: 10, textDecoration: 'none',
            }}
          >
            Start free trial
          </a>
        </div>

        <style>{`
          @media (max-width: 640px) {
            .mobile-sticky-cta { display: block !important; }
          }
        `}</style>
      </div>
    </>
  );
}
