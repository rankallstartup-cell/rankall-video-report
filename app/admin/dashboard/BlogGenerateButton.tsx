'use client';

import { useState } from 'react';

// Admin-only manual blog generation trigger. Posts to the admin-gated API
// (cookie auth) — never handles CRON_SECRET directly.
export default function BlogGenerateButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState(false);

  async function generate() {
    setBusy(true); setResult(''); setError(false);
    try {
      const res = await fetch('/api/admin/generate-blog', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        const t = json.target ? `${json.target.industry} · ${json.target.city}` : '';
        const slug = json.result?.slug;
        setResult(slug ? `Generated: ${t} → /blog/${slug}` : `Generated: ${t}`);
      } else {
        setError(true);
        setResult(json.result?.error || json.error || 'Generation failed');
      }
    } catch (err) {
      setError(true);
      setResult(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        onClick={generate}
        disabled={busy}
        style={{ background: busy ? '#4b5563' : '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
      >
        {busy ? 'Generating…' : '📝 Generate Blog Post Now'}
      </button>
      {result && (
        <p style={{ fontSize: 13, color: error ? '#f87171' : '#4ade80', marginTop: 10 }}>{result}</p>
      )}
      <p style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>
        Generates one post for today&apos;s rotating industry/city target and publishes it to /blog.
      </p>
    </div>
  );
}
