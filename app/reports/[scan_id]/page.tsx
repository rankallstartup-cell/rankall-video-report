'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

const NAVY = '#0A0A14';
const BLUE = '#1B17FF';
const GRAY = '#64748B';

export default function ReportPage() {
  const params        = useParams<{ scan_id: string }>();
  const searchParams  = useSearchParams();
  const scan_id       = params?.scan_id;
  const autoPrint     = searchParams?.get('print') === '1';

  const [html, setHtml]       = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const printTriggered        = useRef(false);

  useEffect(() => {
    if (!scan_id) { setError('No scan ID provided.'); setLoading(false); return; }

    const agencyUserId = searchParams?.get('agency_user_id') || '';
    const qs = agencyUserId ? `?scan_id=${scan_id}&agency_user_id=${agencyUserId}` : `?scan_id=${scan_id}`;

    fetch(`/api/reports/generate-pdf${qs}`)
      .then(async res => {
        if (!res.ok) {
          const body = await res.text();
          throw new Error(body || `HTTP ${res.status}`);
        }
        return res.text();
      })
      .then(reportHtml => {
        setHtml(reportHtml);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message || 'Failed to load report.');
        setLoading(false);
      });
  }, [scan_id, searchParams]);

  // Auto-print if ?print=1
  useEffect(() => {
    if (html && autoPrint && !printTriggered.current) {
      printTriggered.current = true;
      // Small delay to allow the iframe to render
      setTimeout(() => window.print(), 800);
    }
  }, [html, autoPrint]);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#F8FAFC',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        gap: 16,
      }}>
        <div style={{
          width: 40, height: 40,
          border: `3px solid #E2E8F0`,
          borderTopColor: BLUE,
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <p style={{ fontSize: 15, color: GRAY }}>Loading report…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#F8FAFC',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        gap: 12,
      }}>
        <p style={{ fontSize: 15, color: '#DC2626' }}>Error: {error}</p>
        <a href="/dashboard" style={{ fontSize: 14, color: BLUE }}>← Back to dashboard</a>
      </div>
    );
  }

  return (
    <>
      {/* Action toolbar — hidden when printing */}
      <div style={{
        position: 'fixed',
        top: 0, left: 0, right: 0,
        zIndex: 100,
        background: NAVY,
        padding: '10px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }} className="no-print">
        <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>AI Visibility Report</span>
        <div style={{ display: 'flex', gap: 12 }}>
          <a
            href={`/api/reports/generate-pdf?scan_id=${scan_id}${searchParams?.get('agency_user_id') ? `&agency_user_id=${searchParams.get('agency_user_id')}` : ''}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8,
              padding: '7px 16px',
              fontSize: 13,
              fontWeight: 600,
              color: '#fff',
              textDecoration: 'none',
            }}
          >
            Open Full Page
          </a>
          <button
            onClick={() => window.print()}
            style={{
              background: BLUE,
              border: 'none',
              borderRadius: 8,
              padding: '7px 20px',
              fontSize: 13,
              fontWeight: 700,
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Print / Save PDF
          </button>
        </div>
      </div>

      {/* Report content rendered in an iframe to isolate styles */}
      <iframe
        srcDoc={html || ''}
        style={{
          width: '100%',
          height: '100vh',
          border: 'none',
          marginTop: 44, // toolbar height
          display: 'block',
        }}
        title="AI Visibility Report"
      />

      <style>{`
        @media print {
          .no-print { display: none !important; }
          iframe { margin-top: 0 !important; height: 100vh !important; }
        }
      `}</style>
    </>
  );
}
