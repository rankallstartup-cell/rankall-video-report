'use client';

import { useState } from 'react';

interface PreviewItem { email: string; score: number; scoreChange: number; subject: string; ga4Sessions?: number; ga4Trend?: 'up' | 'down' | 'flat' }

// Admin-only manual trigger for the weekly visibility report. Posts to the
// admin-gated API (cookie auth) — never handles CRON_SECRET. Preview (dry run)
// sends nothing; Send requires confirmation.
export default function WeeklyReportButton() {
  const [busy, setBusy] = useState<'preview' | 'send' | null>(null);
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState(false);
  const [preview, setPreview] = useState<PreviewItem[]>([]);

  async function previewReports() {
    setBusy('preview'); setResult(''); setError(false); setPreview([]);
    try {
      const res = await fetch('/api/admin/send-weekly-reports?dry_run=true', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      const json = await res.json();
      if (res.ok) {
        setResult(`Would send ${json.would_send} · Would skip ${json.would_skip} (no emails sent)`);
        setPreview(Array.isArray(json.preview) ? json.preview : []);
      } else { setError(true); setResult(json.error || 'Failed'); }
    } catch (err) { setError(true); setResult(err instanceof Error ? err.message : 'Failed'); }
    finally { setBusy(null); }
  }

  async function sendReports() {
    const count = preview.length;
    const msg = count > 0
      ? `This will send emails to ${count} paid user${count === 1 ? '' : 's'}. Are you sure?`
      : 'This will send weekly report emails to all eligible paid users. Are you sure?';
    if (!window.confirm(msg)) return;
    setBusy('send'); setResult(''); setError(false);
    try {
      const res = await fetch('/api/admin/send-weekly-reports', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      const json = await res.json();
      if (res.ok) setResult(`Sent ${json.sent} · Skipped ${json.skipped} · Errors ${json.errors} · Total ${json.total}`);
      else { setError(true); setResult(json.error || 'Failed'); }
    } catch (err) { setError(true); setResult(err instanceof Error ? err.message : 'Failed'); }
    finally { setBusy(null); }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={previewReports}
          disabled={busy !== null}
          style={{ background: busy ? '#E7E7F0' : '#ECEBFF', color: busy ? '#94A3B8' : '#1B17FF', border: '1px solid #C9C6FF', borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
        >
          {busy === 'preview' ? 'Previewing…' : '🔍 Preview Reports'}
        </button>
        <button
          onClick={sendReports}
          disabled={busy !== null}
          style={{ background: busy ? '#E7E7F0' : '#1B17FF', color: busy ? '#94A3B8' : '#fff', border: '1px solid #E7E7F0', borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
        >
          {busy === 'send' ? 'Sending…' : '📧 Send Weekly Reports'}
        </button>
      </div>

      {result && (
        <p style={{ fontSize: 13, color: error ? '#DC2626' : '#059669', marginTop: 10 }}>{result}</p>
      )}

      {preview.length > 0 && (
        <div style={{ marginTop: 12, maxHeight: 260, overflow: 'auto', border: '1px solid #E7E7F0', background: '#FFFFFF', borderRadius: 8 }}>
          {preview.map((p, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 12px', borderBottom: '1px solid #E7E7F0', fontSize: 12 }}>
              <span style={{ color: '#0A0A14', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email}</span>
              <span style={{ color: '#55556A', whiteSpace: 'nowrap' }}>
                {p.score}/100 <span style={{ color: p.scoreChange > 0 ? '#059669' : p.scoreChange < 0 ? '#DC2626' : '#94A3B8' }}>({p.scoreChange >= 0 ? '+' : ''}{p.scoreChange})</span>
              </span>
              <span style={{ color: p.ga4Sessions !== undefined ? '#1B17FF' : '#94A3B8', whiteSpace: 'nowrap', minWidth: 110, textAlign: 'right' }}>
                {p.ga4Sessions !== undefined
                  ? `${p.ga4Sessions.toLocaleString()} sessions ${p.ga4Trend === 'up' ? '▲' : p.ga4Trend === 'down' ? '▼' : '→'}`
                  : 'Not connected'}
              </span>
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 6 }}>
        Preview is a dry run (no emails). Send emails eligible paid users (skips free / dormant / unsubscribed) after confirmation.
      </p>
    </div>
  );
}
