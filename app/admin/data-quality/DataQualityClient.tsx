'use client';

import { useState, useEffect, useCallback } from 'react';

const BG = '#F6F6FB';
const CARD = '#FFFFFF';
const BORDER = '#E7E7F0';
const ACCENT = '#1B17FF';
const TEXT = '#0A0A14';
const MUTED = '#55556A';

type Severity = 'critical' | 'high' | 'medium' | 'low';

interface Issue {
  id: string;
  entity_type: string;
  entity_id: string;
  issue_type: string;
  severity: Severity;
  status: string;
  message: string;
  field?: string;
  created_at: string;
}

interface QuarantineRow {
  id: string;
  entity_type: string;
  reason: string;
  status: string;
  created_at: string;
}

interface BackfillResult {
  scansChecked: number;
  scansFlagged: number;
  outcomesChecked: number;
  outcomesFlagged: number;
}

const SEV_COLORS: Record<Severity, string> = {
  critical: '#DC2626',
  high: '#F97316',
  medium: '#EAB308',
  low: '#6B7280',
};

function fmtDate(s: string): string {
  if (!s) return '';
  try { return new Date(s).toLocaleString(); } catch { return s; }
}

const selectStyle: React.CSSProperties = {
  background: BG,
  color: TEXT,
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 14,
};

const btnStyle: React.CSSProperties = {
  background: 'transparent',
  color: ACCENT,
  border: `1px solid ${ACCENT}`,
  borderRadius: 6,
  padding: '4px 12px',
  fontSize: 13,
  cursor: 'pointer',
};

export default function DataQualityClient() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [quarantine, setQuarantine] = useState<QuarantineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null);

  const [severity, setSeverity] = useState('all');
  const [status, setStatus] = useState('open');
  const [entityType, setEntityType] = useState('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const iParams = new URLSearchParams();
      if (severity !== 'all') iParams.set('severity', severity);
      iParams.set('status', status);
      if (entityType !== 'all') iParams.set('entity_type', entityType);

      const qParams = new URLSearchParams();
      qParams.set('status', 'pending_review');
      if (entityType !== 'all') qParams.set('entity_type', entityType);

      const [iRes, qRes] = await Promise.all([
        fetch(`/api/admin/data-quality/issues?${iParams.toString()}`),
        fetch(`/api/admin/data-quality/quarantine?${qParams.toString()}`),
      ]);
      const iJson = await iRes.json();
      const qJson = await qRes.json();
      setIssues(iJson.issues ?? []);
      setQuarantine(qJson.rows ?? []);
    } catch {
      setIssues([]);
      setQuarantine([]);
    } finally {
      setLoading(false);
    }
  }, [severity, status, entityType]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const resolveIssue = async (id: string) => {
    await fetch('/api/admin/data-quality/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    fetchData();
  };

  const reviewQuarantine = async (id: string, action: 'approve' | 'reject') => {
    await fetch('/api/admin/data-quality/review-quarantine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    });
    fetchData();
  };

  const runBackfill = async () => {
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const res = await fetch('/api/admin/data-quality/backfill', { method: 'POST' });
      const json = await res.json();
      if (json.ok) setBackfillResult(json);
    } catch {
      // ignore
    } finally {
      setBackfilling(false);
      fetchData();
    }
  };

  const sevCounts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const i of issues) {
    if (i.severity in sevCounts) sevCounts[i.severity]++;
  }
  const openIssues = issues.filter(i => i.status === 'open').length;

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, padding: '32px 24px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>Data Quality</h1>

        {/* Summary row */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '16px 20px', minWidth: 160 }}>
            <div style={{ color: MUTED, fontSize: 13 }}>Open Issues</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: ACCENT }}>{openIssues}</div>
          </div>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '16px 20px', minWidth: 160 }}>
            <div style={{ color: MUTED, fontSize: 13 }}>Pending Quarantine</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: ACCENT }}>{quarantine.length}</div>
          </div>
          {(['critical', 'high', 'medium', 'low'] as Severity[]).map(s => (
            <div key={s} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '16px 20px', minWidth: 110 }}>
              <div style={{ color: MUTED, fontSize: 13, textTransform: 'capitalize' }}>{s}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: SEV_COLORS[s] }}>{sevCounts[s]}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24, alignItems: 'center' }}>
          <label style={{ color: MUTED, fontSize: 13 }}>Severity{' '}
            <select value={severity} onChange={e => setSeverity(e.target.value)} style={selectStyle}>
              <option value="all">all</option>
              <option value="critical">critical</option>
              <option value="high">high</option>
              <option value="medium">medium</option>
              <option value="low">low</option>
            </select>
          </label>
          <label style={{ color: MUTED, fontSize: 13 }}>Status{' '}
            <select value={status} onChange={e => setStatus(e.target.value)} style={selectStyle}>
              <option value="open">open</option>
              <option value="resolved">resolved</option>
              <option value="all">all</option>
            </select>
          </label>
          <label style={{ color: MUTED, fontSize: 13 }}>Entity{' '}
            <select value={entityType} onChange={e => setEntityType(e.target.value)} style={selectStyle}>
              <option value="all">all</option>
              <option value="scan">scan</option>
              <option value="competitor">competitor</option>
              <option value="verified_outcome">verified_outcome</option>
            </select>
          </label>
          <button onClick={runBackfill} disabled={backfilling} style={{ ...btnStyle, marginLeft: 'auto', opacity: backfilling ? 0.6 : 1 }}>
            {backfilling ? 'Running…' : 'Run Backfill'}
          </button>
        </div>

        {backfillResult && (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 16px', marginBottom: 24, fontSize: 14, color: MUTED }}>
            Backfill complete — Scans checked: <strong style={{ color: TEXT }}>{backfillResult.scansChecked}</strong> (flagged {backfillResult.scansFlagged}),{' '}
            Outcomes checked: <strong style={{ color: TEXT }}>{backfillResult.outcomesChecked}</strong> (flagged {backfillResult.outcomesFlagged})
          </div>
        )}

        {loading ? (
          <div style={{ color: MUTED, padding: 40, textAlign: 'center' }}>Loading…</div>
        ) : (
          <>
            {/* Issues */}
            <h2 style={{ fontSize: 20, fontWeight: 600, margin: '8px 0 12px' }}>Issues</h2>
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden', marginBottom: 32 }}>
              {issues.length === 0 ? (
                <div style={{ color: MUTED, padding: 24, textAlign: 'center' }}>No issues found.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ color: MUTED, textAlign: 'left' }}>
                      <th style={{ padding: '10px 14px' }}>Severity</th>
                      <th style={{ padding: '10px 14px' }}>Entity</th>
                      <th style={{ padding: '10px 14px' }}>Type</th>
                      <th style={{ padding: '10px 14px' }}>Message</th>
                      <th style={{ padding: '10px 14px' }}>Created</th>
                      <th style={{ padding: '10px 14px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {issues.map(i => (
                      <tr key={i.id} style={{ borderTop: `1px solid ${BORDER}` }}>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ background: SEV_COLORS[i.severity], color: '#fff', borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 600, textTransform: 'uppercase' }}>{i.severity}</span>
                        </td>
                        <td style={{ padding: '10px 14px', color: MUTED }}>{i.entity_type}</td>
                        <td style={{ padding: '10px 14px', color: MUTED }}>{i.issue_type}</td>
                        <td style={{ padding: '10px 14px' }}>{i.message}</td>
                        <td style={{ padding: '10px 14px', color: MUTED, whiteSpace: 'nowrap' }}>{fmtDate(i.created_at)}</td>
                        <td style={{ padding: '10px 14px' }}>
                          {i.status === 'open' && (
                            <button onClick={() => resolveIssue(i.id)} style={btnStyle}>Resolve</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Quarantine */}
            <h2 style={{ fontSize: 20, fontWeight: 600, margin: '8px 0 12px' }}>Quarantine (pending review)</h2>
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
              {quarantine.length === 0 ? (
                <div style={{ color: MUTED, padding: 24, textAlign: 'center' }}>Nothing in quarantine.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ color: MUTED, textAlign: 'left' }}>
                      <th style={{ padding: '10px 14px' }}>Entity</th>
                      <th style={{ padding: '10px 14px' }}>Reason</th>
                      <th style={{ padding: '10px 14px' }}>Status</th>
                      <th style={{ padding: '10px 14px' }}>Created</th>
                      <th style={{ padding: '10px 14px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {quarantine.map(q => (
                      <tr key={q.id} style={{ borderTop: `1px solid ${BORDER}` }}>
                        <td style={{ padding: '10px 14px', color: MUTED }}>{q.entity_type}</td>
                        <td style={{ padding: '10px 14px' }}>{q.reason}</td>
                        <td style={{ padding: '10px 14px', color: MUTED }}>{q.status}</td>
                        <td style={{ padding: '10px 14px', color: MUTED, whiteSpace: 'nowrap' }}>{fmtDate(q.created_at)}</td>
                        <td style={{ padding: '10px 14px', display: 'flex', gap: 8 }}>
                          <button onClick={() => reviewQuarantine(q.id, 'approve')} style={{ ...btnStyle, color: '#059669', borderColor: '#059669' }}>Approve</button>
                          <button onClick={() => reviewQuarantine(q.id, 'reject')} style={{ ...btnStyle, color: '#DC2626', borderColor: '#DC2626' }}>Reject</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
