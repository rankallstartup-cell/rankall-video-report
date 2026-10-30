'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { SummaryBar, ResponseGrid, type ScanResponse } from '@/app/dashboard/ai-inbox/page';

const BG = '#0A0A14';
const CARD = '#111827';
const TEXT = '#F9FAFB';
const MUTED = '#9CA3AF';
const PURPLE = '#1B17FF';
const BORDER = '#1F2937';

interface InboxRow {
  id: string;
  query: string;
  results: unknown;
  created_at: string;
}

export default function PublicInboxPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [row, setRow] = useState<InboxRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await fetch(`/api/inbox/${id}`);
        const data = await res.json();
        if (!res.ok || data.error) {
          setError(data.error || 'Results not found.');
        } else {
          setRow(data.row as InboxRow);
        }
      } catch {
        setError('Could not load these results.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const scan = (row?.results as ScanResponse) || null;

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, padding: '32px 24px' }}>
      <style>{`
        .ai-inbox-grid {
          display: grid;
          gap: 16px;
          grid-template-columns: repeat(3, 1fr);
        }
        @media (max-width: 1024px) {
          .ai-inbox-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 640px) {
          .ai-inbox-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <header style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0 }}>AI Inbox</h1>
          <p style={{ color: MUTED, fontSize: 16, marginTop: 8 }}>
            See what all 12 AI platforms say about any search right now
          </p>
        </header>

        {loading && <p style={{ color: MUTED }}>Loading results…</p>}

        {error && !loading && (
          <div
            style={{
              background: CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 12,
              padding: 24,
              color: MUTED,
            }}
          >
            {error}
          </div>
        )}

        {scan && !loading && (
          <>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
              Results for “{row?.query}”
            </h2>
            <SummaryBar scan={scan} />
            <ResponseGrid scan={scan} />
          </>
        )}

        {/* CTA */}
        <div
          style={{
            marginTop: 32,
            textAlign: 'center',
            background: CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 16,
            padding: 28,
          }}
        >
          <p style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
            Want to see what AI says about your business?
          </p>
          <a
            href="/"
            style={{
              display: 'inline-block',
              marginTop: 16,
              fontSize: 16,
              fontWeight: 700,
              padding: '14px 28px',
              borderRadius: 12,
              background: PURPLE,
              color: '#fff',
              textDecoration: 'none',
            }}
          >
            Scan your own business free →
          </a>
        </div>
      </div>
    </div>
  );
}
