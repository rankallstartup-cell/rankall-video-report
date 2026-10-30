'use client';

import { useEffect, useState, useCallback } from 'react';
import { getBrowserClient } from '@/lib/supabase';
import { useAdminGuard } from '@/lib/useAdminGuard';

const NAVY = '#0A0A14';
const GRAY = '#55556A';
const BLUE = '#1B17FF';
const GREEN = '#059669';
const BORDER = '#E7E7F0';
const W = '#fff';

interface LogEntry {
  id: string;
  business_name: string;
  email: string;
  city: string;
  industry: string;
  scan_id: string | null;
  score: number;
  overall_score: number | null;
  sent_at: string;
  status: string;
  subject: string | null;
  body_html: string | null;
  competitor_name: string | null;
  template_version: string | null;
}

export default function OutreachLogPage() {
  // ax77: page-level admin gate — every other /admin page has one; this was
  // proxy-only. useAdminGuard redirects non-admins to /dashboard?restricted=1.
  const { checking, isAdmin } = useAdminGuard();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHtml, setSelectedHtml] = useState<string | null>(null);
  const [selectedBiz, setSelectedBiz] = useState<string>('');

  const fetchLogs = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    const sb = getBrowserClient();
    const { data } = await sb
      .from('outreach_log')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(200);
    setLogs((data as LogEntry[]) || []);
    setLoading(false);
  }, [isAdmin]);  // ax77: refire once the admin guard resolves

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  if (checking) {
    return <div style={{ padding: 32 }}>Checking admin access…</div>;
  }
  if (!isAdmin) return null;

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1200, color: NAVY }}>
      <h1 style={{ fontSize: 24, fontWeight: 900, margin: '0 0 6px' }}>Outreach Log</h1>
      <p style={{ fontSize: 13, color: GRAY, margin: '0 0 24px' }}>
        Every email sent, with the exact HTML that was delivered.
      </p>

      {loading ? (
        <p style={{ color: GRAY }}>Loading...</p>
      ) : logs.length === 0 ? (
        <p style={{ color: GRAY }}>No emails sent yet.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                {['Date', 'Recipient', 'Business', 'Industry', 'City', 'Score', 'Competitor', 'Email'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 700, color: GRAY, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <td style={{ padding: '10px 10px', whiteSpace: 'nowrap' }}>
                    {new Date(log.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    <span style={{ color: GRAY, marginLeft: 6, fontSize: 11 }}>
                      {new Date(log.sent_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </td>
                  <td style={{ padding: '10px 10px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.email}</td>
                  <td style={{ padding: '10px 10px', fontWeight: 700 }}>{log.business_name}</td>
                  <td style={{ padding: '10px 10px' }}>{log.industry}</td>
                  <td style={{ padding: '10px 10px' }}>{log.city}</td>
                  <td style={{ padding: '10px 10px' }}>
                    {log.overall_score != null ? (
                      <span style={{ fontWeight: 700, color: log.overall_score >= 50 ? GREEN : '#DC2626' }}>{log.overall_score}</span>
                    ) : (
                      <span style={{ color: GRAY }}>{log.score}</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 10px', color: log.competitor_name ? NAVY : GRAY }}>
                    {log.competitor_name || '—'}
                  </td>
                  <td style={{ padding: '10px 10px' }}>
                    {log.body_html ? (
                      <button
                        onClick={() => { setSelectedHtml(log.body_html); setSelectedBiz(log.business_name); }}
                        style={{ background: 'none', border: `1px solid ${BLUE}`, borderRadius: 6, padding: '4px 10px', color: BLUE, fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
                      >
                        View
                      </button>
                    ) : (
                      <span style={{ fontSize: 11, color: GRAY }}>N/A</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedHtml && (
        <div
          onClick={() => setSelectedHtml(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: W, borderRadius: 16, width: '100%', maxWidth: 700, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: 15 }}>Email sent to {selectedBiz}</span>
              <button
                onClick={() => setSelectedHtml(null)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: GRAY, padding: '4px 8px' }}
              >
                &times;
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 0 }}>
              <iframe
                srcDoc={selectedHtml}
                sandbox=""
                style={{ width: '100%', height: '80vh', border: 'none' }}
                title="Email preview"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
