'use client';

import { useState, useEffect } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';
import { getBrowserClient } from '@/lib/supabase'
// b8a5: display name for the scanned business (strips SEO taglines from
// the stored name). Same helper as the Trust page (b8ad).
import { coreBusinessName } from '@/lib/trust';
const supabase = getBrowserClient();

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

const BG     = '#F6F6FB';
const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#E7E7F0';
const BLUE   = '#1B17FF';
const GREEN  = '#12A150';
const AMBER  = '#D97706';
const RED    = '#B4232A';
const GRAY   = '#55556A';
const LGRAY  = '#5F5F78';
const PURPLE = '#7C3AED';

const SHARED_STYLE = `
@keyframes fadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.card { background: #fff; border: 1.5px solid #E7E7F0; border-radius: 16px; }
.dash-card { box-shadow: 0 1px 4px rgba(0,0,0,0.04); animation: fadeInUp .35s ease both; }
.lbl { font-size: 13px; font-weight: 700; color: #0A0A14; display: block; margin-bottom: 8px; }
.btn { display: inline-block; border: none; border-radius: 10px; padding: 11px 22px; font-size: 14px; font-weight: 700; color: #fff; text-decoration: none; cursor: pointer; font-family: inherit; }
.btn-blue { background: #1B17FF; }
.btn-line { background: #fff; border: 1.5px solid #E7E7F0; color: #0A0A14; }
.btn-ghost { background: transparent; color: #55556A; }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.pagehead { margin-bottom: 28px; }
.pagehead h1 { font-size: 30px; font-weight: 700; color: #0A0A14; margin-bottom: 6px; display: flex; align-items: center; gap: 10px; }
@media (max-width: 639px) { .pagehead h1 { font-size: 24px; } }
@media (prefers-reduced-motion: reduce) { .dash-card { animation: none; } }
`;

const PLATFORM_META: Record<string, { color: string; l: string }> = {
  ChatGPT:    { color: '#10A37F', l: 'G' },
  Gemini:     { color: '#4285F4', l: 'G' },
  'Google AI': { color: '#0B57D0', l: 'AI' },
  Copilot:    { color: '#0078D4', l: 'C' },
  Perplexity: { color: '#20B2AA', l: 'P' },
  Grok:       { color: '#1DA1F2', l: 'X' },
  Claude:     { color: '#D4774A', l: 'A' },
  DeepSeek:   { color: '#6366F1', l: 'D' },
  Mistral:    { color: '#FF7000', l: 'M' },
  Kimi:       { color: '#A855F7', l: 'K' },
  Groq:       { color: '#059669', l: 'L' },
};

interface PlatformResult {
  platform: string;
  mentioned: boolean;
  response_text: string | null;
}

interface Scan {
  id: string;
  input: string;
  overall_score: number;
  mentioned_count: number | null;
  competitor_name: string | null;
  created_at: string;
  // b8a5: the page never named the business this report is about.
  user_business_name: string | null;
}

export default function ReportPage() {
  const [copied, setCopied]           = useState(false);
  const [copyFailed, setCopyFailed]   = useState(false);
  const [scan, setScan]               = useState<Scan | null>(null);
  const [platforms, setPlatforms]     = useState<PlatformResult[]>([]);
  const [loading, setLoading]         = useState(true);
  const [noScan, setNoScan]           = useState(false);
  const [loadError, setLoadError]     = useState(false);
  // b8a5: session state — logged-out visitors used to get the "No scans
  // yet." empty state, which falsely implies they have no scans.
  const [signedIn, setSignedIn]       = useState(false);

  useEffect(() => {
    async function fetchData() {
      // ax8r: try/catch — a thrown fetch error used to leave the page stuck
      // on "Loading..." forever. Now it renders the honest error state.
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setLoading(false); return; }
        setSignedIn(true);

        const { data: latestScan } = await supabase
          .from('rankall_scans')
          .select('id, input, overall_score, mentioned_count, competitor_name, created_at, user_business_name')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (!latestScan) { setNoScan(true); setLoading(false); return; }
        setScan(latestScan);

        const { data: platformResults } = await supabase
          .from('rankall_platform_results')
          .select('platform, mentioned, response_text')
          .eq('scan_id', latestScan.id);

        setPlatforms(platformResults ?? []);
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) return <div style={{ padding: 40, color: GRAY }}>Loading...</div>;

  if (loadError) return (
    <div className={`${geistSans.variable} ${geistMono.variable}`} style={{ background: BG, minHeight: '100vh', padding: '28px 24px', fontFamily: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif' }}>
      <style>{SHARED_STYLE}</style>
      <div className="pagehead">
        <h1 style={{ fontSize: 30, fontWeight: 700, color: NAVY, marginBottom: 6, letterSpacing: '-0.5px' }}>AI Platform Report</h1>
        <p style={{ fontSize: 14, color: GRAY }}>What every AI platform says about your business right now</p>
      </div>
      <div className="card dash-card" style={{ padding: '28px 32px', textAlign: 'center' }}>
        <p style={{ fontSize: 18, fontWeight: 700, color: NAVY, marginBottom: 12 }}>Couldn't load your report</p>
        <p style={{ fontSize: 14, color: GRAY }}>The report failed to load. Please refresh the page or try again later.</p>
      </div>
    </div>
  );

  // b8a5: signed-out visitors get a sign-in gate, not the empty state.
  if (!signedIn) return (
    <div style={{ background: BG, minHeight: '100vh', padding: '28px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 18, fontWeight: 700, color: NAVY, marginBottom: 12 }}>Sign in to view your report</p>
        <p style={{ fontSize: 14, color: GRAY, marginBottom: 20 }}>Your AI platform report is tied to your account — sign in to see it, or run a free scan to get your first score.</p>
        <a href="/login?next=/dashboard/report" style={{ display: 'inline-block', background: BLUE, borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 700, color: '#fff', textDecoration: 'none' }}>Sign in</a>
      </div>
    </div>
  );

  if (noScan || !scan) return (
    <div style={{ background: BG, minHeight: '100vh', padding: '28px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 18, fontWeight: 700, color: NAVY, marginBottom: 12 }}>No scans yet.</p>
        <a href="/" style={{ fontSize: 14, color: BLUE, fontWeight: 700 }}>Run your first scan <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
      </div>
    </div>
  );

  // ax8r: share URL uses the current origin — the old hardcoded rankall.io
  // sent staging copies of the link to production.
  const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : 'https://rankall.io'}/report/${scan.id}`;
  const mentionedCount = scan.mentioned_count ?? platforms.filter(p => p.mentioned).length;
  const scanDate = new Date(scan.created_at);
  const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // ax8r: clipboard can reject (permissions / insecure context) — surface
  // the failure instead of showing "Link copied" for a copy that never happened.
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyFailed(true);
      setTimeout(() => setCopyFailed(false), 4000);
    }
  }

  const scoreColor = (s: number) => s >= 75 ? GREEN : s >= 50 ? AMBER : RED;

  return (
    <div className={`${geistSans.variable} ${geistMono.variable}`} style={{ background: BG, minHeight: '100vh', padding: '28px 24px', fontFamily: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif' }}>
      <style>{SHARED_STYLE}</style>

      {/* Header */}
      <div className="pagehead" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 4, letterSpacing: '-0.5px' }}>AI Platform Report</h1>
          {/* b8a5: name the business and the scope (latest scan) — the
              page showed an unattributed report with no way to tell
              which scan it was or reach another one. */}
          <p style={{ fontSize: 14, color: GRAY }}>
            Report for <strong style={{ color: NAVY }}>{coreBusinessName(scan.user_business_name || scan.input)}</strong> — your latest scan · Scanned {fmtDate(scanDate)} · <a href="/dashboard/score-history" style={{ color: BLUE, fontWeight: 600, textDecoration: 'none' }}>See all scans</a>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={copyLink}
            className="btn"
            style={{ background: copied ? GREEN : W, border: `1.5px solid ${copied ? GREEN : BORDER}`, borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 700, color: copied ? '#fff' : NAVY, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 7, transition: 'all 0.2s' }}
          >
            <span>{copied ? <svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> : <svg viewBox="0 0 640 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M579.8 267.7c56.5-56.5 56.5-148 0-204.5c-50-50-128.8-56.5-186.3-15.4l-1.6 1.1c-14.4 10.3-17.7 30.3-7.4 44.6s30.3 17.7 44.6 7.4l1.6-1.1c32.1-22.9 76-19.3 103.8 8.6c31.5 31.5 31.5 82.5 0 114L422.3 334.8c-31.5 31.5-82.5 31.5-114 0c-27.9-27.9-31.5-71.8-8.6-103.8l1.1-1.6c10.3-14.4 6.9-34.4-7.4-44.6s-34.4-6.9-44.6 7.4l-1.1 1.6C206.5 251.2 213 330 263 380c56.5 56.5 148 56.5 204.5 0L579.8 267.7zM60.2 244.3c-56.5 56.5-56.5 148 0 204.5c50 50 128.8 56.5 186.3 15.4l1.6-1.1c14.4-10.3 17.7-30.3 7.4-44.6s-30.3-17.7-44.6-7.4l-1.6 1.1c-32.1 22.9-76 19.3-103.8-8.6C74 372 74 321 105.5 289.5L217.7 177.2c31.5-31.5 82.5-31.5 114 0c27.9 27.9 31.5 71.8 8.6 103.9l-1.1 1.6c-10.3 14.4-6.9 34.4 7.4 44.6s34.4 6.9 44.6-7.4l1.1-1.6C433.5 260.8 427 182 377 132c-56.5-56.5-148-56.5-204.5 0L60.2 244.3z"/></svg>}</span>
            {copied ? 'Link copied' : copyFailed ? 'Copy failed — copy the link below' : 'Share report'}
          </button>
          {/* ax8r: was a dead button (no onClick). Wired to the existing
              /api/reports/generate-pdf print flow — it returns a printable
              report page, so the label says Print / PDF, not Download PDF. */}
          <button
            onClick={() => window.open(`/api/reports/generate-pdf?scan_id=${encodeURIComponent(scan.id)}`, '_blank', 'noopener,noreferrer')}
            className="btn btn-blue"
            style={{ background: BLUE, border: 'none', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 7, boxShadow: '0 2px 8px rgba(27,23,255,0.3)' }}
          >
            <span><svg viewBox="0 0 384 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M169.4 470.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 370.8 224 64c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 306.7L54.6 265.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"/></svg></span> Print / PDF
          </button>
        </div>
      </div>

      {/* Share link */}
      <div style={{ background: '#ECEBFF', border: '1.5px solid #C9C6FF', borderRadius: 12, padding: '12px 16px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: GREEN }} />
          <p style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>Public share link: <span style={{ color: BLUE }}>{shareUrl}</span></p>
        </div>
        <p style={{ fontSize: 12, color: GRAY }}>Anyone with this link can view your report · Updates in real time</p>
      </div>

      {/* Score summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { l: 'Overall Score',       v: `${scan.overall_score}/100`, c: scoreColor(scan.overall_score), sub: 'Weighted by Rankall\'s platform scoring weights' },
          { l: 'Platforms appearing', v: `${mentionedCount} / ${platforms.length || 11}`, c: BLUE, sub: `Mentioned on ${mentionedCount} platform${mentionedCount === 1 ? '' : 's'}` },
          { l: 'Top competitor',      v: scan.competitor_name ?? 'Not detected', c: RED, sub: scan.competitor_name ? 'Detected' : 'No competitor found' },
        ].map((s, i) => (
          <div key={i} className="card dash-card" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{s.l}</p>
            <p style={{ fontSize: 26, fontWeight: 900, color: s.c, marginBottom: 2 }}>{s.v}</p>
            <p style={{ fontSize: 12, color: GRAY }}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Platform table */}
      <div className="card dash-card" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 20 }}>

        {/* Table header */}
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 120px', background: NAVY, padding: '12px 20px', gap: 12 }}>
          {['Platform', 'What AI says right now', 'Status'].map(h => (
            <p key={h} style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</p>
          ))}
        </div>

        {/* Platform rows */}
        {platforms.map((r, i) => {
          const meta = PLATFORM_META[r.platform] ?? { color: BLUE, l: r.platform[0] };
          const text = r.response_text ? r.response_text.slice(0, 200) + (r.response_text.length > 200 ? '…' : '') : null;
          // b8a5: a platform that never responded is NOT "Not mentioned" —
          // it gave no answer at all. Three honest states: Mentioned /
          // Not mentioned (responded, no mention) / No response.
          const responded = !!text;
          const statusLabel = !responded ? 'No response' : r.mentioned ? 'Mentioned' : 'Not mentioned';
          const mentionColor = !responded ? GRAY : r.mentioned ? GREEN : RED;
          const mentionBg    = !responded ? '#F1F5F9' : r.mentioned ? '#ECFDF5' : '#FEF2F2';
          const mentionBd    = !responded ? '#CBD5E1' : r.mentioned ? '#A7F3D0' : '#FECACA';
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 120px', padding: '16px 20px', gap: 12, borderTop: `1px solid ${BORDER}`, background: i % 2 === 0 ? W : BG, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 0 6px ${meta.color}44` }}>
                  <span style={{ fontSize: 9, fontWeight: 900, color: '#fff' }}>{meta.l}</span>
                </div>
                <p style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{r.platform}</p>
              </div>
              <p style={{ fontSize: 13, color: GRAY, lineHeight: 1.55, fontStyle: text ? 'italic' : 'normal' }}>
                {text ? `"${text}"` : 'No response recorded.'}
              </p>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: mentionColor, background: mentionBg, border: `1px solid ${mentionBd}`, borderRadius: 100, padding: '3px 10px', display: 'inline-block' }}>
                  {statusLabel}
                </span>
              </div>
            </div>
          );
        })}

        {platforms.length === 0 && (
          <div style={{ padding: '24px 20px', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: GRAY }}>No platform results found for this scan.</p>
          </div>
        )}
      </div>

      {/* Timestamp + methodology */}
      <div className="card dash-card" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '20px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 10 }}>Report methodology</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
          {[
            { l: 'Scan timestamp',    v: fmtDate(scanDate) },
            { l: 'Query used',        v: `"${scan.input}"` },
            { l: 'Platforms queried', v: `${platforms.length || 11} simultaneously` },
            { l: 'Response analysis', v: 'ML sentiment + rank extraction' },
            { l: 'Score method',      v: 'Weighted by Rankall\'s platform scoring weights' },
            { l: 'Next rescan',       v: 'On demand — rescan from the dashboard' },
          ].map((item, i) => (
            <div key={i}>
              <p style={{ fontSize: 11, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{item.l}</p>
              <p style={{ fontSize: 13, color: NAVY, fontWeight: 600 }}>{item.v}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
