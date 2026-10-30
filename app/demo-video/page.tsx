import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import HomepageScanVideo from '@/components/HomepageScanVideo';

export const dynamic = 'force-dynamic';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  // b8ag: the old title/description promised a REAL scan even when no
  // demo is recorded. Neutral copy is honest in both states.
  title: { absolute: 'Demo Video | Rankall' },
  description:
    'See how a Rankall AI visibility scan works across 12 AI platforms — or run your own free scan to see real numbers for your business.',
  alternates: { canonical: '/demo-video' },
};

export default async function DemoVideoPage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: latest } = await supabase
    .from('demo_videos')
    .select('audio_url, scan_data, script, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
    .then(r => r, () => ({ data: null }));

  // ax80: no invented demo numbers. The old fallback (score 31, competitor
  // 78, $4,200 gap) and the per-prop ?? defaults were presented as a "real
  // scan". Without a stored demo with measured numbers, the video is hidden.
  const sd = (latest as any)?.scan_data as Record<string, unknown> | undefined;
  const measured = !!sd
    && typeof sd.score === 'number'
    && typeof sd.competitor_score === 'number'
    && typeof sd.revenue_leak === 'number';
  const audioUrl = (latest as any)?.audio_url ?? null;

  return (
    <main style={{ minHeight: '100vh', background: '#0f0f23', color: '#fff', fontFamily: 'sans-serif', padding: '60px 20px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <p style={{ color: '#a78bfa', fontSize: 14, margin: '0 0 8px', textTransform: 'uppercase' as const, letterSpacing: 1 }}>See it in action</p>
        {/* b8ag: the old heading promised "a real Rankall scan" even when
            nothing was recorded — it contradicted the body. */}
        <h1 style={{ fontSize: 'clamp(24px, 5vw, 36px)', fontWeight: 800, margin: '0 0 8px' }}>{measured ? 'Watch a real Rankall scan' : 'Demo video coming soon'}</h1>
        <p style={{ color: '#9ca3af', fontSize: 16, margin: '0 0 32px' }}>
          {measured
            ? 'Recorded scan of a Chicago dentist. Measured scores; the revenue gap is an estimate.'
            : 'The demo scan has not been recorded yet.'}
        </p>

        {/* Animated live scan video — only with measured numbers */}
        {measured && sd ? (
          <div style={{ marginBottom: 32 }}>
            <HomepageScanVideo
              score={sd.score as number}
              competitor={(sd.competitor_name as string) || 'the top competitor'}
              competitorScore={sd.competitor_score as number}
              revenueGap={sd.revenue_leak as number}
              audioUrl={audioUrl}
            />
          </div>
        ) : (
          <div style={{ background: '#1f1f3a', borderRadius: 12, padding: 20, marginBottom: 32, textAlign: 'center' as const }}>
            <p style={{ color: '#9ca3af', fontSize: 14, margin: 0 }}>No measured demo scan is available yet — run your own free scan to see real numbers.</p>
          </div>
        )}

        {/* Audio player */}
        {audioUrl ? (
          <div style={{ background: '#1f1f3a', borderRadius: 12, padding: 20, marginBottom: 32, textAlign: 'center' as const }}>
            <p style={{ color: '#d1d5db', fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>
              <svg viewBox="0 0 512 512" width="14" height="14" fill="currentColor" aria-hidden="true" style={{verticalAlign: '-2px', marginRight: 6}}><path d="M256 80C149.9 80 62.4 159.4 49.6 262c9.4-3.8 19.6-6 30.4-6c26.5 0 48 21.5 48 48l0 128c0 26.5-21.5 48-48 48c-44.2 0-80-35.8-80-80l0-16 0-48 0-48C0 146.6 114.6 32 256 32s256 114.6 256 256l0 48 0 48 0 16c0 44.2-35.8 80-80 80c-26.5 0-48-21.5-48-48l0-128c0-26.5 21.5-48 48-48c10.8 0 21 2.1 30.4 6C449.6 159.4 362.1 80 256 80z"/></svg> Listen to the full 3-minute analysis
            </p>
            <audio controls style={{ width: '100%' }} src={audioUrl}>
              Your browser does not support audio.
            </audio>
          </div>
        ) : (
          <div style={{ background: '#1f1f3a', borderRadius: 12, padding: 20, marginBottom: 32, textAlign: 'center' as const }}>
            <p style={{ color: '#6b7280', fontSize: 14, margin: 0 }}>
              <svg viewBox="0 0 512 512" width="14" height="14" fill="currentColor" aria-hidden="true" style={{verticalAlign: '-2px', marginRight: 6}}><path d="M256 80C149.9 80 62.4 159.4 49.6 262c9.4-3.8 19.6-6 30.4-6c26.5 0 48 21.5 48 48l0 128c0 26.5-21.5 48-48 48c-44.2 0-80-35.8-80-80l0-16 0-48 0-48C0 146.6 114.6 32 256 32s256 114.6 256 256l0 48 0 48 0 16c0 44.2-35.8 80-80 80c-26.5 0-48-21.5-48-48l0-128c0-26.5 21.5-48 48-48c10.8 0 21 2.1 30.4 6C449.6 159.4 362.1 80 256 80z"/></svg> Audio narration will be added when the demo is recorded.
            </p>
          </div>
        )}

        {/* Transcript */}
        {(latest as any)?.script && (
          <details style={{ background: '#1f1f3a', borderRadius: 12, padding: 20, marginBottom: 32, border: '1px solid #374151' }}>
            <summary style={{ cursor: 'pointer', color: '#a78bfa', fontWeight: 600, fontSize: 14, userSelect: 'none' as const }}>
              TRANSCRIPT — Full 3-minute analysis script
            </summary>
            <pre style={{ marginTop: 16, whiteSpace: 'pre-wrap', fontSize: 13, color: '#d1d5db', lineHeight: 1.8, fontFamily: 'inherit' }}>
              {(latest as any).script}
            </pre>
          </details>
        )}

        <div style={{ textAlign: 'center' as const }}>
          <a href="/" style={{ display: 'inline-block', background: '#1B17FF', color: '#fff', textDecoration: 'none', borderRadius: 12, padding: '16px 32px', fontSize: 18, fontWeight: 700 }}>
            Scan My Business Free <svg viewBox="0 0 448 512" width="16" height="16" fill="#fff" aria-hidden="true" style={{verticalAlign: '-2px', marginLeft: 6}}><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
          </a>
          <p style={{ color: '#6b7280', fontSize: 14, marginTop: 12 }}>Free scan. Results in about 90 seconds.</p>
        </div>
      </div>
    </main>
  );
}
