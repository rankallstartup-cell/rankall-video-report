'use client';
import { useState } from 'react';
import { VERIFY_DAY_OPTIONS } from '@/lib/rescanSchedule';

export function MarkFixApplied({ scanId, fixType }: { scanId: string; fixType: string }) {
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduled, setScheduled] = useState(false);
  // ax72: the date the server actually scheduled for the chosen delay.
  const [verifyOn, setVerifyOn] = useState<string | null>(null);
  // ax70: the old code flipped to "Fix applied" even when the apply POST
  // failed (fetch errors swallowed, res.ok never checked).
  const [applyError, setApplyError] = useState<string | null>(null);

  async function markApplied() {
    setShowSchedule(true);
  }

  async function scheduleRescan(days: number) {
    setApplyError(null);
    try {
      const res = await fetch('/api/fixes/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scan_id: scanId, fix_type: fixType, rescan_days: days }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || `Apply failed (${res.status})`);
      }
      setVerifyOn(typeof data.expectedVerificationDate === 'string' ? data.expectedVerificationDate : null);
    } catch {
      // ax70: on failure stay on the picker with an error — never show
      // "Fix applied" for a request that didn't go through.
      setApplyError('Could not mark this fix applied — check your connection and try again.');
      return;
    }
    setScheduled(true);
    setShowSchedule(false);
  }

  if (scheduled) {
    return (
      <p style={{ fontSize: 13, color: '#059669', marginTop: 8 }}>
        <svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg> Fix applied. We&apos;ll verify it automatically{verifyOn ? ` on ${verifyOn}` : ''}.
      </p>
    );
  }

  if (showSchedule) {
    return (
      <div style={{ marginTop: 12, background: '#f0fdf4', borderRadius: 8, padding: 16, border: '1px solid #bbf7d0' }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: '#065f46', margin: '0 0 8px' }}>
          When should we verify this fix?
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          {applyError && (
            <p style={{ fontSize: 13, color: '#991B1B', fontWeight: 600, margin: '0 0 8px' }}>{applyError}</p>
          )}
          {/* ax72: the picker is honoured end-to-end — the chosen delay is
              stored per fix in scheduled_rescans and trigger-rescans verifies
              this fix (only) when its own row is due. 7 = the default. */}
          {VERIFY_DAY_OPTIONS.map(days => (
            <button
              key={days}
              onClick={() => scheduleRescan(days)}
              style={{ padding: '8px 16px', background: '#059669', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
            >
              In {days} days
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={markApplied}
      style={{ marginTop: 8, padding: '6px 14px', background: 'none', border: '1px solid #059669', color: '#059669', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
    >
      <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> I Applied This Fix
    </button>
  );
}
