'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// ── b362: b35q design tokens on staging logic ──
const BG     = '#F6F6FB';
const NAVY   = '#0A0A14';
const BORDER = '#E2E8F0';
const BLUE   = '#1B17FF';
const GRAY   = '#64748B';
const W      = '#FFFFFF';
const GREEN  = '#059669';
const RED    = '#B4232A';

const ALL_PLATFORMS = ['ChatGPT', 'Gemini', 'Perplexity', 'Grok', 'Copilot', 'Claude', 'DeepSeek', 'Mistral', 'Kimi', 'Groq', 'Google AI', 'Meta AI'];

export default function ClientPlatformsPage() {
  const [loading, setLoading]     = useState(true);
  const [platforms, setPlatforms] = useState<Record<string, boolean>>({});
  const [error, setError]         = useState<string | null>(null);
  // b89m: same state split as b89n — 401 signed-out / 404 no client /
  // failure, each rendered inside the page shell with its heading
  // instead of one bare red line.
  const [errKind, setErrKind] = useState<'unauth' | 'noclient' | 'failed' | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      setErrKind(null);
      // Platforms come from /api/client-portal/overview (rankall_platform_results
      // for the scan linked to this client). The old code queried an empty
      // `scans` table, so every tile rendered red.
      try {
        const res = await fetch('/api/client-portal/overview');
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? 'Failed to load your platforms.');
          setErrKind(res.status === 401 ? 'unauth' : res.status === 404 ? 'noclient' : 'failed');
          setLoading(false);
          return;
        }
        setPlatforms(data.platforms ?? {});
      } catch {
        setError('Failed to load your platforms. Please try again.');
        setErrKind('failed');
      }
      setLoading(false);
    }
    load();
  }, [reloadTick]);

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: BG }}><p style={{ color: GRAY, fontSize: 15 }}>Loading…</p></div>;

  if (errKind === 'unauth') return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '48px 24px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: NAVY, margin: '0 0 8px' }}>My Platforms</h1>
        <p style={{ fontSize: 14, color: GRAY, margin: '0 0 16px' }}>Sign in to see which AI platforms recommend your business.</p>
        <Link href="/login?next=/dashboard/client/platforms" style={{ fontSize: 14, color: BLUE, fontWeight: 700 }}>Sign in →</Link>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '48px 24px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: NAVY, margin: '0 0 8px' }}>My Platforms</h1>
        <p style={{ fontSize: 14, color: GRAY, margin: '0 0 28px' }}>Which AI platforms are recommending your business.</p>
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
    <div style={{ minHeight: '100vh', background: BG, fontFamily: 'var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif', padding: '28px 24px' }}>
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .dash-card { animation: fadeInUp 0.5s ease both; transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .dash-card:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(27,23,255,0.15); }
        .card{background:#fff;border:1px solid #E7E7F0;border-radius:16px;padding:22px;min-width:0}
        .pagehead{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}
        @media (max-width:639px){
          .pagehead{flex-direction:column;align-items:stretch}
          .card{padding:18px}
        }
        @media (prefers-reduced-motion:reduce){*{animation:none!important}}
      `}</style>
      <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <header className="pagehead">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.035em', color: NAVY, margin: 0 }}>My Platforms</h1>
            <p style={{ fontSize: 14, color: GRAY, margin: 0 }}>Which AI platforms are recommending your business.</p>
          </div>
        </header>
        <div className="card dash-card" style={{ padding: '28px 32px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {ALL_PLATFORMS.map(p => {
              const found = platforms[p] ?? false;
              return (
                <div key={p} style={{ background: found ? '#F0FDF4' : '#FFF7F7', border: `1.5px solid ${found ? '#BBF7D0' : '#FEE2E2'}`, borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>{found ? <svg viewBox="0 0 512 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg> : <svg viewBox="0 0 512 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM175 175c9.4-9.4 24.6-9.4 33.9 0l47 47 47-47c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-47 47 47 47c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-47-47-47 47c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l47-47-47-47c-9.4-9.4-9.4-24.6 0-33.9z"/></svg>}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: found ? GREEN : RED }}>{p}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
