'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { gradeLabel } from '@/lib/projection';
import { Geist, Geist_Mono } from 'next/font/google';

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

// ── b361: b35q design tokens on staging logic ──
const BG     = '#F6F6FB';
const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#E7E7F0';
const BLUE   = '#1B17FF';
const GRAY   = '#55556A';
const RED    = '#B4232A';
const GREEN  = '#12A150';

const ALL_PLATFORMS = ['ChatGPT', 'Gemini', 'Perplexity', 'Grok', 'Copilot', 'Claude', 'DeepSeek', 'Mistral', 'Kimi', 'Groq', 'Google AI', 'Meta AI'];

// Grade bands: the ONE table in lib/projection (gradeLabel) — the same label
// the agency dashboard shows for this client. Colours only here.
const GRADE_COLORS: Record<string, { color: string; bg: string }> = {
  Dominant: { color: '#065F46', bg: '#D1FAE5' },
  Strong: { color: '#166534', bg: '#DCFCE7' },
  Visible: { color: '#1E40AF', bg: '#DBEAFE' },
  Emerging: { color: '#92400E', bg: '#FEF3C7' },
  'Not Visible': { color: '#991B1B', bg: '#FEE2E2' },
};
function getGrade(score: number): { grade: string; color: string; bg: string } {
  const grade = gradeLabel(score);
  return { grade, ...(GRADE_COLORS[grade] ?? GRADE_COLORS['Not Visible']) };
}

interface AgencyClient {
  agency_user_id: string;
  client_name: string;
  scan_id: string | null;
  latest_score: number | null;
}

interface AgencySettings {
  agency_name: string;
  agency_logo_url: string | null;
  agency_primary_color: string | null;
  agency_email: string | null;
}

const PURPLE = '#7C3AED';

interface Fix {
  title: string;
  impact: string;
}

export default function ClientDashboardPage() {
  const [loading, setLoading]             = useState(true);
  const [clientData, setClientData]       = useState<AgencyClient | null>(null);
  const [agencySettings, setAgencySettings] = useState<AgencySettings | null>(null);
  const [score, setScore]                 = useState<number | null>(null);
  const [platforms, setPlatforms]         = useState<Record<string, boolean>>({});
  const [fixes, setFixes]                 = useState<Fix[]>([]);
  const [error, setError]                 = useState<string | null>(null);
  // b89k: same state split as b89n/b89m — 401 signed-out / 404 no
  // client / failure, each in the page shell with a heading instead
  // of one bare red line.
  const [errKind, setErrKind] = useState<'unauth' | 'noclient' | 'failed' | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      setErrKind(null);
      // Data comes from /api/client-portal/overview, which resolves this
      // signed-in client's agency link server-side and reads the linked
      // rankall_scans row (the old code queried an empty `scans` table, so
      // every tile rendered red with no error).
      try {
        const res = await fetch('/api/client-portal/overview');
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? 'Failed to load your dashboard.');
          setErrKind(res.status === 401 ? 'unauth' : res.status === 404 ? 'noclient' : 'failed');
          setLoading(false);
          return;
        }
        setClientData({
          agency_user_id: '',
          client_name: data.client?.clientName ?? '',
          scan_id: data.scan?.id ?? null,
          latest_score: data.client?.latestScore ?? null,
        });
        if (data.agency) setAgencySettings(data.agency as AgencySettings);
        setScore(data.scan?.score ?? data.client?.latestScore ?? null);
        setPlatforms(data.platforms ?? {});
        setFixes((data.fixes ?? []).slice(0, 3).map((f: { title: string; predictedImpact: number | null }) => ({
          title: f.title,
          impact: f.predictedImpact != null ? `Est. +${f.predictedImpact} pts` : '',
        })));
      } catch {
        setError('Failed to load your dashboard. Please try again.');
        setErrKind('failed');
      }
      setLoading(false);
    }

    load();
  }, [reloadTick]);

  if (loading) {
    return (
      <div className={`${geistSans.variable} ${geistMono.variable}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: BG, fontFamily: 'var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif' }}>
        <p style={{ color: GRAY, fontSize: 15 }}>Loading your dashboard…</p>
      </div>
    );
  }

  if (errKind === 'unauth') {
    return (
      <div style={{ minHeight: '100vh', background: BG, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '48px 24px' }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: NAVY, margin: '0 0 8px' }}>My Score</h1>
          <p style={{ fontSize: 14, color: GRAY, margin: '0 0 16px' }}>Sign in to view your AI visibility score.</p>
          <Link href="/login?next=/dashboard/client" style={{ fontSize: 14, color: BLUE, fontWeight: 700 }}>Sign in →</Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: BG, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '48px 24px' }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: NAVY, margin: '0 0 8px' }}>My Score</h1>
          <p style={{ fontSize: 14, color: GRAY, margin: '0 0 28px' }}>Your AI visibility, managed by your agency.</p>
          <div style={{ background: W, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px' }}>
            <p style={{ color: errKind === 'noclient' ? GRAY : '#DC2626', fontSize: 14, margin: 0 }}>{error}</p>
            {errKind === 'failed' && (
              <button onClick={() => setReloadTick(t => t + 1)} style={{ background: 'none', border: 'none', color: BLUE, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0, marginTop: 10 }}>Retry</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const displayScore = score ?? 0;
  const { grade, color: gradeColor, bg: gradeBg } = getGrade(displayScore);
  const accentColor = agencySettings?.agency_primary_color || BLUE;
  const agencyName  = agencySettings?.agency_name || 'Your Agency';

  return (
    <div className={`${geistSans.variable} ${geistMono.variable}`} style={{ minHeight: '100vh', background: BG, fontFamily: 'var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif' }}>
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .dash-card { animation: fadeInUp 0.5s ease both; transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .dash-card:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(27,23,255,0.15); }
        .lbl{font-family:var(--font-geist-mono),monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#5F5F78}
        .card{background:#fff;border:1px solid #E7E7F0;border-radius:16px;padding:22px;min-width:0}
        .h3{margin:0;font-size:17px;font-weight:700;letter-spacing:-0.01em}
        .sub{margin:0;font-size:13px;color:#55556A}
        .pagehead{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}
        @media (max-width:639px){
          .pagehead{flex-direction:column;align-items:stretch}
          .card{padding:18px}
        }
        @media (prefers-reduced-motion:reduce){*{animation:none!important}}
      `}</style>
      {/* Top bar — "Managed by [Agency]" badge, top-right, purple */}
      <div style={{ background: W, borderBottom: `1px solid ${BORDER}`, padding: '12px 32px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: PURPLE, color: '#fff',
          borderRadius: 100, padding: '5px 14px',
          fontSize: 12, fontWeight: 700,
        }}>
          Managed by {agencyName}
        </span>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Agency branding */}
        {agencySettings?.agency_logo_url && (
          <div style={{ textAlign: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={agencySettings.agency_logo_url} alt={agencyName} style={{ maxHeight: 48, objectFit: 'contain' }} />
          </div>
        )}

        {/* Hero score */}
        <div className="card dash-card" style={{ padding: '40px 32px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: GRAY, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
            Your AI Visibility Score
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 16 }}>
            <span style={{ fontSize: 80, fontWeight: 900, color: accentColor, lineHeight: 1 }}>{displayScore}</span>
            <span style={{ fontSize: 24, color: GRAY, alignSelf: 'flex-end', paddingBottom: 8 }}>/100</span>
            <div style={{ background: gradeBg, borderRadius: 12, padding: '8px 20px', marginLeft: 8 }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: gradeColor }}>{grade}</span>
            </div>
          </div>
          {clientData?.client_name && (
            <p style={{ fontSize: 15, color: GRAY }}>
              Score for <strong style={{ color: NAVY }}>{clientData.client_name}</strong>
            </p>
          )}
        </div>

        {/* Platform grid */}
        <div className="card dash-card" style={{ padding: '28px 32px' }}>
          <h2 className="h3" style={{ marginBottom: 20 }}>AI Platform Visibility</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {ALL_PLATFORMS.map(p => {
              const found = platforms[p] ?? false;
              return (
                <div key={p} style={{
                  background: found ? '#F0FDF4' : '#FFF7F7',
                  border: `1.5px solid ${found ? '#BBF7D0' : '#FEE2E2'}`,
                  borderRadius: 10,
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}>
                  <span style={{ fontSize: 16 }}>{found ? <svg viewBox="0 0 512 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg> : <svg viewBox="0 0 512 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM175 175c9.4-9.4 24.6-9.4 33.9 0l47 47 47-47c-9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-47 47 47 47c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-47-47-47 47c-9.4 9.4 24.6 9.4-33.9 0s-9.4 24.6 0-33.9l47-47-47-47c-9.4-9.4-9.4-24.6 0-33.9z"/></svg>}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: found ? GREEN : RED }}>{p}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top 3 fixes */}
        <div className="card dash-card" style={{ padding: '28px 32px' }}>
          <h2 className="h3" style={{ marginBottom: 20 }}>Your Top 3 Priorities</h2>
          {fixes.length > 0 ? (
            <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {fixes.map((fix, i) => (
                <li key={i} style={{
                  display: 'flex',
                  gap: 16,
                  padding: '16px 0',
                  borderBottom: i < fixes.length - 1 ? `1px solid ${BORDER}` : 'none',
                }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
            <p style={{ color: GRAY, fontSize: 14 }}>Your agency will add your personalised fix priorities here shortly.</p>
          )}
        </div>

        {/* Footer note */}
        <p style={{ textAlign: 'center', fontSize: 13, color: GRAY }}>
          Questions? Contact your account manager at <strong>{agencyName}</strong>.
        </p>
      </div>
    </div>
  );
}
