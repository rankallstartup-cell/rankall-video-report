'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Geist, Geist_Mono } from 'next/font/google';

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

// ── b363: b35q design tokens (Overview v2 mockup) on staging logic ──
const BG     = '#F6F6FB';
const NAVY   = '#0A0A14';
const BORDER = '#E7E7F0';
const GRAY   = '#55556A';
const RED    = '#B4232A';
const BLUE   = '#1B17FF';
const W      = '#FFFFFF';

// Shared b35q card/button/pagehead treatment (copied from app/dashboard/page.tsx).
const STYLE = `
  @keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  .dash-card { animation: fadeInUp 0.5s ease both; transition: transform 0.2s ease, box-shadow 0.2s ease; }
  .dash-card:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(27,23,255,0.15); }
  .mono{font-family:var(--font-geist-mono),ui-monospace,Menlo,monospace}
  .card{background:#fff;border:1px solid #E7E7F0;border-radius:16px;padding:22px;min-width:0}
  .h3{margin:0;font-size:17px;font-weight:700;letter-spacing:-0.01em;color:#0A0A14}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 18px;border-radius:12px;font-family:inherit;font-weight:600;font-size:14px;border:0;cursor:pointer;white-space:nowrap;text-decoration:none}
  .btn-line{background:#fff;color:#0A0A14;border:1px solid #D9D9E6}.btn-line:hover{border-color:#0A0A14;color:#0A0A14}
  .pagehead{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}
  @media (max-width:639px){
    .pagehead{flex-direction:column;align-items:stretch}
    .card{padding:18px}
  }
  @media (prefers-reduced-motion:reduce){*{animation:none!important}}
`;

interface ScanRow { id: string; score: number | null; created_at: string; }

export default function ClientReportsPage() {
  const [loading, setLoading] = useState(true);
  const [scans, setScans]     = useState<ScanRow[]>([]);
  const [error, setError]     = useState<string | null>(null);
  // b89n: the API's verdicts are distinct states — 401 is a signed-out
  // visitor (needs a sign-in gate, not a red error line inside the
  // shell), 404 is a signed-in non-client (the honest no-client
  // state), anything else is a load failure. All three now render
  // inside the page shell with its heading (b360 lesson: error
  // returns carry the same shell/head as the main return).
  const [errKind, setErrKind] = useState<'unauth' | 'noclient' | 'failed' | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      setErrKind(null);
      // Reports come from /api/client-portal/overview (the rankall_scans row
      // linked to this client). The old code queried an empty `scans` table,
      // so the list was empty and no report was reachable.
      try {
        const res = await fetch('/api/client-portal/overview');
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? 'Failed to load your reports.');
          setErrKind(res.status === 401 ? 'unauth' : res.status === 404 ? 'noclient' : 'failed');
          setLoading(false);
          return;
        }
        if (data.scan) {
          setScans([{ id: data.scan.id, score: data.scan.score, created_at: data.scan.createdAt ?? '' }]);
        }
      } catch {
        setError('Failed to load your reports. Please try again.');
        setErrKind('failed');
      }
      setLoading(false);
    }
    load();
  }, [reloadTick]);

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: BG }}><p style={{ color: GRAY, fontSize: 15 }}>Loading…</p></div>;

  if (errKind === 'unauth') return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: NAVY, margin: '0 0 8px' }}>My Reports</h1>
        <p style={{ fontSize: 14, color: GRAY, margin: '0 0 16px' }}>Sign in to view your reports.</p>
        <Link href="/login?next=/dashboard/client/reports" style={{ fontSize: 14, color: BLUE, fontWeight: 700 }}>Sign in →</Link>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: NAVY, margin: '0 0 8px' }}>My Reports</h1>
        <p style={{ fontSize: 14, color: GRAY, margin: '0 0 28px' }}>Your AI visibility reports, prepared by your agency.</p>
        <div style={{ background: W, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px' }}>
          <p style={{ color: errKind === 'noclient' ? GRAY : '#DC2626', fontSize: 14, margin: 0 }}>{error}</p>
          {errKind === 'failed' && (
            <button onClick={() => setReloadTick(t => t + 1)} style={{ background: 'none', border: 'none', color: BLUE, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0, marginTop: 10 }}>Retry</button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className={`${geistSans.variable} ${geistMono.variable}`} style={{ background: BG, minHeight: '100vh', padding: '28px 24px', fontFamily: 'var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <style>{STYLE}</style>
      <div style={{ maxWidth: 720, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <header className="pagehead">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, letterSpacing: '-0.035em', color: NAVY }}>My Reports</h1>
            <p style={{ margin: 0, fontSize: 14, color: GRAY }}>Your AI visibility reports, prepared by your agency.</p>
          </div>
        </header>
        <div className="card dash-card" style={{ padding: 0, overflow: 'hidden' }}>
          {scans.length > 0 ? scans.map((s, i) => (
            <div key={s.id} style={{ padding: '16px 22px', borderBottom: i < scans.length - 1 ? `1px solid ${BORDER}` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <p className="h3" style={{ margin: '0 0 2px' }}>AI Visibility Report</p>
                <p style={{ fontSize: 12, color: GRAY, margin: 0 }}>{s.created_at ? new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unknown'}<span className="mono">{s.score != null ? ` · Score ${s.score}/100` : ''}</span></p>
              </div>
              <Link href={`/report/${s.id}`} className="btn btn-line" style={{ minHeight: 36, fontSize: 13, padding: '0 16px' }}>View →</Link>
            </div>
          )) : (
            <p style={{ color: GRAY, fontSize: 14, padding: '24px', margin: 0 }}>No reports yet. Your agency will publish your first report shortly.</p>
          )}
        </div>
      </div>
    </div>
  );
}
