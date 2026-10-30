'use client';

import { useEffect, useState } from 'react';

// Self-serve front door form. Business mode posts to /api/scan; Person mode
// posts to /api/scan-personal with an honest user-confirm step (the person
// scan server gate requires identityConfirmed === true, and this form's
// basis is exactly that: the visitor confirmed the person shown). Either
// way a successful scan starts a video job and redirects to that scan's
// delivery page, which polls the job. One primary CTA: the submit button.
// No fake progress anywhere — only real elapsed time while scans run.
type Mode = 'business' | 'person';
type Status = 'idle' | 'confirming' | 'scanning' | 'starting-video' | 'error';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  fontSize: 16,
  boxSizing: 'border-box',
};
const buttonStyle: React.CSSProperties = {
  padding: '12px 20px',
  borderRadius: 8,
  background: '#111827',
  color: '#fff',
  border: 'none',
  fontSize: 16,
  cursor: 'pointer',
};

export default function FrontDoorForm() {
  const [mode, setMode] = useState<Mode>('business');
  const [businessInput, setBusinessInput] = useState('');
  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [deliveryUrl, setDeliveryUrl] = useState('');

  useEffect(() => {
    if (status !== 'scanning' && status !== 'starting-video') return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [status]);

  async function startVideoJob(scanId: string) {
    setStatus('starting-video');
    try {
      sessionStorage.setItem(`rankall:scan-claim:${scanId}`, '1');
    } catch {
      // Claiming is a convenience, not a requirement.
    }
    const res = await fetch('/api/hackathon/video-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scanId }),
    });
    if (!res.ok) {
      // The delivery page starts the job itself on mount, so the scan's
      // video page is still the right recovery even if this POST failed.
      const data = await res.json().catch(() => null);
      setError(
        (data && data.error) ||
          `Your scan is ready but the video could not start (${res.status}). Your video page will try again.`,
      );
      setDeliveryUrl(`/hackathon/video-report/${scanId}`);
      setStatus('error');
      return;
    }
    window.location.href = `/hackathon/video-report/${scanId}`;
  }

  function fail(message: string) {
    setError(message);
    setStatus('error');
  }

  async function submitBusiness(e: React.FormEvent) {
    e.preventDefault();
    const input = businessInput.trim();
    if (!input) return fail('Enter a business, product, or brand — or a category search.');
    setError('');
    setDeliveryUrl('');
    setStatus('scanning');
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || data.success === false || data.error) {
        return fail((data && (data.message || data.error)) || `Scan failed (${res.status}).`);
      }
      const scanId = data.scanId as string | undefined;
      if (!scanId) return fail('Scan finished but returned no scan id.');
      await startVideoJob(scanId);
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Scan failed.');
    }
  }

  async function submitPerson(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return fail('Enter the person’s full name.');
    // Confirm step first: the visitor must confirm this is the right
    // person before any score is computed (server gate: 428 otherwise).
    setError('');
    setStatus('confirming');
  }

  async function confirmPerson() {
    setError('');
    setDeliveryUrl('');
    setStatus('scanning');
    try {
      const res = await fetch('/api/scan-personal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          specialty: specialty.trim() || undefined,
          location: location.trim() || undefined,
          identityConfirmed: true,
          identityConfidence: null,
          identityBasis: ['user-confirmed'],
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || data.success === false || data.error) {
        return fail((data && (data.message || data.error)) || `Scan failed (${res.status}).`);
      }
      const scanId = (data.scan_id ?? data.scanId) as string | undefined;
      if (!scanId) return fail('Scan finished but returned no scan id.');
      await startVideoJob(scanId);
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Scan failed.');
    }
  }

  const busy = status === 'scanning' || status === 'starting-video';

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['business', 'person'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError('');
              setStatus('idle');
            }}
            disabled={busy}
            style={{
              padding: '8px 16px',
              borderRadius: 999,
              border: '1px solid #d1d5db',
              background: mode === m ? '#111827' : '#fff',
              color: mode === m ? '#fff' : '#111827',
              cursor: busy ? 'wait' : 'pointer',
              fontSize: 15,
            }}
          >
            {m === 'business' ? 'Business, product, or brand' : 'Person'}
          </button>
        ))}
      </div>

      {status === 'confirming' ? (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 16 }}>
          <h2 style={{ fontSize: 18, margin: '0 0 8px' }}>Confirm this person</h2>
          <p style={{ margin: '0 0 16px', lineHeight: 1.5 }}>
            {name.trim()}
            {specialty.trim() ? ` — ${specialty.trim()}` : ''}
            {location.trim() ? ` — ${location.trim()}` : ''}
          </p>
          <p style={{ color: '#6b7280', fontSize: 14, margin: '0 0 16px' }}>
            Confirming means you have checked this is the right person. If it
            is not, go back and edit the details.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={confirmPerson} style={buttonStyle}>
              Yes, this is the right person
            </button>
            <button
              type="button"
              onClick={() => setStatus('idle')}
              style={{ ...buttonStyle, background: '#fff', color: '#111827', border: '1px solid #d1d5db' }}
            >
              Edit details
            </button>
          </div>
        </div>
      ) : mode === 'business' ? (
        <form onSubmit={submitBusiness}>
          <label htmlFor="fd-business" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
            Business, product, or brand
          </label>
          <input
            id="fd-business"
            value={businessInput}
            onChange={(e) => setBusinessInput(e.target.value)}
            placeholder="e.g. your business name and city, or a category like 'best plumber in Chicago'"
            disabled={busy}
            style={inputStyle}
          />
          <div style={{ marginTop: 16 }}>
            <button type="submit" disabled={busy} style={{ ...buttonStyle, opacity: busy ? 0.6 : 1 }}>
              {status === 'scanning'
                ? 'Scanning…'
                : status === 'starting-video'
                  ? 'Starting your video…'
                  : 'Scan + create my video'}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={submitPerson}>
          <label htmlFor="fd-name" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
            Full name
          </label>
          <input
            id="fd-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Jordan Lee"
            disabled={busy}
            style={{ ...inputStyle, marginBottom: 12 }}
          />
          <label htmlFor="fd-specialty" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
            Specialty or profession <span style={{ fontWeight: 400, color: '#6b7280' }}>(recommended)</span>
          </label>
          <input
            id="fd-specialty"
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            placeholder="e.g. cardiologist, attorney, realtor"
            disabled={busy}
            style={{ ...inputStyle, marginBottom: 12 }}
          />
          <label htmlFor="fd-location" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
            City <span style={{ fontWeight: 400, color: '#6b7280' }}>(recommended)</span>
          </label>
          <input
            id="fd-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Austin, TX"
            disabled={busy}
            style={inputStyle}
          />
          <div style={{ marginTop: 16 }}>
            <button type="submit" disabled={busy} style={{ ...buttonStyle, opacity: busy ? 0.6 : 1 }}>
              Continue to confirm
            </button>
          </div>
        </form>
      )}

      {busy ? (
        <p style={{ color: '#4b5563', marginTop: 16 }}>
          {elapsed}s elapsed — scans usually take a minute or two. Please keep
          this tab open.
        </p>
      ) : null}
      {status === 'error' && error ? (
        <p style={{ color: '#b91c1c', marginTop: 16 }}>
          {error}
          {deliveryUrl ? (
            <>
              {' '}
              <a href={deliveryUrl}>View your scan&apos;s video page</a>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
