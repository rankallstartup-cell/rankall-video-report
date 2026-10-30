'use client';

// Gold Labels review page (Labeling Phase 2a).
// One scan at a time: the reviewer sees the SYSTEM labels and marks each
// one agree / disagree + a correction. Reviews are independent — another
// reviewer's verdicts are never shown here; only counts ("reviewed by N").
// Agreement / gold status appear only after this reviewer has submitted
// their own full set for the scan. System labels are never overwritten:
// gold verdicts live in gold_label_reviews.

import { useCallback, useEffect, useMemo, useState } from 'react';

const FIELDS: Array<{ key: string; label: string }> = [
  { key: 'business_name', label: 'Business name' },
  { key: 'industry', label: 'Industry' },
  { key: 'intent_type', label: 'Intent type' },
  { key: 'query_type', label: 'Query type' },
  { key: 'business_type', label: 'Business type' },
  { key: 'competitor_category', label: 'Competitor category' },
  { key: 'ai_recommendation_confidence', label: 'AI recommendation confidence' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'country', label: 'Country' },
];

type SampleRow = Record<string, unknown> & { scan_id: string };
type OwnReview = { verdict: 'agree' | 'disagree'; corrected_value: string | null };

const card: React.CSSProperties = { background: '#FFFFFF', border: '1px solid #E7E7F0', borderRadius: 12, padding: 20 };
const inputStyle: React.CSSProperties = { background: '#F6F6FB', color: '#0A0A14', border: '1px solid #E7E7F0', borderRadius: 8, padding: '8px 10px', width: '100%', fontSize: 14 };
const btn: React.CSSProperties = { background: '#E7E7F0', color: '#0A0A14', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 14 };
const btnActive: React.CSSProperties = { ...btn, background: '#1B17FF', color: '#fff' };
const btnGreen: React.CSSProperties = { ...btn, background: '#059669', color: '#fff' };

export default function GoldLabelsClient() {
  const [sample, setSample] = useState<SampleRow[]>([]);
  const [index, setIndex] = useState(0);
  const [ownReviews, setOwnReviews] = useState<Record<string, OwnReview>>({});
  const [reviewerCount, setReviewerCount] = useState(0);
  const [reviewedCounts, setReviewedCounts] = useState<Record<string, number>>({});
  const [agreement, setAgreement] = useState<Record<string, { agreed: boolean; conflict: boolean; agreedCorrection: string | null }> | null>(null);
  const [goldStatus, setGoldStatus] = useState<string>('pending');
  const [drafts, setDrafts] = useState<Record<string, { verdict: 'agree' | 'disagree'; corrected: string }>>({});
  const [status, setStatus] = useState<'loading' | 'ready' | 'migration_pending' | 'error'>('loading');
  const [notice, setNotice] = useState('');
  const [notes, setNotes] = useState('');
  const [adjudicating, setAdjudicating] = useState(false);

  const scan = sample[index];
  const ownFullSet = useMemo(
    () => scan != null && FIELDS.every((f) => ownReviews[f.key] != null),
    [scan, ownReviews],
  );

  const loadReviews = useCallback(async (scanId: string) => {
    try {
      const res = await fetch(`/api/admin/gold-label/reviews?scan_id=${encodeURIComponent(scanId)}`);
      if (res.status === 503) { setStatus('migration_pending'); return; }
      if (!res.ok) throw new Error(`reviews ${res.status}`);
      const data = await res.json();
      const own: Record<string, OwnReview> = {};
      for (const r of data.own_reviews ?? []) {
        own[r.field_name] = { verdict: r.verdict, corrected_value: r.corrected_value ?? null };
      }
      setOwnReviews(own);
      setReviewerCount(data.reviewer_count ?? 0);
      setReviewedCounts(data.reviewed_counts ?? {});
      setAgreement(data.agreement?.perField ?? null);
      setGoldStatus(data.gold_status ?? 'pending');
      setDrafts({});
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/gold-label/sample');
        if (!res.ok) throw new Error(`sample ${res.status}`);
        const data = await res.json();
        setSample(data.sample ?? []);
        setStatus('ready');
        if ((data.sample ?? []).length > 0) await loadReviews(data.sample[0].scan_id);
      } catch {
        setStatus('error');
      }
    })();
  }, [loadReviews]);

  const goTo = async (next: number) => {
    if (next < 0 || next >= sample.length) return;
    setIndex(next);
    setAgreement(null);
    setGoldStatus('pending');
    setNotes('');
    setAdjudicating(false);
    await loadReviews(sample[next].scan_id);
  };

  const saveField = async (field: string) => {
    if (!scan) return;
    const draft = drafts[field];
    if (!draft) return;
    if (draft.verdict === 'disagree' && !draft.corrected.trim()) {
      setNotice('Correction is required when you disagree.');
      return;
    }
    setNotice('');
    const res = await fetch('/api/admin/gold-label/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scan_id: scan.scan_id,
        field_name: field,
        verdict: draft.verdict,
        corrected_value: draft.verdict === 'disagree' ? draft.corrected.trim() : null,
      }),
    });
    if (res.status === 503) { setStatus('migration_pending'); return; }
    if (!res.ok) { setNotice('Could not save — try again.'); return; }
    await loadReviews(scan.scan_id);
  };

  const submitAdjudication = async () => {
    if (!scan || !notes.trim()) { setNotice('Adjudication notes are required.'); return; }
    const finalValues: Record<string, string> = {};
    for (const f of FIELDS) {
      const own = ownReviews[f.key];
      finalValues[f.key] = own?.verdict === 'disagree' ? (own.corrected_value ?? '') : String(scan[f.key] ?? '');
    }
    const res = await fetch('/api/admin/gold-label/adjudicate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scan_id: scan.scan_id, notes: notes.trim(), final_values: finalValues }),
    });
    if (!res.ok) { setNotice('Could not record adjudication — try again.'); return; }
    setAdjudicating(false);
    await loadReviews(scan.scan_id);
  };

  if (status === 'loading') {
    return <div style={{ color: '#55556A', padding: 24 }}>Loading gold-set sample…</div>;
  }
  if (status === 'migration_pending') {
    return (
      <div style={{ color: '#55556A', padding: 24 }}>
        <h1 style={{ fontSize: 22 }}>Gold Labels — migration pending</h1>
        <p style={{ color: '#55556A' }}>
          The gold_label_reviews tables do not exist yet. Run supabase/migrations/20261017_gold_label_reviews.sql
          in the Supabase SQL editor (staging first), then reload this page.
        </p>
      </div>
    );
  }
  if (status === 'error' || sample.length === 0) {
    return (
      <div style={{ color: '#55556A', padding: 24 }}>
        <h1 style={{ fontSize: 22 }}>Gold Labels</h1>
        <p style={{ color: '#55556A' }}>
          {sample.length === 0
            ? 'No scans in the gold sample yet — labeling may still be running. Come back after more scans are labeled.'
            : 'Could not load the sample. Reload the page.'}
        </p>
      </div>
    );
  }

  return (
    <div style={{ color: '#55556A', padding: 24, maxWidth: 900 }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Gold Labels — human review</h1>
      <p style={{ color: '#55556A', marginBottom: 16 }}>
        Judge the SYSTEM labels. Agree where they are right, disagree + correct where they are wrong.
        Your verdicts never change the system labels. Scan {index + 1} of {sample.length}
        {' · '}Reviewed by {reviewerCount} reviewer(s){' · '}Status: {goldStatus}
      </p>
      {notice && <p style={{ color: '#D97706', marginBottom: 12 }}>{notice}</p>}

      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <button style={btn} disabled={index === 0} onClick={() => goTo(index - 1)}>← Previous scan</button>
          <button style={btn} disabled={index >= sample.length - 1} onClick={() => goTo(index + 1)}>Next scan →</button>
        </div>
        <h2 style={{ fontSize: 18, marginTop: 16 }}>{String(scan.business_name ?? '')}</h2>
        <p style={{ color: '#55556A', fontSize: 13 }}>scan_id: {scan.scan_id}</p>
      </div>

      <div style={card}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ color: '#55556A', textAlign: 'left' }}>
              <th style={{ padding: '6px 8px' }}>Label</th>
              <th style={{ padding: '6px 8px' }}>System value</th>
              <th style={{ padding: '6px 8px' }}>Your verdict</th>
              <th style={{ padding: '6px 8px' }}>Correction (if disagree)</th>
              <th style={{ padding: '6px 8px' }} />
            </tr>
          </thead>
          <tbody>
            {FIELDS.map((f) => {
              const draft = drafts[f.key] ?? {
                verdict: ownReviews[f.key]?.verdict ?? 'agree',
                corrected: ownReviews[f.key]?.corrected_value ?? '',
              };
              const saved = ownReviews[f.key];
              return (
                <tr key={f.key} style={{ borderTop: '1px solid #2d2d44' }}>
                  <td style={{ padding: '8px' }}>{f.label}<br /><span style={{ color: '#55556A', fontSize: 12 }}>reviewed by {reviewedCounts[f.key] ?? 0}</span></td>
                  <td style={{ padding: '8px' }}>{String(scan[f.key] ?? '')}</td>
                  <td style={{ padding: '8px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button style={draft.verdict === 'agree' ? btnActive : btn} onClick={() => setDrafts({ ...drafts, [f.key]: { ...draft, verdict: 'agree' } })}>Agree</button>
                      <button style={draft.verdict === 'disagree' ? btnActive : btn} onClick={() => setDrafts({ ...drafts, [f.key]: { ...draft, verdict: 'disagree' } })}>Disagree</button>
                    </div>
                    {saved && <div style={{ color: '#059669', fontSize: 12, marginTop: 4 }}>Saved: {saved.verdict}</div>}
                  </td>
                  <td style={{ padding: '8px' }}>
                    <input
                      style={inputStyle}
                      disabled={draft.verdict !== 'disagree'}
                      placeholder={draft.verdict === 'disagree' ? 'Correct value' : ''}
                      value={draft.verdict === 'disagree' ? draft.corrected : ''}
                      onChange={(e) => setDrafts({ ...drafts, [f.key]: { ...draft, corrected: e.target.value } })}
                    />
                  </td>
                  <td style={{ padding: '8px' }}>
                    <button style={btnGreen} onClick={() => saveField(f.key)}>Save</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {ownFullSet && agreement && (
        <div style={{ ...card, marginTop: 16 }}>
          <h3 style={{ fontSize: 16, marginBottom: 8 }}>Agreement (shown only after your full set)</h3>
          {FIELDS.map((f) => {
            const a = agreement[f.key];
            return (
              <div key={f.key} style={{ fontSize: 14, padding: '4px 0' }}>
                {f.label}: {a?.agreed ? '✅ Agreed' : a?.conflict ? '⚠️ Conflict — needs adjudication' : '⏳ Awaiting second reviewer'}
              </div>
            );
          })}
          <p style={{ marginTop: 10 }}>Gold status: <strong>{goldStatus}</strong></p>
        </div>
      )}

      {ownFullSet && goldStatus === 'needs_adjudication' && !adjudicating && (
        <div style={{ marginTop: 16 }}>
          <button style={btn} onClick={() => setAdjudicating(true)}>Adjudicate conflicts (record final values)</button>
        </div>
      )}
      {adjudicating && (
        <div style={{ ...card, marginTop: 16 }}>
          <h3 style={{ fontSize: 16, marginBottom: 8 }}>Adjudication — record how the conflicts were resolved</h3>
          <p style={{ color: '#55556A', fontSize: 13, marginBottom: 8 }}>
            Final values default to your corrections for fields you disagreed with and the system values otherwise.
            Your adjudication is stored with your name, the time, and these notes.
          </p>
          <textarea
            style={{ ...inputStyle, minHeight: 80 }}
            placeholder="How were the conflicts resolved? (required)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div style={{ marginTop: 10 }}>
            <button style={btnGreen} onClick={submitAdjudication}>Record adjudication → mark gold</button>
          </div>
        </div>
      )}
    </div>
  );
}
