'use client';

import type { ShareOfVoiceResult } from '@/lib/shareOfVoice';

const NAVY = '#0F172A';
const W = '#FFFFFF';
const BORDER = '#E2E8F0';
const GRAY = '#64748B';
const LGRAY = '#94A3B8';
const BLUE = '#2563EB';
const GREEN = '#059669';
const RED = '#DC2626';

// "Your Share of AI Recommendations" — a horizontal bar of you vs competitor,
// plus a per-platform breakdown. Tells the customer-outcome story at a glance.
export default function ShareOfVoice({ sov }: { sov: ShareOfVoiceResult }) {
  const compName = sov.competitorName || 'Your competitor';
  const youWinning = sov.youShare >= sov.competitorShare;

  return (
    <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 20, padding: '28px 32px', marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div style={{ width: 36, height: 36, background: '#EFF6FF', border: '1.5px solid #BFDBFE', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18 }}><svg viewBox="0 0 512 512" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M32 32c17.7 0 32 14.3 32 32l0 336c0 8.8 7.2 16 16 16l400 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L80 480c-44.2 0-80-35.8-80-80L0 64C0 46.3 14.3 32 32 32zM160 224c17.7 0 32 14.3 32 32l0 64c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32zm128-64l0 160c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-160c0-17.7 14.3-32 32-32s32 14.3 32 32zm64 32c17.7 0 32 14.3 32 32l0 96c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-96c0-17.7 14.3-32 32-32zM480 96l0 224c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-224c0-17.7 14.3-32 32-32s32 14.3 32 32z"/></svg></div>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>Share of Voice</p>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: NAVY, margin: 0 }}>Your share of AI recommendations</h2>
        </div>
      </div>

      <p style={{ fontSize: 14, color: GRAY, lineHeight: 1.6, margin: '8px 0 20px' }}>
        {sov.competitorCount > 0 || sov.youCount > 0 ? (
          <>You own <strong style={{ color: youWinning ? GREEN : RED }}>{sov.youShare}%</strong> of AI recommendations in your category. {compName} owns <strong style={{ color: RED }}>{sov.competitorShare}%</strong>. Here&apos;s how to close the gap.</>
        ) : (
          <>No clear recommendations yet — this is your opening. Be the business AI names first.</>
        )}
      </p>

      {/* Aggregate bar */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', height: 28, borderRadius: 8, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
          <div style={{ width: `${Math.max(sov.youShare, 0)}%`, background: GREEN, transition: 'width 0.6s ease' }} />
          <div style={{ width: `${Math.max(sov.competitorShare, 0)}%`, background: RED, transition: 'width 0.6s ease' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, fontWeight: 700 }}>
          <span style={{ color: GREEN }}>You {sov.youShare}%</span>
          <span style={{ color: RED }}>{compName} {sov.competitorShare}%</span>
        </div>
      </div>

      {/* Per-platform breakdown */}
      <p style={{ fontSize: 11, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Who each platform recommends</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
        {sov.platforms.map(p => (
          <div key={p.platform} style={{ background: '#F8FAFC', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: NAVY, marginBottom: 4 }}>{p.platform}</p>
            <div style={{ display: 'flex', gap: 8, fontSize: 11, fontWeight: 700 }}>
              <span style={{ color: p.youMentioned ? GREEN : LGRAY }}>You {p.youMentioned ? <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> : <svg viewBox="0 0 384 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>}</span>
              <span style={{ color: p.competitorMentioned ? RED : LGRAY }}>Them {p.competitorMentioned ? <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> : <svg viewBox="0 0 384 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
