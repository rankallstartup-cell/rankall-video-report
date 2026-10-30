'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getBrowserClient } from '@/lib/supabase';

const BG     = '#F8FAFC';
const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#E2E8F0';
const BLUE   = '#1B17FF';
const GREEN  = '#059669';
const RED    = '#DC2626';
const AMBER  = '#D97706';
const GRAY   = '#64748B';
const LGRAY  = '#94A3B8';

interface UrlSignal {
  name: string;
  status: 'pass' | 'fail';
  value: string;
  impact: 'high' | 'medium' | 'low';
  fix: string;
}

interface PageSpeedData {
  mobile: number | null;
  desktop: number | null;
  lcp: string | null;
  cls: string | null;
}

interface PlacesData {
  name: string;
  rating: number;
  reviewCount: number;
}

interface AuditResult {
  score: number;
  signals: UrlSignal[];
  url: string;
  scrapedAt: string;
  auditId: string;
  pageSpeed: PageSpeedData;
  places: PlacesData | null;
  competitor?: AuditResult;
}

const impactStyle = (impact: string) => {
  if (impact === 'high')   return { bg: '#FEF2F2', border: '#FCA5A5', color: RED };
  if (impact === 'medium') return { bg: '#FFFBEB', border: '#FCD34D', color: AMBER };
  return { bg: BG, border: BORDER, color: GRAY };
};

const scoreColor = (s: number) => s >= 75 ? GREEN : s >= 50 ? AMBER : RED;
const speedColor = (s: number | null) => s == null ? LGRAY : s >= 75 ? GREEN : s >= 50 ? AMBER : RED;
const speedLabel = (s: number | null) => s == null ? '—' : s >= 75 ? 'Fast' : s >= 50 ? 'Average' : 'Slow';

function UrlIntelligenceInner() {
  const searchParams = useSearchParams();

  const [url, setUrl]                 = useState('');
  const [competitorUrl, setCompUrl]   = useState('');
  const [showCompetitor, setShowComp] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [result, setResult]           = useState<AuditResult | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [copied, setCopied]           = useState<string | null>(null);
  const [expanded, setExpanded]       = useState<string | null>(null);
  const [emailAddr, setEmailAddr]     = useState('');
  const [emailSending, setEmailSend]  = useState(false);
  const [emailSent, setEmailSent]     = useState(false);
  const [emailError, setEmailError]   = useState<string | null>(null);
  const [copyError, setCopyError]     = useState<string | null>(null);
  const [shareFlash, setShareFlash]   = useState(false);
  // b8ae: the page used to render the full tool UI to logged-out visitors
  // (S3). Gate the tool on a session — same page-level gate pattern as
  // /dashboard/usage ("Sign in to view your usage.").
  const [authChecked, setAuthChecked] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getBrowserClient().auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setSignedIn(!!data.user);
      setAuthChecked(true);
    }).catch(() => { if (!cancelled) setAuthChecked(true); });
    return () => { cancelled = true; };
  }, []);

  // Load saved audit from ?audit= param (signed-in only — the tool is gated).
  useEffect(() => {
    if (!signedIn) return;
    const auditId = searchParams.get('audit');
    if (!auditId) return;
    fetch(`/api/url-intelligence?audit=${auditId}`)
      .then(r => r.json())
      .then(data => { if (data.success) setResult(data); })
      .catch(() => {});
  }, [searchParams, signedIn]);

  async function runAnalysis() {
    const trimmed = url.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setEmailSent(false);
    try {
      const body: Record<string, string> = { websiteUrl: trimmed };
      if (showCompetitor && competitorUrl.trim()) body.competitorUrl = competitorUrl.trim();
      const res  = await fetch('/api/url-intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Analysis failed. Check the URL and try again.');
      } else {
        setResult(data);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    }
    setLoading(false);
  }

  function copyFix(signal: UrlSignal) {
    const text = `${signal.name}\n\nIssue: ${signal.value}\n\nFix: ${signal.fix}`;
    // Only flash "Copied" when the copy actually succeeded — the execCommand
    // fallback returns false on failure, and the Clipboard API rejects.
    setCopyError(null);
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => flash(signal.name)).catch(() => {
        setCopyError('Copy failed — your browser blocked clipboard access. Select the text and copy it manually.');
      });
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      document.body.removeChild(ta);
      if (ok) flash(signal.name);
      else setCopyError('Copy failed — your browser blocked clipboard access. Select the text and copy it manually.');
    }
  }

  function flash(name: string) {
    setCopied(name);
    setTimeout(() => setCopied(null), 2000);
  }

  function shareAudit() {
    if (!result?.auditId) return;
    const link = `${window.location.origin}/dashboard/url-intelligence?audit=${result.auditId}`;
    setCopyError(null);
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(link).then(() => { setShareFlash(true); setTimeout(() => setShareFlash(false), 2500); }).catch(() => {
        setCopyError('Copy failed — your browser blocked clipboard access. Select the link and copy it manually.');
      });
    } else {
      const ta = document.createElement('textarea');
      ta.value = link;
      ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      document.body.removeChild(ta);
      if (ok) { setShareFlash(true); setTimeout(() => setShareFlash(false), 2500); }
      else setCopyError('Copy failed — your browser blocked clipboard access. Select the link and copy it manually.');
    }
  }

  async function sendEmail() {
    if (!emailAddr.trim() || !result) return;
    setEmailSend(true);
    setEmailError(null);
    try {
      const res = await fetch('/api/url-intelligence/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailAddr.trim(), url: result.url, score: result.score, signals: result.signals, auditId: result.auditId }),
      });
      const data = await res.json().catch(() => ({}));
      // Only show "Sent!" when the API actually sent the email.
      if (!res.ok || !data.success) {
        setEmailError(data.error || 'Could not send the report. Please try again.');
      } else {
        setEmailSent(true);
      }
    } catch {
      setEmailError('Could not send the report. Please check your connection and try again.');
    }
    setEmailSend(false);
  }

  const passing   = result?.signals.filter(s => s.status === 'pass').length ?? 0;
  const failing   = result?.signals.filter(s => s.status === 'fail').length ?? 0;
  const highFails = result?.signals.filter(s => s.status === 'fail' && s.impact === 'high').length ?? 0;

  const SignalRow = ({ signal }: { signal: UrlSignal }) => {
    const imp        = impactStyle(signal.impact);
    const isExpanded = expanded === signal.name;
    return (
      <div style={{ border: `1.5px solid ${BORDER}`, borderRadius: 12, marginBottom: 10, overflow: 'hidden' }}>
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', cursor: 'pointer', gap: 12 }}
          onClick={() => setExpanded(isExpanded ? null : signal.name)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 16, color: RED, flexShrink: 0 }}><svg viewBox="0 0 384 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg></span>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{signal.name}</span>
                {signal.impact === 'high' && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: imp.color, background: imp.bg, border: `1px solid ${imp.border}`, borderRadius: 100, padding: '2px 8px', whiteSpace: 'nowrap' }}>HIGH IMPACT</span>
                )}
              </div>
              <p style={{ fontSize: 12, color: GRAY, margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{signal.value}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button
              onClick={e => { e.stopPropagation(); copyFix(signal); }}
              style={{ background: copied === signal.name ? GREEN : BG, border: `1px solid ${copied === signal.name ? '#A7F3D0' : BORDER}`, borderRadius: 7, padding: '5px 12px', fontSize: 11, fontWeight: 700, color: copied === signal.name ? '#fff' : GRAY, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s', whiteSpace: 'nowrap' }}
            >
              {copied === signal.name ? (<><svg viewBox="0 0 448 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>{' '}Copied</>) : 'Copy fix'}
            </button>
            <span style={{ fontSize: 12, color: LGRAY }}>{isExpanded ? <svg viewBox="0 0 320 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M182.6 137.4c-12.5-12.5-32.8-12.5-45.3 0l-128 128c-9.2 9.2-11.9 22.9-6.9 34.9s16.6 19.8 29.6 19.8l256 0c12.9 0 24.6-7.8 29.6-19.8s2.2-25.7-6.9-34.9l-128-128z"/></svg> : <svg viewBox="0 0 320 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M137.4 374.6c12.5 12.5 32.8 12.5 45.3 0l128-128c9.2-9.2 11.9-22.9 6.9-34.9s-16.6-19.8-29.6-19.8L32 192c-12.9 0-24.6 7.8-29.6 19.8s-2.2 25.7 6.9 34.9l128 128z"/></svg>}</span>
          </div>
        </div>
        {isExpanded && (
          <div style={{ background: '#FFFBEB', borderTop: `1px solid #FCD34D`, padding: '14px 18px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: AMBER, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>How to fix</p>
            <pre style={{ fontSize: 12, color: NAVY, lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{signal.fix}</pre>
          </div>
        )}
      </div>
    );
  };

  // Gate: while the session is being checked, show loading — never the
  // tool. Logged out, show the sign-in gate instead of the tool UI.
  if (!authChecked) {
    return (
      <div style={{ padding: '28px 24px', maxWidth: 920, margin: '0 auto' }}>
        <p style={{ fontSize: 14, color: GRAY }}>Loading…</p>
      </div>
    );
  }
  if (!signedIn) {
    return (
      <div style={{ padding: '28px 24px', maxWidth: 920, margin: '0 auto' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>URL Intelligence</p>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: NAVY, marginBottom: 8, letterSpacing: '-0.5px' }}>AI Readiness Audit</h1>
        <p style={{ fontSize: 14, color: GRAY, lineHeight: 1.6 }}>
          Sign in to use URL Intelligence. <Link href="/login?next=/dashboard/url-intelligence" style={{ color: BLUE, fontWeight: 600 }}>Sign in →</Link>
        </p>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
        }
      `}</style>

      <div style={{ padding: '28px 24px', maxWidth: 920, margin: '0 auto' }}>

        {/* Header */}
        <div className="no-print" style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>URL Intelligence</p>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: NAVY, marginBottom: 8, letterSpacing: '-0.5px' }}>AI Readiness Audit</h1>
          <p style={{ fontSize: 14, color: GRAY, lineHeight: 1.6 }}>
            Enter any website URL to instantly audit its AI-readiness signals — the technical and content factors that determine whether ChatGPT, Gemini, and Perplexity will recommend it.
          </p>
        </div>

        {/* Input */}
        <div className="no-print" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '24px 28px', marginBottom: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 12 }}>Website URL</p>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <input
              type="url" value={url} onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runAnalysis()}
              placeholder="https://yourwebsite.com"
              style={{ flex: '1 1 220px', minWidth: 0, background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '11px 16px', fontSize: 14, color: NAVY, outline: 'none', fontFamily: 'inherit' }}
            />
            <button
              onClick={runAnalysis} disabled={loading || !url.trim()}
              style={{ background: loading || !url.trim() ? LGRAY : BLUE, border: 'none', borderRadius: 10, padding: '11px 24px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: loading || !url.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'background 0.2s', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 8 }}
            >
              {loading && <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
              {loading ? 'Analysing…' : (<>Run Audit <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>)}
            </button>
          </div>

          {!showCompetitor ? (
            <button onClick={() => setShowComp(true)} style={{ background: 'none', border: 'none', color: BLUE, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
              + Add competitor URL for comparison
            </button>
          ) : (
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: GRAY, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Competitor URL (optional)</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  type="url" value={competitorUrl} onChange={e => setCompUrl(e.target.value)}
                  placeholder="https://competitor.com"
                  style={{ flex: 1, background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '11px 16px', fontSize: 14, color: NAVY, outline: 'none', fontFamily: 'inherit' }}
                />
                <button onClick={() => { setShowComp(false); setCompUrl(''); }} style={{ background: 'none', border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '11px 16px', fontSize: 13, color: GRAY, cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>
              </div>
            </div>
          )}

          {error && <p style={{ fontSize: 13, color: RED, marginTop: 10, fontWeight: 500 }}>{error}</p>}
        </div>

        {/* b8ae: say what the page does before the first audit instead of
            showing a bare form. */}
        {!result && !loading && !error && (
          <div style={{ background: '#fff', border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '20px 22px', marginBottom: 20 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: NAVY, margin: '0 0 6px' }}>No audit open yet</p>
            <p style={{ fontSize: 14, color: GRAY, margin: 0, lineHeight: 1.6 }}>Enter a page address above and choose Run Audit. You&apos;ll see which signals help AI assistants read and recommend the page, which ones are missing, and the fix for each. Add a competitor&apos;s page to compare the two.</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <>
            {/* PageSpeed card */}
            {(result.pageSpeed?.mobile != null || result.pageSpeed?.desktop != null) && (
              <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '22px 28px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>Page Speed (Google Lighthouse)</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
                  {[
                    { label: 'Mobile Speed', value: result.pageSpeed.mobile, isScore: true },
                    { label: 'Desktop Speed', value: result.pageSpeed.desktop, isScore: true },
                    { label: 'LCP', value: result.pageSpeed.lcp, isScore: false },
                    { label: 'CLS', value: result.pageSpeed.cls, isScore: false },
                  ].map(item => (
                    <div key={item.label} style={{ background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
                      <p style={{ fontSize: item.isScore ? 28 : 20, fontWeight: 900, color: item.isScore ? speedColor(item.value as number | null) : NAVY, lineHeight: 1, marginBottom: 4 }}>
                        {item.value ?? '—'}
                      </p>
                      {item.isScore && item.value != null && (
                        <p style={{ fontSize: 10, fontWeight: 700, color: speedColor(item.value as number | null), marginBottom: 2 }}>
                          {speedLabel(item.value as number | null)}
                        </p>
                      )}
                      <p style={{ fontSize: 11, color: GRAY, fontWeight: 600 }}>{item.label}</p>
                    </div>
                  ))}
                </div>
                {result.pageSpeed.mobile != null && result.pageSpeed.mobile < 50 && (
                  <p style={{ fontSize: 12, color: RED, fontWeight: 600, marginTop: 12, marginBottom: 0 }}>
                    <svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg> Mobile speed is slow — Google and AI crawlers use Core Web Vitals as a trust signal. Use PageSpeed Insights to identify render-blocking resources.
                  </p>
                )}
              </div>
            )}

            {/* Google Places card */}
            {result.places && (
              <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '22px 28px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Google Places</p>
                  <p style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 4 }}>{result.places.name}</p>
                  <p style={{ fontSize: 13, color: GRAY }}>
                    <span style={{ color: AMBER }}>{Array.from({ length: Math.round(result.places.rating) }).map((_, i) => (<span key={i} style={{ display: 'inline-flex' }}><svg viewBox="0 0 576 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329 542.7 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z"/></svg></span>))}{Array.from({ length: 5 - Math.round(result.places.rating) }).map((_, i) => (<span key={i} style={{ display: 'inline-flex' }}><svg viewBox="0 0 576 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M287.9 0c9.2 0 17.6 5.2 21.6 13.5l68.6 141.3 153.2 22.6c9 1.3 16.5 7.6 19.3 16.3s.5 18.1-5.9 24.5L433.6 328.4l26.2 155.6c1.5 9-2.2 18.1-9.7 23.5s-17.3 6-25.3 1.7l-137-73.2L151 509.1c-8.1 4.3-17.9 3.7-25.3-1.7s-11.2-14.5-9.7-23.5l26.2-155.6L31.1 218.2c-6.5-6.4-8.7-15.9-5.9-24.5s10.3-14.9 19.3-16.3l153.2-22.6L266.3 13.5C270.4 5.2 278.7 0 287.9 0zm0 79L235.4 187.2c-3.5 7.1-10.2 12.1-18.1 13.3L99 217.9 184.9 303c5.5 5.5 8.1 13.3 6.8 21L171.4 443.7l105.2-56.2c7.1-3.8 15.6-3.8 22.6 0l105.2 56.2L384.2 324.1c-1.3-7.7 1.2-15.5 6.8-21l85.9-85.1L358.6 200.5c-7.8-1.2-14.6-6.1-18.1-13.3L287.9 79z"/></svg></span>))}</span>
                    {' '}<strong style={{ color: NAVY }}>{result.places.rating.toFixed(1)}</strong>
                    {' · '}{result.places.reviewCount.toLocaleString()} Google reviews
                  </p>
                </div>
                <div style={{ background: result.places.rating >= 4 ? '#ECFDF5' : '#FFFBEB', border: `1.5px solid ${result.places.rating >= 4 ? '#A7F3D0' : '#FCD34D'}`, borderRadius: 12, padding: '12px 20px', textAlign: 'center' }}>
                  <p style={{ fontSize: 28, fontWeight: 900, color: result.places.rating >= 4 ? GREEN : AMBER, lineHeight: 1, marginBottom: 2 }}>{result.places.rating.toFixed(1)}<svg viewBox="0 0 576 512" width="28" height="28" fill="currentColor" aria-hidden="true"><path d="M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329 542.7 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z"/></svg></p>
                  <p style={{ fontSize: 11, color: GRAY, fontWeight: 600 }}>{result.places.reviewCount.toLocaleString()} reviews</p>
                </div>
              </div>
            )}

            {/* Score summary */}
            <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '24px 28px', marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>AI Readiness Score</p>
                  <p style={{ fontSize: 13, color: GRAY }}>
                    Audited: <span style={{ color: NAVY, fontWeight: 600 }}>{result.url}</span>
                    {' · '}{new Date(result.scrapedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 52, fontWeight: 900, color: scoreColor(result.score), lineHeight: 1, marginBottom: 4 }}>{result.score}</p>
                  <p style={{ fontSize: 12, color: GRAY }}>/100</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
                {[
                  { label: 'Signals Passing', value: passing, color: GREEN, bg: '#ECFDF5', border: '#A7F3D0' },
                  { label: 'Signals Failing', value: failing, color: RED, bg: '#FEF2F2', border: '#FCA5A5' },
                  { label: 'High Impact Fails', value: highFails, color: AMBER, bg: '#FFFBEB', border: '#FCD34D' },
                ].map(item => (
                  <div key={item.label} style={{ background: item.bg, border: `1.5px solid ${item.border}`, borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
                    <p style={{ fontSize: 28, fontWeight: 900, color: item.color, lineHeight: 1, marginBottom: 4 }}>{item.value}</p>
                    <p style={{ fontSize: 11, color: GRAY, fontWeight: 600 }}>{item.label}</p>
                  </div>
                ))}
              </div>

              {result.score < 50 && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
                  <p style={{ fontSize: 13, color: RED, fontWeight: 600, margin: 0 }}><svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg> Score below 50 — AI platforms are unlikely to recommend this site for competitive queries. Fix the high-impact signals first.</p>
                </div>
              )}
              {result.score >= 75 && (
                <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 10, padding: '12px 16px', marginBottom: 12 }}>
                  <p style={{ fontSize: 13, color: GREEN, fontWeight: 600, margin: 0 }}><svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> Strong AI readiness score — address remaining failing signals to maximise recommendation frequency.</p>
                </div>
              )}

              {/* Action toolbar */}
              <div className="no-print" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', borderTop: `1px solid ${BORDER}`, paddingTop: 16 }}>
                <button
                  onClick={shareAudit}
                  style={{ background: shareFlash ? GREEN : BG, border: `1.5px solid ${shareFlash ? '#A7F3D0' : BORDER}`, borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 700, color: shareFlash ? '#fff' : GRAY, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s' }}
                >
                  {shareFlash ? (<><svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>{' '}Link copied!</>) : (<><svg viewBox="0 0 640 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M579.8 267.7c56.5-56.5 56.5-148 0-204.5c-50-50-128.8-56.5-186.3-15.4l-1.6 1.1c-14.4 10.3-17.7 30.3-7.4 44.6s30.3 17.7 44.6 7.4l1.6-1.1c32.1-22.9 76-19.3 103.8 8.6c31.5 31.5 31.5 82.5 0 114L422.3 334.8c-31.5 31.5-82.5 31.5-114 0c-27.9-27.9-31.5-71.8-8.6-103.8l1.1-1.6c10.3-14.4 6.9-34.4-7.4-44.6s-34.4-6.9-44.6 7.4l-1.1 1.6C206.5 251.2 213 330 263 380c56.5 56.5 148 56.5 204.5 0L579.8 267.7zM60.2 244.3c-56.5 56.5-56.5 148 0 204.5c50 50 128.8 56.5 186.3 15.4l1.6-1.1c14.4-10.3 17.7-30.3 7.4-44.6s-30.3-17.7-44.6-7.4l-1.6 1.1c-32.1 22.9-76 19.3-103.8-8.6C74 372 74 321 105.5 289.5L217.7 177.2c31.5-31.5 82.5-31.5 114 0c27.9 27.9 31.5 71.8 8.6 103.9l-1.1 1.6c-10.3 14.4-6.9 34.4 7.4 44.6s34.4 6.9 44.6-7.4l1.1-1.6C433.5 260.8 427 182 377 132c-56.5-56.5-148-56.5-204.5 0L60.2 244.3z"/></svg>{' '}Share audit</>)}
                </button>
                <button
                  onClick={() => window.print()}
                  style={{ background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 700, color: GRAY, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <svg viewBox="0 0 384 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M169.4 470.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 370.8 224 64c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 306.7L54.6 265.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"/></svg> Download / Print
                </button>
              </div>
            </div>

            {/* Competitor comparison */}
            {result.competitor && (
              <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '24px 28px', marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <h2 style={{ fontSize: 16, fontWeight: 800, color: NAVY, marginBottom: 4 }}>Side-by-Side Comparison</h2>
                <p style={{ fontSize: 13, color: GRAY, marginBottom: 20 }}>Your site vs {result.competitor.url}</p>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 0, marginBottom: 0, border: `1.5px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
                  {/* Header */}
                  <div style={{ padding: '10px 14px', background: BG, borderBottom: `1px solid ${BORDER}`, fontSize: 11, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Signal</div>
                  <div style={{ padding: '10px 14px', background: '#ECEBFF', borderBottom: `1px solid ${BORDER}`, borderLeft: `1px solid ${BORDER}`, textAlign: 'center', fontSize: 11, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Your Site ({result.score})
                  </div>
                  <div style={{ padding: '10px 14px', background: BG, borderBottom: `1px solid ${BORDER}`, borderLeft: `1px solid ${BORDER}`, textAlign: 'center', fontSize: 11, fontWeight: 700, color: GRAY, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Competitor ({result.competitor.score})
                  </div>

                  {/* Signal rows */}
                  {result.signals.map((signal, i) => {
                    const comp = result.competitor!.signals.find(s => s.name === signal.name);
                    const youWin  = signal.status === 'pass' && comp?.status === 'fail';
                    const youLose = signal.status === 'fail' && comp?.status === 'pass';
                    const isLast  = i === result.signals.length - 1;
                    return (
                      <>
                        <div key={`n-${signal.name}`} style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: NAVY, background: youWin ? '#F0FDF4' : youLose ? '#FEF2F2' : W, borderBottom: isLast ? 'none' : `1px solid ${BORDER}`, display: 'flex', alignItems: 'center' }}>{signal.name}</div>
                        <div key={`y-${signal.name}`} style={{ padding: '10px 14px', textAlign: 'center', borderLeft: `1px solid ${BORDER}`, borderBottom: isLast ? 'none' : `1px solid ${BORDER}`, background: youWin ? '#F0FDF4' : youLose ? '#FEF2F2' : '#FAFBFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                          {signal.status === 'pass' ? <span style={{ color: GREEN }}><svg viewBox="0 0 448 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg></span> : <span style={{ color: RED }}><svg viewBox="0 0 384 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg></span>}
                        </div>
                        <div key={`c-${signal.name}`} style={{ padding: '10px 14px', textAlign: 'center', borderLeft: `1px solid ${BORDER}`, borderBottom: isLast ? 'none' : `1px solid ${BORDER}`, background: youWin ? '#F0FDF4' : youLose ? '#FEF2F2' : W, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                          {comp?.status === 'pass' ? <span style={{ color: GREEN }}><svg viewBox="0 0 448 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg></span> : <span style={{ color: RED }}><svg viewBox="0 0 384 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg></span>}
                        </div>
                      </>
                    );
                  })}
                </div>
                <p style={{ fontSize: 12, color: LGRAY, marginTop: 10, marginBottom: 0 }}>Green = you pass, competitor fails · Red = competitor passes, you don't</p>
              </div>
            )}

            {/* Failing signals */}
            {failing > 0 && (
              <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '24px 28px', marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <h2 style={{ fontSize: 16, fontWeight: 800, color: NAVY, marginBottom: 18 }}>Failing Signals — Fix These</h2>
                {result.signals.filter(s => s.status === 'fail').map(signal => (
                  <SignalRow key={signal.name} signal={signal} />
                ))}
              </div>
            )}

            {/* Passing signals */}
            {passing > 0 && (
              <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '24px 28px', marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <h2 style={{ fontSize: 16, fontWeight: 800, color: NAVY, marginBottom: 18 }}>Passing Signals <svg viewBox="0 0 448 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg></h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                  {result.signals.filter(s => s.status === 'pass').map(signal => (
                    <div key={signal.name} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: '#ECFDF5', border: '1.5px solid #A7F3D0', borderRadius: 10, padding: '12px 14px' }}>
                      <span style={{ color: GREEN, fontSize: 14, flexShrink: 0, marginTop: 1 }}><svg viewBox="0 0 448 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg></span>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, margin: '0 0 2px' }}>{signal.name}</p>
                        <p style={{ fontSize: 11, color: GRAY, margin: 0, lineHeight: 1.5 }}>{signal.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Email report */}
            <div className="no-print" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '22px 28px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 12 }}>Email this report</p>
              {emailError && (
                <p style={{ fontSize: 13, color: '#DC2626', margin: '0 0 10px' }}>{emailError}</p>
              )}
              {copyError && (
                <p style={{ fontSize: 13, color: '#92400E', margin: '0 0 10px' }}>{copyError}</p>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  type="email" value={emailAddr} onChange={e => setEmailAddr(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendEmail()}
                  placeholder="recipient@example.com"
                  disabled={emailSent}
                  style={{ flex: 1, background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '11px 16px', fontSize: 14, color: NAVY, outline: 'none', fontFamily: 'inherit', opacity: emailSent ? 0.6 : 1 }}
                />
                <button
                  onClick={sendEmail}
                  disabled={!emailAddr.trim() || emailSending || emailSent}
                  style={{ background: emailSent ? GREEN : !emailAddr.trim() || emailSending ? LGRAY : BLUE, border: 'none', borderRadius: 10, padding: '11px 20px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: !emailAddr.trim() || emailSending || emailSent ? 'not-allowed' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                >
                  {emailSent ? (<><svg viewBox="0 0 448 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>{' '}Sent!</>) : emailSending ? 'Sending…' : (<>Send Report <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>)}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default function UrlIntelligencePage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: LGRAY }}>Loading…</div>}>
      <UrlIntelligenceInner />
    </Suspense>
  );
}
