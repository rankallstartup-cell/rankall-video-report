'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase';
import { isAdminUser } from '@/lib/planConfig';

// CONV-00: funnel conversion dashboard. Stage-by-stage conversion %
// per traffic source, from the funnel_events table.

const BG = '#F6F6FB';
const CARD = '#FFFFFF';
const BORDER = '#E7E7F0';
const NAVY = '#0A0A14';
const GRAY = '#55556A';
const BLUE = '#1B17FF';
const GREEN = '#059669';

const STAGE_LABELS: Record<string, string> = {
  scan_started: 'Scan started',
  scan_completed: 'Scan completed',
  report_viewed: 'Report viewed',
  report_shared: 'Report shared',
  profile_claimed: 'Profile claimed',
  trial_started: 'Trial started',
  paid: 'Paid',
};

const SOURCES = ['cold', 'influencer', 'agency', 'outbound', 'unknown'] as const;

interface FunnelData {
  days: number;
  total_events: number;
  stages: Array<{ event: string; total: number; by_source: Record<string, number> }>;
  conversions: Array<{ from: string; to: string; total_pct: number | null; by_source: Record<string, number | null> }>;
  viral?: {
    shares: number;
    viewers: number;
    coefficient: number | null;
    by_source: Record<string, number | null>;
  };
  note?: string;
}

export default function ConversionDashboard() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [data, setData] = useState<FunnelData | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBrowserClient().auth.getUser().then(({ data: { user } }) => {
      if (!isAdminUser(user?.email)) { router.replace('/dashboard'); }
      else { setAuthorized(true); }
    });
  }, [router]);

  useEffect(() => {
    if (!authorized) return;
    setLoading(true);
    fetch(`/api/admin/funnel?days=${days}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [authorized, days]);

  if (!authorized) return null;

  return (
    <div style={{ minHeight: '100vh', background: BG, padding: 32, fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: NAVY, margin: 0 }}>Conversion Funnel</h1>
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
            style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${BORDER}`, background: CARD, color: NAVY }}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
        <p style={{ color: GRAY, margin: '0 0 24px', fontSize: 14 }}>
          Stage-by-stage conversion per traffic source. Baseline for CONV-01…06 lift measurement.
          {data && ` · ${data.total_events.toLocaleString()} events in range.`}
        </p>

        {loading && <p style={{ color: GRAY }}>Loading…</p>}
        {!loading && data && data.note === 'no data yet' && (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 32, textAlign: 'center', color: GRAY }}>
            No funnel events yet. Events start flowing once the migration runs and traffic hits the instrumented stages.
          </div>
        )}

        {!loading && data && data.stages.length > 0 && (
          <>
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24, marginBottom: 24, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: GRAY }}>
                    <th style={{ padding: '8px 12px', fontWeight: 600 }}>Stage</th>
                    {SOURCES.map((s) => (
                      <th key={s} style={{ padding: '8px 12px', fontWeight: 600, textTransform: 'capitalize' }}>{s}</th>
                    ))}
                    <th style={{ padding: '8px 12px', fontWeight: 600 }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stages.map((st) => (
                    <tr key={st.event} style={{ borderTop: `1px solid ${BORDER}` }}>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: NAVY }}>{STAGE_LABELS[st.event] ?? st.event}</td>
                      {SOURCES.map((s) => (
                        <td key={s} style={{ padding: '10px 12px', color: NAVY }}>{(st.by_source[s] ?? 0).toLocaleString()}</td>
                      ))}
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: NAVY }}>{st.total.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 style={{ fontSize: 18, fontWeight: 800, color: NAVY, margin: '0 0 12px' }}>Step conversion %</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {data.conversions.map((c) => (
                <div key={`${c.from}-${c.to}`} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 20 }}>
                  <div style={{ fontSize: 13, color: GRAY, marginBottom: 4 }}>
                    {STAGE_LABELS[c.from]} → {STAGE_LABELS[c.to]}
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: c.total_pct == null ? GRAY : GREEN, marginBottom: 12 }}>
                    {c.total_pct == null ? '—' : `${c.total_pct}%`}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {SOURCES.map((s) => {
                      const v = c.by_source[s];
                      return (
                        <span key={s} style={{ fontSize: 12, background: BG, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 8px', color: GRAY }}>
                          <span style={{ textTransform: 'capitalize' }}>{s}</span>: <strong style={{ color: NAVY }}>{v == null ? '—' : `${v}%`}</strong>
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <p style={{ color: GRAY, fontSize: 12, marginTop: 24 }}>
              Counts are distinct people per stage per source (user → email → scan fallback). A step with no
              previous-stage volume shows — instead of a misleading 0%.
            </p>

            {data.viral && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: NAVY, margin: '24px 0 12px' }}>Viral loop (CONV-01)</h2>
                <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24 }}>
                  <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', marginBottom: 16 }}>
                    <div>
                      <div style={{ fontSize: 12, color: GRAY, marginBottom: 4 }}>Shares</div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: NAVY }}>{data.viral.shares.toLocaleString()}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: GRAY, marginBottom: 4 }}>Report viewers</div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: NAVY }}>{data.viral.viewers.toLocaleString()}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: GRAY, marginBottom: 4 }}>Viral coefficient (shares / 100 views)</div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: data.viral.coefficient == null ? GRAY : BLUE }}>
                        {data.viral.coefficient == null ? '—' : data.viral.coefficient}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {SOURCES.map((s) => {
                      const v = data.viral!.by_source[s];
                      return (
                        <span key={s} style={{ fontSize: 12, background: BG, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '4px 8px', color: GRAY }}>
                          <span style={{ textTransform: 'capitalize' }}>{s}</span>: <strong style={{ color: NAVY }}>{v == null ? '—' : v}</strong>
                        </span>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
