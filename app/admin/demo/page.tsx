'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase';
import { isAdminUser } from '@/lib/planConfig';

export default function AdminDemoPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  useEffect(() => {
    getBrowserClient().auth.getUser().then(({ data: { user } }) => {
      if (!isAdminUser(user?.email)) { router.replace('/dashboard'); }
      else { setAuthorized(true); }
    });
  }, [router]);

  const [status, setStatus] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  if (!authorized) return null;

  async function generateDemo() {
    setLoading(true);
    setResult(null);
    setStatus('Running scan...');

    await new Promise(r => setTimeout(r, 500));
    setStatus('Generating script via Claude...');

    const res = await fetch('/api/demo/generate-video', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setStatus(`Error: ${err.error ?? res.statusText}`);
      setLoading(false);
      return;
    }

    const data = await res.json();
    setStatus('Done!');
    setResult(data);
    setLoading(false);
  }

  return (
    <div style={{ padding: 32, maxWidth: 800, margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>Demo Video Admin</h1>
      <p style={{ color: '#6b7280', margin: '0 0 32px' }}>Auto-generate a new demo from a real Chicago dentist scan.</p>

      <button
        onClick={generateDemo}
        disabled={loading}
        style={{ background: loading ? '#6b7280' : '#1B17FF', color: '#fff', border: 'none', borderRadius: 10, padding: '14px 28px', fontSize: 16, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', marginBottom: 24 }}
      >
        {loading ? '⏳ Generating...' : '▶ Generate New Demo Video'}
      </button>

      {status && (
        <div style={{ background: '#f9fafb', border: '1px solid #E7E7F0', borderRadius: 10, padding: 16, marginBottom: 24 }}>
          <p style={{ margin: 0, color: status.startsWith('Error') ? '#DC2626' : '#059669', fontWeight: 600 }}>{status}</p>
        </div>
      )}

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {result.audio_url && (
            <div style={{ background: '#fff', border: '1px solid #E7E7F0', borderRadius: 10, padding: 16 }}>
              <p style={{ fontWeight: 600, margin: '0 0 8px' }}>Generated Audio</p>
              <audio controls src={result.audio_url} style={{ width: '100%' }} />
            </div>
          )}
          {!result.audio_url && result.diagnostics && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10, padding: 16 }}>
              <p style={{ fontWeight: 700, margin: '0 0 8px', color: '#DC2626' }}>⚠️ No audio generated — diagnostics</p>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#DC2626', margin: 0 }}>
                {JSON.stringify(result.diagnostics, null, 2)}
              </pre>
              <p style={{ fontSize: 12, color: '#DC2626', margin: '10px 0 0' }}>
                If <code>elevenLabsKeyPresent</code> or <code>voiceIdPresent</code> is false, set <code>ELEVENLABS_API_KEY</code> / <code>ELEVENLABS_VOICE_ID</code> in Vercel.
                If <code>serviceRoleKeyPresent</code> is false or <code>uploadStatus</code> is 400/403, set <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel (needed to write to Storage).
              </p>
            </div>
          )}
          <div style={{ background: '#fff', border: '1px solid #E7E7F0', borderRadius: 10, padding: 16 }}>
            <p style={{ fontWeight: 600, margin: '0 0 8px' }}>Generated Script</p>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#55556A', lineHeight: 1.6 }}>{result.script}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
