'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Geist, Geist_Mono } from 'next/font/google';

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

// ── b360: b35q design tokens on staging logic ──
const BG     = '#F6F6FB';
const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#E7E7F0';
const BLUE   = '#1B17FF';
const GRAY   = '#55556A';
const RED    = '#B4232A';

interface Fix { title: string; impact: string; }

export default function ClientFixesPage() {
  const [loading, setLoading] = useState(true);
  const [fixes, setFixes]     = useState<Fix[]>([]);
  const [error, setError]     = useState<string | null>(null);
  // b89j: same state split as b89n/b89m/b89k — 401 signed-out / 404
  // no client / failure, each in the page shell with its heading.
  const [errKind, setErrKind] = useState<'unauth' | 'noclient' | 'failed' | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      setErrKind(null);
      // Fixes come from /api/client-portal/overview (generated_fixes for the
      // scan linked to this client). The old code queried an empty `scans`
      // table, so the list was silently empty.
      try {
        const res = await fetch('/api/client-portal/overview');
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? 'Failed to load your fixes.');
          setErrKind(res.status === 401 ? 'unauth' : res.status === 404 ? 'noclient' : 'failed');
          setLoading(false);
          return;
        }
        setFixes((data.fixes ?? []).map((f: { title: string; detail: string }) => ({
          title: f.title,
          impact: f.detail,
        })));
      } catch {
        setError('Failed to load your fixes. Please try again.');
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
        <h1 style={{ fontSize: 24, fontWeight: 900, color: NAVY, margin: '0 0 8px' }}>My Fixes</h1>
        <p style={{ fontSize: 14, color: GRAY, margin: '0 0 16px' }}>Sign in to view your fix priorities.</p>
        <Link href="/login?next=/dashboard/client/fixes" style={{ fontSize: 14, color: BLUE, fontWeight: 700 }}>Sign in →</Link>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: NAVY, margin: '0 0 8px' }}>My Fixes</h1>
        <p style={{ fontSize: 14, color: GRAY, margin: '0 0 28px' }}>Priorities your agency is working on to improve your AI visibility.</p>
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
    <div className={`${geistSans.variable} ${geistMono.variable}`} style={{ minHeight: '100vh', background: BG, fontFamily: 'var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif', padding: '28px 24px' }}>
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .dash-card { animation: fadeInUp 0.5s ease both; transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .dash-card:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(27,23,255,0.15); }
        .mono{font-family:var(--font-geist-mono),ui-monospace,Menlo,monospace}
        .lbl{font-family:var(--font-geist-mono),monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#5F5F78}
        .card{background:#fff;border:1px solid #E7E7F0;border-radius:16px;padding:22px;min-width:0}
        .h3{margin:0;font-size:17px;font-weight:700;letter-spacing:-0.01em}
        .sub{margin:0;font-size:13px;color:#55556A}
        .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 18px;border-radius:12px;font-family:inherit;font-weight:600;font-size:14px;border:0;cursor:pointer;white-space:nowrap;text-decoration:none}
        .btn-blue{background:#1B17FF;color:#fff}.btn-blue:hover{background:#1310C4;color:#fff}
        .btn-line{background:#fff;color:#0A0A14;border:1px solid #D9D9E6}.btn-line:hover{border-color:#0A0A14;color:#0A0A14}
        .pagehead{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}
        @media (max-width:639px){
          .pagehead{flex-direction:column;align-items:stretch}
          .card{padding:18px}
        }
        @media (prefers-reduced-motion:reduce){*{animation:none!important}}
      `}</style>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <header className="pagehead">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.035em', color: NAVY, margin: 0 }}>My Fixes</h1>
            <p style={{ fontSize: 14, color: GRAY, margin: 0 }}>Priorities your agency is working on to improve your AI visibility.</p>
          </div>
        </header>
        <div className="card dash-card" style={{ padding: '28px 32px' }}>
          {fixes.length > 0 ? (
            <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {fixes.map((fix, i) => (
                <li key={i} style={{ display: 'flex', gap: 16, padding: '16px 0', borderBottom: i < fixes.length - 1 ? `1px solid ${BORDER}` : 'none' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 900, color: '#fff' }}>{i + 1}</span>
                  </div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: '0 0 4px' }}>{fix.title}</p>
                    {fix.impact && <p style={{ fontSize: 13, color: GRAY, margin: 0 }}>{fix.impact}</p>}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p style={{ color: GRAY, fontSize: 14, margin: 0 }}>Your agency will add your personalised fix priorities here shortly.</p>
          )}
        </div>
      </div>
    </div>
  );
}
