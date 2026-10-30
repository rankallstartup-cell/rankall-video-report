'use client';

import { useState, useEffect } from 'react';
import { useAdminGuard } from '@/lib/useAdminGuard';
import { getBrowserClient } from '@/lib/supabase';

const BG     = '#F6F6FB';
const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#E7E7F0';
const BLUE   = '#1B17FF';
const GRAY   = '#55556A';
const LGRAY  = '#94A3B8';

interface TourStep {
  title?: string;
  narration?: string;
  screenshot_url?: string;
  audio_url?: string;
}

export default function TourGeneratorPage() {
  const { checking, isAdmin } = useAdminGuard();
  const [steps, setSteps]             = useState<TourStep[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const [generating, setGenerating]   = useState(false);
  const [genMessage, setGenMessage]   = useState<string>('');

  useEffect(() => {
    const supabase = getBrowserClient();
    supabase
      .from('product_tour')
      .select('steps, generated_at')
      .eq('id', 'main')
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSteps((data.steps as TourStep[]) ?? []);
          setGeneratedAt((data.generated_at as string) ?? null);
        }
        setLoading(false);
      });
  }, []);

  async function generate() {
    setGenerating(true);
    setGenMessage('');
    try {
      const res = await fetch('/api/cron/generate-tour', {
        method: 'POST',
        // Admin session cookie authorises this; no secret in the client bundle.
      });
      let data: Record<string, unknown> = {};
      try { data = await res.json(); } catch { /* ignore */ }
      if (data.triggered === false) {
        const reason = (data.reason as string) || 'Not triggered.';
        setGenMessage(reason);
      } else if (!res.ok) {
        setGenMessage(`Error ${res.status}: ${JSON.stringify(data)}`);
      } else {
        setGenMessage(JSON.stringify(data));
      }
    } catch (e) {
      setGenMessage(`Error: ${String(e)}`);
    }
    setGenerating(false);
  }

  if (checking) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: BG }}>
        <p style={{ color: LGRAY, fontSize: 14 }}>Checking access...</p>
      </div>
    );
  }
  if (!isAdmin) return null;

  return (
    <div style={{ minHeight: '100vh', background: BG }}>
      <div style={{ padding: 32, maxWidth: 760, margin: '0 auto' }}>
        <a href="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: BLUE, textDecoration: 'none', marginBottom: 20 }}>
          ← Back to Dashboard
        </a>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 6 }}>Product Tour Generator</h1>
        <p style={{ fontSize: 13, color: GRAY, marginBottom: 20 }}>
          View and regenerate the automated product tour shown at <code>/demo</code>.
        </p>

        {/* Reminder: real screenshots require running the generator locally with login creds */}
        <div style={{ background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 12, padding: '14px 18px', marginBottom: 24 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#92400E', margin: '0 0 6px' }}>⚠️ Product tour not generated with real screenshots yet</p>
          <p style={{ fontSize: 12, color: '#78350F', margin: '0 0 8px', lineHeight: 1.6 }}>
            The <code>/demo</code> page shows an animated fallback until the tour is generated with a logged-in session. Run this locally (not buildable from the app):
          </p>
          <pre style={{ background: '#1f2937', color: '#E7E7F0', fontSize: 12, borderRadius: 8, padding: '10px 12px', overflowX: 'auto', margin: 0 }}>{`$env:RANKALL_PASSWORD='your_password'
npm run generate-tour`}</pre>
        </div>

        {/* Generate + status */}
        <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: '18px 20px', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Last Generated</p>
              <p style={{ fontSize: 14, fontWeight: 600, color: NAVY, margin: 0 }}>
                {generatedAt ? new Date(generatedAt).toLocaleString() : 'Never generated yet'}
              </p>
            </div>
            <button
              onClick={generate}
              disabled={generating}
              style={{ background: BLUE, border: 'none', borderRadius: 10, padding: '11px 20px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: generating ? 'default' : 'pointer', opacity: generating ? 0.6 : 1, whiteSpace: 'nowrap' }}
            >
              {generating ? 'Generating…' : 'Generate New Tour'}
            </button>
          </div>
          {genMessage && (
            <div style={{ marginTop: 14, background: '#FFFBEB', border: '1.5px solid #FDE68A', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#92400E', lineHeight: 1.5 }}>
              {genMessage}
            </div>
          )}
        </div>

        {/* Steps */}
        {loading ? (
          <p style={{ color: LGRAY, fontSize: 14 }}>Loading tour…</p>
        ) : steps.length === 0 ? (
          <div style={{ background: W, border: `1.5px dashed ${BORDER}`, borderRadius: 12, padding: '28px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: GRAY, lineHeight: 1.6, margin: 0 }}>
              No tour generated yet. Run <code>npm run generate-tour</code> in a browser-capable
              environment (local or CI), or click Generate New Tour to trigger the external runner.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {steps.map((step, i) => (
              <div key={i} style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: '18px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 8, background: '#ECEBFF', color: BLUE, fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
                    {i + 1}
                  </span>
                  <h2 style={{ fontSize: 16, fontWeight: 700, color: NAVY, margin: 0 }}>
                    {step.title || `Step ${i + 1}`}
                  </h2>
                </div>

                {step.screenshot_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={step.screenshot_url}
                    alt={step.title || `Step ${i + 1} screenshot`}
                    style={{ width: '100%', borderRadius: 10, border: `1px solid ${BORDER}`, marginBottom: 12, display: 'block' }}
                  />
                ) : (
                  <div style={{ width: '100%', height: 180, borderRadius: 10, border: `1px dashed ${BORDER}`, background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 13, color: LGRAY, fontWeight: 600 }}>Screenshot pending</span>
                  </div>
                )}

                {step.audio_url && (
                  <audio controls src={step.audio_url} style={{ width: '100%', marginBottom: 12 }} />
                )}

                {step.narration && (
                  <p style={{ fontSize: 14, color: GRAY, lineHeight: 1.6, margin: 0 }}>{step.narration}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
