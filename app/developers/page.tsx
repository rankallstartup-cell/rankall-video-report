import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Developers — Rankall API',
  description: 'Embed Rankall AI visibility scores on any website. Free public read-only API, no key required for published scores.',
};

const BASE = 'https://rankall.io';

function Code({ children }: { children: string }) {
  return (
    <pre style={{
      background: '#0F172A', color: '#E2E8F0', borderRadius: 12, padding: '18px 20px',
      fontSize: 13, lineHeight: 1.7, overflowX: 'auto', fontFamily: 'ui-monospace, monospace',
    }}>{children}</pre>
  );
}

export default function DevelopersPage() {
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '64px 24px 96px', fontFamily: 'inherit' }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: '#1B17FF', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>
        Developers
      </p>
      <h1 style={{ fontSize: 'clamp(28px,4vw,40px)', fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>
        The Rankall API
      </h1>
      <p style={{ fontSize: 17, color: '#475569', lineHeight: 1.7, marginBottom: 40 }}>
        Embed AI visibility scores on any website, in dashboards, or in your own products.
        The public API is read-only and free — no key required. Only scores the business
        owner has published are available; private scans are never exposed.
      </p>

      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginBottom: 12 }}>Get a score</h2>
      <Code>{`GET ${BASE}/api/v1/score/{scan_id}`}</Code>
      <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.7, margin: '16px 0' }}>
        Returns the business name, AI visibility score (0–100), per-platform mention
        results, and scan date. 404 unless the scan is published.
      </p>
      <Code>{`{
  "business": "Brite Smiles",
  "ai_visibility_score": 55,
  "platforms_responded": 11,
  "platforms_mentioned": 6,
  "platforms": [
    { "platform": "chatgpt", "mentioned": true, "sentiment": "positive" }
  ],
  "scanned_at": "2026-10-01T00:00:00Z",
  "source": "rankall.io"
}`}</Code>

      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: '40px 0 12px' }}>Get a verification</h2>
      <Code>{`GET ${BASE}/api/v1/verification/{verification_id}`}</Code>
      <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.7, margin: '16px 0' }}>
        Returns a verified outcome: the fix applied, score before → after, and when
        it was verified. 404 unless the outcome is verified and public.
      </p>

      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: '40px 0 12px' }}>Embed a badge</h2>
      <p style={{ fontSize: 15, color: '#475569', lineHeight: 1.7, marginBottom: 16 }}>
        No code needed — generate a copy-paste badge from your{' '}
        <a href="/dashboard/badge" style={{ color: '#1B17FF', fontWeight: 700 }}>badge page</a>{' '}
        (HTML, linked HTML, or Markdown, with WordPress and Squarespace instructions).
      </p>

      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: '40px 0 12px' }}>Limits</h2>
      <ul style={{ fontSize: 15, color: '#475569', lineHeight: 1.9, paddingLeft: 20 }}>
        <li>60 requests per minute per IP. Slow down on 429.</li>
        <li>Read-only — the API never writes, charges, or changes anything.</li>
        <li>Scores are honest snapshots, never backfilled. A missing scan is a 404, not a zero.</li>
      </ul>

      <div style={{ background: '#ECEBFF', borderRadius: 14, padding: '24px 28px', marginTop: 48 }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: '0 0 8px' }}>Need private data or higher limits?</p>
        <p style={{ fontSize: 14, color: '#475569', margin: 0, lineHeight: 1.7 }}>
          Keyed API access for agencies and builders is on the roadmap.{' '}
          <a href="/contact" style={{ color: '#1B17FF', fontWeight: 700 }}>Talk to us</a> about a pilot.
        </p>
      </div>
    </div>
  );
}
