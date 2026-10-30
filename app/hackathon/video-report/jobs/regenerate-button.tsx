'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Secondary action on a jobs-dashboard row: start a fresh render for the
// same scan, then refresh the server-rendered list so the new job appears.
// Only rendered when the job has a scanId (scanJson jobs have no scan row
// to re-render from). Errors are shown inline, never hidden.
export default function RegenerateButton({ scanId }: { scanId: string }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'starting' | 'started' | 'error'>('idle');
  const [error, setError] = useState('');

  async function regenerate() {
    setState('starting');
    setError('');
    try {
      const res = await fetch('/api/hackathon/video-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error((data && data.error) || `Could not start a new render (${res.status}).`);
      }
      setState('started');
      router.refresh();
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Could not start a new render.');
    }
  }

  if (state === 'started') {
    return <span style={{ color: '#15803d' }}>New render started — see the newest job above.</span>;
  }
  return (
    <span>
      <button
        type="button"
        onClick={regenerate}
        disabled={state === 'starting'}
        style={{
          padding: '6px 12px',
          borderRadius: 6,
          border: '1px solid #d1d5db',
          background: '#fff',
          cursor: state === 'starting' ? 'wait' : 'pointer',
        }}
      >
        {state === 'starting' ? 'Starting…' : 'Regenerate'}
      </button>
      {state === 'error' && error ? (
        <span style={{ color: '#b91c1c', marginLeft: 8 }}>{error}</span>
      ) : null}
    </span>
  );
}
