import Link from 'next/link';
import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { SIMULATOR_DISCLAIMER, confidenceColor } from '@/lib/simulator';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { absolute: 'AI Visibility Simulator | Rankall' },
  robots: { index: false, follow: true },
};

// Phase 15: public, shareable simulator projection. Read-only, fully disclaimered.
const PURPLE = '#7c3aed';
const NAVY = '#0F172A';
const GRAY = '#64748B';
const BORDER = '#E2E8F0';
const BG = '#F8FAFC';
const WHITE = '#fff';

type Projection = {
  businessType?: string;
  city?: string;
  currentScore?: number;
  projectedScoreMin?: number;
  projectedScoreMax?: number;
  projectedScoreMid?: number;
  confidence?: number;
  basisBadge?: string;
  basisLabel?: string;
  totalWeeks?: number;
  revenueSymbol?: string;
  revenueRecovered?: number;
  revenueRecoveredAnnual?: number;
  fixProjections?: { fixTitle: string; pointsGainedRange: string; weekStart: number; weekEnd: number }[];
};

async function fetchProjection(shareId: string): Promise<Projection | null> {
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data } = await sb
      .from('simulation_views')
      .select('projection_data, current_score, projected_score, industry, is_public')
      .eq('share_id', shareId)
      .eq('is_public', true)
      .maybeSingle();
    if (!data) return null;
    const row = data as Record<string, unknown>;
    const pd = (row.projection_data as Projection) || {};
    return {
      businessType: pd.businessType ?? (row.industry as string) ?? undefined,
      currentScore: pd.currentScore ?? (row.current_score as number) ?? undefined,
      ...pd,
    };
  } catch {
    return null;
  }
}

const card: React.CSSProperties = { background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 24, marginBottom: 20 };
const disclaimerStyle: React.CSSProperties = { fontSize: 11, color: '#6b7280', marginTop: 4, fontStyle: 'italic' };

export default async function PublicSimulatorPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  const p = await fetchProjection(shareId);

  if (!p) {
    return (
      <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 460 }}>
          <div style={{ fontSize: 44, marginBottom: 16 }}><svg viewBox="0 0 512 512" width="44" height="44" fill="#0F172A" aria-hidden="true"><path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/></svg></div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: NAVY, marginBottom: 12 }}>Projection not found</h1>
          <p style={{ color: GRAY, marginBottom: 24 }}>This shared projection isn&apos;t available or is no longer public.</p>
          <Link href="https://rankall.io" style={{ display: 'inline-block', background: PURPLE, color: WHITE, padding: '12px 24px', borderRadius: 10, fontWeight: 700, textDecoration: 'none' }}>See your projection free <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
        </div>
      </div>
    );
  }

  const min = p.projectedScoreMin ?? p.projectedScoreMid ?? 0;
  const max = p.projectedScoreMax ?? p.projectedScoreMid ?? 0;
  const confidence = p.confidence ?? 40;
  const sym = p.revenueSymbol ?? '$';

  return (
    <div style={{ background: BG, minHeight: '100vh', padding: '32px 24px 80px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'inline-block', background: '#F5F3FF', color: PURPLE, fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 100, marginBottom: 12 }}><svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 6 }}><path d="M448 256A192 192 0 1 0 64 256a192 192 0 1 0 384 0zM0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256zm256 80a80 80 0 1 0 0-160 80 80 0 1 0 0 160zm0-224a144 144 0 1 1 0 288 144 144 0 1 1 0-288zM224 256a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"/></svg> Shared AI Visibility Projection</div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: NAVY, margin: '0 0 6px' }}>
            {p.businessType ? `${p.businessType}` : 'Local business'}{p.city ? ` · ${p.city}` : ''}
          </h1>
          <p style={{ fontSize: 15, color: GRAY, margin: 0 }}>A projected AI visibility roadmap based on real data from similar businesses.</p>
        </div>

        <div style={card}>
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 13, color: GRAY }}>Current score</div>
              <div style={{ fontSize: 40, fontWeight: 900, color: NAVY }}>{p.currentScore ?? '—'}<span style={{ fontSize: 16, color: GRAY }}>/100</span></div>
            </div>
            <div>
              <div style={{ fontSize: 13, color: GRAY }}>Projected score</div>
              <div style={{ fontSize: 40, fontWeight: 900, color: PURPLE }}>{min}–{max}<span style={{ fontSize: 16, color: GRAY }}>/100</span></div>
              <div style={{ fontSize: 12, color: GRAY }}>over {p.totalWeeks ?? 8}–{(p.totalWeeks ?? 8) + 4} weeks</div>
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 6 }}>
              <span>Confidence</span><span>{confidence}%</span>
            </div>
            <div style={{ height: 12, background: '#F1F5F9', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, confidence)}%`, height: '100%', background: confidenceColor(confidence) }} />
            </div>
            {p.basisBadge && (
              <div style={{ marginTop: 10, fontSize: 13, color: NAVY }}>
                <strong>{p.basisBadge}</strong>{p.basisLabel ? ` — ${p.basisLabel}` : ''}
              </div>
            )}
          </div>
        </div>

        {Array.isArray(p.fixProjections) && p.fixProjections.length > 0 && (
          <div style={card}>
            <div style={{ fontSize: 18, fontWeight: 800, color: NAVY, marginBottom: 16 }}>Projected timeline</div>
            {p.fixProjections.map((f, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${BORDER}`, fontSize: 14, gap: 8, flexWrap: 'wrap' }}>
                <span style={{ color: NAVY, fontWeight: 600 }}>Week {f.weekStart}–{f.weekEnd}: {f.fixTitle}</span>
                <span style={{ color: PURPLE, fontWeight: 700 }}>{f.pointsGainedRange} projected</span>
              </div>
            ))}
          </div>
        )}

        {(p.revenueRecovered != null) && (
          <div style={card}>
            <div style={{ fontSize: 18, fontWeight: 800, color: NAVY, marginBottom: 8 }}>Estimated revenue recovery</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: '#22c55e' }}>up to {sym}{(p.revenueRecovered ?? 0).toLocaleString()}<span style={{ fontSize: 15, color: GRAY }}>/month*</span></div>
            {p.revenueRecoveredAnnual != null && (
              <div style={{ fontSize: 15, color: NAVY, marginTop: 4 }}>up to {sym}{(p.revenueRecoveredAnnual ?? 0).toLocaleString()}/year*</div>
            )}
            <p style={disclaimerStyle}>*Estimated based on the inputs used. Actual revenue impact varies. Not a guarantee of results.</p>
          </div>
        )}

        <div style={{ ...card, background: '#F5F3FF', borderColor: '#DDD6FE', textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: GRAY, marginBottom: 16, fontStyle: 'italic' }}>{SIMULATOR_DISCLAIMER}</p>
          <Link href="https://rankall.io" style={{ display: 'inline-block', background: PURPLE, color: WHITE, padding: '12px 28px', borderRadius: 10, fontWeight: 700, textDecoration: 'none' }}>See your projection free <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
        </div>
      </div>
    </div>
  );
}
