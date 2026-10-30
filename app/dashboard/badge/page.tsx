'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getBrowserClient } from '@/lib/supabase';
import { badgeScore } from '@/lib/badgeScore';
const supabase = getBrowserClient();

// ── b35x: b35q design tokens on staging logic ──
const BG     = '#F6F6FB';
const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#E7E7F0';
const BLUE   = '#1B17FF';
const GREEN  = '#12A150';
const AMBER  = '#D97706';
const RED_X  = '#D92D20';
const GRAY   = '#55556A';
const LGRAY  = '#94A3B8';
const MUTED  = '#5F5F78';
const FIX_BG = '#F4F3FF';

const BASE = 'https://rankall.io';

interface Scan {
  id: string;
  input: string;
  user_business_name: string | null;
  overall_score: number;
  trust_signals: { overall?: number } | null;
  created_at: string;
}

type EmbedTab = 'html' | 'linked' | 'markdown';
type PlatformTab = 'html-site' | 'wordpress' | 'squarespace';

function scoreColor(s: number) {
  return s >= 70 ? GREEN : s >= 40 ? AMBER : RED_X;
}

interface VerifiedOutcome {
  id: string;
  business_name: string | null;
  fix_type: string | null;
  score_before: number | null;
  score_after: number | null;
}

// Verified badges the owner has published — embeddable proof of real results.
function VerifiedBadgeSection() {
  const [outcomes, setOutcomes] = useState<VerifiedOutcome[] | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/outcomes/verified')
      .then(r => r.ok ? r.json() : { outcomes: [] })
      .then(d => setOutcomes(d.outcomes ?? d ?? []))
      .catch(() => setOutcomes([]));
  }, []);

  if (outcomes === null || outcomes.length === 0) return null;

  function copyCode(id: string) {
    const code = `<a href="${BASE}/verified/${id}" target="_blank" rel="noopener">\n  <img src="${BASE}/api/badge/verified/${id}" alt="Verified by Rankall.io" />\n</a>`;
    navigator.clipboard.writeText(code).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  return (
    <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 20, padding: '28px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 20 }}>
      <p style={{ fontSize: 15, fontWeight: 800, color: NAVY, marginBottom: 6 }}>Verified Badges</p>
      <p style={{ fontSize: 13, color: GRAY, marginBottom: 20, lineHeight: 1.6 }}>
        Proof of real, verified score improvements. Embed these where clients can see them.
      </p>
      {outcomes.map(o => (
        <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 0', borderTop: `1px solid ${BORDER}`, flexWrap: 'wrap' as const }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/badge/verified/${o.id}`} alt="Verified by Rankall.io" style={{ display: 'block' }} />
          <div style={{ flex: 1, minWidth: 180 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: '0 0 4px' }}>
              {o.business_name || 'Your Business'}
            </p>
            <p style={{ fontSize: 12, color: GRAY, margin: 0 }}>
              {o.score_before} → {o.score_after} ({o.fix_type})
            </p>
          </div>
          <button
            onClick={() => copyCode(o.id)}
            style={{
              background: copiedId === o.id ? GREEN : '#1E293B',
              border: `1.5px solid ${copiedId === o.id ? GREEN : '#334155'}`,
              borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 700,
              color: copiedId === o.id ? W : '#94A3B8', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {copiedId === o.id ? 'Copied!' : 'Copy embed'}
          </button>
        </div>
      ))}
    </div>
  );
}

export default function BadgePage() {
  const [scan, setScan]               = useState<Scan | null>(null);
  const [loading, setLoading]         = useState(true);
  const [embedTab, setEmbedTab]       = useState<EmbedTab>('linked');
  const [platformTab, setPlatformTab] = useState<PlatformTab>('html-site');
  const [copied, setCopied]           = useState(false);

  const [signedOut, setSignedOut] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      // b89f: a signed-out visitor is not a user with "No scan found"
      // (the proxy normally redirects first; this is defence in depth).
      if (!session) { setSignedOut(true); setLoading(false); return; }
      const { data } = await supabase
        .from('rankall_scans')
        .select('id, input, user_business_name, overall_score, trust_signals, created_at')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      setScan(data || null);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return (
    <div style={{ padding: '48px 32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: GRAY }}>Loading…</p>
    </div>
  );

  if (signedOut) return (
    <div style={{ padding: '48px 32px', textAlign: 'center' }}>
      <p style={{ fontSize: 17, fontWeight: 700, color: NAVY, marginBottom: 8 }}>Sign in to view your score badge.</p>
      <p style={{ fontSize: 14, color: GRAY, marginBottom: 24 }}>Your badge is generated from your latest scan.</p>
      <Link href="/login?next=/dashboard/badge" style={{ fontSize: 14, color: BLUE, fontWeight: 700 }}>Sign in →</Link>
    </div>
  );

  if (!scan) return (
    <div style={{ padding: '48px 32px', textAlign: 'center' }}>
      <p style={{ fontSize: 40, marginBottom: 16 }}><svg viewBox="0 0 512 512" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M4.1 38.2C1.4 34.2 0 29.4 0 24.6C0 11 11 0 24.6 0L133.9 0c11.2 0 21.7 5.9 27.4 15.5l68.5 114.1c-48.2 6.1-91.3 28.6-123.4 61.9L4.1 38.2zm503.7 0L405.6 191.5c-32.1-33.3-75.2-55.8-123.4-61.9L350.7 15.5C356.5 5.9 366.9 0 378.1 0L487.4 0C501 0 512 11 512 24.6c0 4.8-1.4 9.6-4.1 13.6zM80 336a176 176 0 1 1 352 0A176 176 0 1 1 80 336zm184.4-94.9c-3.4-7-13.3-7-16.8 0l-22.4 45.4c-1.4 2.8-4 4.7-7 5.1L168 298.9c-7.7 1.1-10.7 10.5-5.2 16l36.3 35.4c2.2 2.2 3.2 5.2 2.7 8.3l-8.6 49.9c-1.3 7.6 6.7 13.5 13.6 9.9l44.8-23.6c2.7-1.4 6-1.4 8.7 0l44.8 23.6c6.9 3.6 14.9-2.2 13.6-9.9l-8.6-49.9c-.5-3 .5-6.1 2.7-8.3l36.3-35.4c5.6-5.4 2.5-14.8-5.2-16l-50.1-7.3c-3-.4-5.7-2.4-7-5.1l-22.4-45.4z"/></svg></p>
      <p style={{ fontSize: 17, fontWeight: 700, color: NAVY, marginBottom: 8 }}>No scan found</p>
      <p style={{ fontSize: 14, color: GRAY, marginBottom: 24 }}>Run your first scan to generate your score badge.</p>
      <a href="/" style={{ background: BLUE, borderRadius: 12, padding: '12px 24px', fontSize: 14, fontWeight: 700, color: W, textDecoration: 'none' }}>
        Run a scan <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
    </div>
  );

  // b89f: the badge is labelled "AI Visibility Score" — it carries
  // overall_score, never the Trust overall (see lib/badgeScore).
  const score       = badgeScore(scan);
  const scanDate    = scan.created_at ? new Date(scan.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
  const bizName     = scan.user_business_name || scan.input?.split(' in ')[0] || 'Your Business';
  const badgeUrl    = `${BASE}/api/badge/${scan.id}`;
  // /report/<id> is private to the owner; /r/<id> is the public share page.
  const reportUrl   = `${BASE}/r/${scan.id}`;
  const altText     = 'AI Visibility Score — Verified by Rankall.io';

  const embedCodes: Record<EmbedTab, { label: string; code: string }> = {
    html:     { label: 'HTML img tag',        code: `<img src="${badgeUrl}" alt="${altText}" width="320" height="80" />` },
    linked:   { label: 'Linked HTML (recommended)', code: `<a href="${reportUrl}" target="_blank" rel="noopener">\n  <img src="${badgeUrl}" alt="${altText}" width="320" height="80" />\n</a>` },
    markdown: { label: 'Markdown',            code: `[![${altText}](${badgeUrl})](${reportUrl})` },
  };

  const platforms: Record<PlatformTab, { label: string; icon: React.ReactNode; steps: string[] }> = {
    'html-site': {
      label: 'HTML Site', icon: <svg viewBox="0 0 512 512" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M352 256c0 22.2-1.2 43.6-3.3 64l-185.3 0c-2.2-20.4-3.3-41.8-3.3-64s1.2-43.6 3.3-64l185.3 0c2.2 20.4 3.3 41.8 3.3 64zm28.8-64l123.1 0c5.3 20.5 8.1 41.9 8.1 64s-2.8 43.5-8.1 64l-123.1 0c2.1-20.6 3.2-42 3.2-64s-1.1-43.4-3.2-64zm112.6-32l-116.7 0c-10-63.9-29.8-117.4-55.3-151.6c78.3 20.7 142 77.5 171.9 151.6zm-149.1 0l-176.6 0c6.1-36.4 15.5-68.6 27-94.7c10.5-23.6 22.2-40.7 33.5-51.5C239.4 3.2 248.7 0 256 0s16.6 3.2 27.8 13.8c11.3 10.8 23 27.9 33.5 51.5c11.6 26 20.9 58.2 27 94.7zm-209 0L18.6 160C48.6 85.9 112.2 29.1 190.6 8.4C165.1 42.6 145.3 96.1 135.3 160zM8.1 192l123.1 0c-2.1 20.6-3.2 42-3.2 64s1.1 43.4 3.2 64L8.1 320C2.8 299.5 0 278.1 0 256s2.8-43.5 8.1-64zM194.7 446.6c-11.6-26-20.9-58.2-27-94.6l176.6 0c-6.1 36.4-15.5 68.6-27 94.6c-10.5 23.6-22.2 40.7-33.5 51.5C272.6 508.8 263.3 512 256 512s-16.6-3.2-27.8-13.8c-11.3-10.8-23-27.9-33.5-51.5zM135.3 352c10 63.9 29.8 117.4 55.3 151.6C112.2 482.9 48.6 426.1 18.6 352l116.7 0zm358.1 0c-30 74.1-93.6 130.9-171.9 151.6c25.5-34.2 45.2-87.7 55.3-151.6l116.7 0z"/></svg>,
      steps: [
        'Choose an embed format above and click Copy',
        'Open your website\'s HTML editor',
        'Paste the code where you want the badge to appear',
        'Save — the badge is live and auto-updates on rescan',
      ],
    },
    wordpress: {
      label: 'WordPress', icon: <svg viewBox="0 0 576 512" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M0 64C0 28.7 28.7 0 64 0L224 0l0 128c0 17.7 14.3 32 32 32l128 0 0 125.7-86.8 86.8c-10.3 10.3-17.5 23.1-21 37.2l-18.7 74.9c-2.3 9.2-1.8 18.8 1.3 27.5L64 512c-35.3 0-64-28.7-64-64L0 64zm384 64l-128 0L256 0 384 128zM549.8 235.7l14.4 14.4c15.6 15.6 15.6 40.9 0 56.6l-29.4 29.4-71-71 29.4-29.4c15.6-15.6 40.9-15.6 56.6 0zM311.9 417L441.1 287.8l71 71L382.9 487.9c-4.1 4.1-9.2 7-14.9 8.4l-60.1 15c-5.5 1.4-11.2-.2-15.2-4.2s-5.6-9.7-4.2-15.2l15-60.1c1.4-5.6 4.3-10.8 8.4-14.9z"/></svg>,
      steps: [
        'In the WordPress block editor, add a new block',
        'Search for "Custom HTML" and select it',
        'Paste the Linked HTML embed code into the block',
        'Preview, then publish — the badge appears immediately',
      ],
    },
    squarespace: {
      label: 'Squarespace', icon: <svg viewBox="0 0 448 512" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M0 96C0 60.7 28.7 32 64 32H384c35.3 0 64 28.7 64 64V416c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V96z"/></svg>,
      steps: [
        'Edit the page where you want to add the badge',
        'Click the "+" to add a block, then choose "Code"',
        'Paste the Linked HTML embed code and click Apply',
        'Save the page — visitors will see your score badge',
      ],
    },
  };

  const activePlatform = platforms[platformTab];
  const activeEmbed    = embedCodes[embedTab];

  function copyEmbed() {
    // Copying the embed code is the owner explicitly publishing the badge
    // (and /r/ share page) — they render real data only once is_public is set.
    if (scan) fetch(`/api/report/${scan.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'share' }) }).catch(() => {});
    navigator.clipboard.writeText(activeEmbed.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function Tab({ id, label, active, onClick }: { id: string; label: string; active: boolean; onClick: () => void }) {
    return (
      <button
        onClick={onClick}
        style={{
          background: active ? NAVY : 'transparent',
          border: `1px solid ${active ? NAVY : BORDER}`,
          borderRadius: 12, padding: '7px 16px',
          fontSize: 13, fontWeight: 700,
          color: active ? W : MUTED,
          cursor: 'pointer', fontFamily: 'inherit',
          transition: 'all 0.15s',
        }}
      >
        {label}
      </button>
    );
  }

  function PlatformTabBtn({ id, label, icon, active, onClick }: { id: string; label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) {
    return (
      <button
        onClick={onClick}
        style={{
          flex: 1, background: active ? FIX_BG : 'transparent',
          border: `1px solid ${active ? BLUE : BORDER}`,
          borderRadius: 12, padding: '10px 8px',
          fontSize: 13, fontWeight: 700,
          color: active ? BLUE : MUTED,
          cursor: 'pointer', fontFamily: 'inherit',
          transition: 'all 0.15s', textAlign: 'center' as const,
        }}
      >
        <div style={{ fontSize: 18, marginBottom: 3 }}>{icon}</div>
        {label}
      </button>
    );
  }

  return (
    <div style={{ background: BG, minHeight: '100vh', padding: '28px 24px', fontFamily: 'inherit' }}>
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .dash-card { animation: fadeInUp 0.5s ease both; transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .dash-card:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(27,23,255,0.15); }
        .mono{font-family:var(--font-geist-mono),ui-monospace,Menlo,monospace}
        .lbl{font-family:var(--font-geist-mono),monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#5F5F78}
        .card{background:#fff;border:1px solid #E7E7F0;border-radius:16px;padding:22px;min-width:0}
        .h3{margin:0;font-size:17px;font-weight:700;letter-spacing:-0.01em}
        .sub{margin:0;font-size:13px;color:#55556A}
        .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 18px;border-radius:12px;font-family:inherit;font-weight:600;font-size:14px;border:0;cursor:pointer;white-space:nowrap;text-decoration:none}
        .btn-blue{background:#1B17FF;color:#fff}.btn-blue:hover{background:#1310C4;color:#fff}
        .btn-line{background:#fff;color:#0A0A14;border:1px solid #D9D9E6}.btn-line:hover{border-color:#0A0A14;color:#0A0A14}
        .badge-grid{grid-template-columns:1fr 1fr}
        @media (max-width:639px){.badge-grid{grid-template-columns:minmax(0,1fr)!important}.card{padding:18px}}
        @media (prefers-reduced-motion:reduce){*{animation:none!important}}
      `}</style>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>

      {/* Page header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.035em', color: NAVY, marginBottom: 6 }}><svg viewBox="0 0 512 512" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M4.1 38.2C1.4 34.2 0 29.4 0 24.6C0 11 11 0 24.6 0L133.9 0c11.2 0 21.7 5.9 27.4 15.5l68.5 114.1c-48.2 6.1-91.3 28.6-123.4 61.9L4.1 38.2zm503.7 0L405.6 191.5c-32.1-33.3-75.2-55.8-123.4-61.9L350.7 15.5C356.5 5.9 366.9 0 378.1 0L487.4 0C501 0 512 11 512 24.6c0 4.8-1.4 9.6-4.1 13.6zM80 336a176 176 0 1 1 352 0A176 176 0 1 1 80 336zm184.4-94.9c-3.4-7-13.3-7-16.8 0l-22.4 45.4c-1.4 2.8-4 4.7-7 5.1L168 298.9c-7.7 1.1-10.7 10.5-5.2 16l36.3 35.4c2.2 2.2 3.2 5.2 2.7 8.3l-8.6 49.9c-1.3 7.6 6.7 13.5 13.6 9.9l44.8-23.6c2.7-1.4 6-1.4 8.7 0l44.8 23.6c6.9 3.6 14.9-2.2 13.6-9.9l-8.6-49.9c-.5-3 .5-6.1 2.7-8.3l36.3-35.4c5.6-5.4 2.5-14.8-5.2-16l-50.1-7.3c-3-.4-5.7-2.4-7-5.1l-22.4-45.4z"/></svg> Score Badge</h1>
        <p style={{ fontSize: 14, color: GRAY }}>Embed your live AI visibility score on your website — updates automatically when you rescan.</p>
      </div>

      {/* ── SECTION 1: Badge preview ─────────────────────────────────── */}
      <div className="card dash-card" style={{ textAlign: 'center', padding: '36px 28px', marginBottom: 20 }}>
        <p className="lbl" style={{ marginBottom: 20 }}>Live Preview</p>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
        <div style={{ boxShadow: '0 8px 32px rgba(15,23,42,0.18)', borderRadius: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/badge/${scan.id}`}
            alt={altText}
            width={320}
            height={80}
            style={{ display: 'block', borderRadius: 14 }}
          />
        </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
          <div>
            <p style={{ fontSize: 26, fontWeight: 900, color: scoreColor(score), lineHeight: 1, marginBottom: 2 }}>{score}<span style={{ fontSize: 14, color: LGRAY, fontWeight: 500 }}>/100</span></p>
            <p style={{ fontSize: 12, color: LGRAY }}>AI Visibility Score</p>
          </div>
          <div style={{ width: 1, background: BORDER }} />
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: NAVY, lineHeight: 1.3, marginBottom: 2, maxWidth: 200 }}>{bizName}</p>
            <p style={{ fontSize: 12, color: LGRAY }}>Business</p>
          </div>
        </div>
        {scanDate && (
          <p style={{ fontSize: 12, color: LGRAY, textAlign: 'center', marginTop: 14, marginBottom: 0 }}>
            From your latest scan · {scanDate}. Your Trust Score is a separate number and is not shown on this badge.
          </p>
        )}
      </div>

      {/* ── SECTION 2: Embed codes with tabs ─────────────────────────── */}
      <div className="card dash-card" style={{ marginBottom: 20 }}>
        <p className="h3" style={{ marginBottom: 18 }}>Embed Code</p>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' as const }}>
          <Tab id="linked"   label="Linked HTML"  active={embedTab === 'linked'}   onClick={() => setEmbedTab('linked')} />
          <Tab id="html"     label="HTML"          active={embedTab === 'html'}     onClick={() => setEmbedTab('html')} />
          <Tab id="markdown" label="Markdown"      active={embedTab === 'markdown'} onClick={() => setEmbedTab('markdown')} />
        </div>

        {/* Code block */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <button
              onClick={copyEmbed}
              style={{
                background: copied ? GREEN : NAVY,
                border: `1px solid ${copied ? GREEN : NAVY}`,
                borderRadius: 12, padding: '7px 16px',
                fontSize: 13, fontWeight: 700,
                color: copied ? W : '#94A3B8',
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.2s',
              }}
            >
              {copied ? (<><svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>{' '}Copied!</>) : 'Copy'}
            </button>
          </div>
          <div style={{ background: NAVY, borderRadius: 12, padding: '16px 18px', overflow: 'auto', maxWidth: '100%' }}>
            <code style={{ fontSize: 12, color: '#94A3B8', whiteSpace: 'pre-wrap' as const, fontFamily: 'monospace', lineHeight: 1.7, display: 'block', wordBreak: 'break-all' as const, overflowWrap: 'break-word' as const }}>
              {activeEmbed.code}
            </code>
          </div>
        </div>

        <p style={{ fontSize: 12, color: LGRAY, marginTop: 12 }}>
          {embedTab === 'linked' && (<><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>{' '}Recommended — links visitors to your full public AI visibility report</>)}
          {embedTab === 'html' && 'Plain image tag — use when you want to control the link yourself'}
          {embedTab === 'markdown' && 'For README files, GitHub profiles, or documentation sites'}
        </p>
      </div>

      {/* ── SECTION 3: Two-column — Why + How ────────────────────────── */}
      <div className="badge-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

        {/* Left: Why */}
        <div className="card dash-card">
          <p className="h3" style={{ marginBottom: 20 }}>Why add this badge?</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { icon: <svg viewBox="0 0 512 512" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M256 0c4.6 0 9.2 1 13.4 2.9L457.7 82.8c22 9.3 38.4 31 38.3 57.2c-.5 99.2-41.3 280.7-213.6 363.2c-16.7 8-36.1 8-52.8 0C57.3 420.7 16.5 239.2 16 140c-.1-26.2 16.3-47.9 38.3-57.2L242.7 2.9C246.8 1 251.4 0 256 0zm0 66.8l0 378.1C394 378 431.1 230.1 432 141.4L256 66.8s0 0 0 0z"/></svg>, title: 'Build instant trust',     desc: 'Customers see you\'re verified by an independent AI monitoring tool' },
              { icon: <svg viewBox="0 0 640 512" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M320 0c17.7 0 32 14.3 32 32l0 64 120 0c39.8 0 72 32.2 72 72l0 272c0 39.8-32.2 72-72 72l-304 0c-39.8 0-72-32.2-72-72l0-272c0-39.8 32.2-72 72-72l120 0 0-64c0-17.7 14.3-32 32-32zM208 384c-8.8 0-16 7.2-16 16s7.2 16 16 16l32 0c8.8 0 16-7.2 16-16s-7.2-16-16-16l-32 0zm96 0c-8.8 0-16 7.2-16 16s7.2 16 16 16l32 0c8.8 0 16-7.2 16-16s-7.2-16-16-16l-32 0zm96 0c-8.8 0-16 7.2-16 16s7.2 16 16 16l32 0c8.8 0 16-7.2 16-16s-7.2-16-16-16l-32 0zM264 256a40 40 0 1 0 -80 0 40 40 0 1 0 80 0zm152 40a40 40 0 1 0 0-80 40 40 0 1 0 0 80zM48 224l16 0 0 192-16 0c-26.5 0-48-21.5-48-48l0-96c0-26.5 21.5-48 48-48zm544 0c26.5 0 48 21.5 48 48l0 96c0 26.5-21.5 48-48 48l-16 0 0-192 16 0z"/></svg>, title: 'Prove AI visibility',     desc: 'Displays your AI Visibility Score with a Rankall verification mark' },
              { icon: <svg viewBox="0 0 512 512" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M105.1 202.6c7.7-21.8 20.2-42.3 37.8-59.8c62.5-62.5 163.8-62.5 226.3 0L386.3 160 352 160c-17.7 0-32 14.3-32 32s14.3 32 32 32l111.5 0c0 0 0 0 0 0l.4 0c17.7 0 32-14.3 32-32l0-112c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 35.2L414.4 97.6c-87.5-87.5-229.3-87.5-316.8 0C73.2 122 55.6 150.7 44.8 181.4c-5.9 16.7 2.9 34.9 19.5 40.8s34.9-2.9 40.8-19.5zM39 289.3c-5 1.5-9.8 4.2-13.7 8.2c-4 4-6.7 8.8-8.1 14c-.3 1.2-.6 2.5-.8 3.8c-.3 1.7-.4 3.4-.4 5.1L16 432c0 17.7 14.3 32 32 32s32-14.3 32-32l0-35.1 17.6 17.5c0 0 0 0 0 0c87.5 87.4 229.3 87.4 316.7 0c24.4-24.4 42.1-53.1 52.9-83.8c5.9-16.7-2.9-34.9-19.5-40.8s-34.9 2.9-40.8 19.5c-7.7 21.8-20.2 42.3-37.8 59.8c-62.5 62.5-163.8 62.5-226.3 0l-.1-.1L125.6 352l34.4 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L48.4 288c-1.6 0-3.2 .1-4.8 .3s-3.1 .5-4.6 1z"/></svg>, title: 'Always up to date',       desc: 'Badge reflects your latest score — no manual updates ever needed' },
              { icon: <svg viewBox="0 0 512 512" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M32 32c17.7 0 32 14.3 32 32l0 336c0 8.8 7.2 16 16 16l400 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L80 480c-44.2 0-80-35.8-80-80L0 64C0 46.3 14.3 32 32 32zM160 224c17.7 0 32 14.3 32 32l0 64c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32zm128-64l0 160c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-160c0-17.7 14.3-32 32-32s32 14.3 32 32zm64 32c17.7 0 32 14.3 32 32l0 96c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-96c0-17.7 14.3-32 32-32zM480 96l0 224c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-224c0-17.7 14.3-32 32-32s32 14.3 32 32z"/></svg>, title: 'Links to your report',    desc: 'Tapping the badge takes visitors to your full public verification report' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 36, height: 36, background: FIX_BG, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                  {item.icon}
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 2 }}>{item.title}</p>
                  <p style={{ fontSize: 12, color: GRAY, lineHeight: 1.5 }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: How to add it */}
        <div className="card dash-card">
          <p className="h3" style={{ marginBottom: 16 }}>How to add it</p>

          {/* Platform tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <PlatformTabBtn id="html-site"   label="HTML Site"    icon={<svg viewBox="0 0 512 512" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M352 256c0 22.2-1.2 43.6-3.3 64l-185.3 0c-2.2-20.4-3.3-41.8-3.3-64s1.2-43.6 3.3-64l185.3 0c2.2 20.4 3.3 41.8 3.3 64zm28.8-64l123.1 0c5.3 20.5 8.1 41.9 8.1 64s-2.8 43.5-8.1 64l-123.1 0c2.1-20.6 3.2-42 3.2-64s-1.1-43.4-3.2-64zm112.6-32l-116.7 0c-10-63.9-29.8-117.4-55.3-151.6c78.3 20.7 142 77.5 171.9 151.6zm-149.1 0l-176.6 0c6.1-36.4 15.5-68.6 27-94.7c10.5-23.6 22.2-40.7 33.5-51.5C239.4 3.2 248.7 0 256 0s16.6 3.2 27.8 13.8c11.3 10.8 23 27.9 33.5 51.5c11.6 26 20.9 58.2 27 94.7zm-209 0L18.6 160C48.6 85.9 112.2 29.1 190.6 8.4C165.1 42.6 145.3 96.1 135.3 160zM8.1 192l123.1 0c-2.1 20.6-3.2 42-3.2 64s1.1 43.4 3.2 64L8.1 320C2.8 299.5 0 278.1 0 256s2.8-43.5 8.1-64zM194.7 446.6c-11.6-26-20.9-58.2-27-94.6l176.6 0c-6.1 36.4-15.5 68.6-27 94.6c-10.5 23.6-22.2 40.7-33.5 51.5C272.6 508.8 263.3 512 256 512s-16.6-3.2-27.8-13.8c-11.3-10.8-23-27.9-33.5-51.5zM135.3 352c10 63.9 29.8 117.4 55.3 151.6C112.2 482.9 48.6 426.1 18.6 352l116.7 0zm358.1 0c-30 74.1-93.6 130.9-171.9 151.6c25.5-34.2 45.2-87.7 55.3-151.6l116.7 0z"/></svg>} active={platformTab === 'html-site'}   onClick={() => setPlatformTab('html-site')} />
            <PlatformTabBtn id="wordpress"   label="WordPress"    icon={<svg viewBox="0 0 576 512" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M0 64C0 28.7 28.7 0 64 0L224 0l0 128c0 17.7 14.3 32 32 32l128 0 0 125.7-86.8 86.8c-10.3 10.3-17.5 23.1-21 37.2l-18.7 74.9c-2.3 9.2-1.8 18.8 1.3 27.5L64 512c-35.3 0-64-28.7-64-64L0 64zm384 64l-128 0L256 0 384 128zM549.8 235.7l14.4 14.4c15.6 15.6 15.6 40.9 0 56.6l-29.4 29.4-71-71 29.4-29.4c15.6-15.6 40.9-15.6 56.6 0zM311.9 417L441.1 287.8l71 71L382.9 487.9c-4.1 4.1-9.2 7-14.9 8.4l-60.1 15c-5.5 1.4-11.2-.2-15.2-4.2s-5.6-9.7-4.2-15.2l15-60.1c1.4-5.6 4.3-10.8 8.4-14.9z"/></svg>} active={platformTab === 'wordpress'}   onClick={() => setPlatformTab('wordpress')} />
            <PlatformTabBtn id="squarespace" label="Squarespace"  icon={<svg viewBox="0 0 448 512" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M0 96C0 60.7 28.7 32 64 32H384c35.3 0 64 28.7 64 64V416c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V96z"/></svg>}  active={platformTab === 'squarespace'} onClick={() => setPlatformTab('squarespace')} />
          </div>

          {/* Steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {activePlatform.steps.map((step, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                  background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800, color: W,
                }}>
                  {i + 1}
                </div>
                <p style={{ fontSize: 13, color: GRAY, lineHeight: 1.6, marginTop: 3 }}>{step}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── VERIFIED BADGES (STD-06 follow-up, unblocked by #94) ────────── */}
      <VerifiedBadgeSection />

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <div style={{
        background: NAVY, borderRadius: 20, padding: '28px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <p style={{ fontSize: 16, fontWeight: 800, color: W, marginBottom: 6 }}>
            Your score is <span style={{ color: scoreColor(score) }}>{score}/100</span>.{score < 70 ? ' Apply fixes to improve it.' : ' Keep it strong.'}
          </p>
          <p style={{ fontSize: 13, color: LGRAY }}>
            {score < 70
              ? 'Each fix raises your score — your badge updates automatically when you rescan.'
              : 'Your badge is showing a strong score. Share it on your website and with clients.'}
          </p>
        </div>
        <a
          href="/dashboard/fix"
          style={{ background: BLUE, borderRadius: 12, padding: '13px 24px', fontSize: 14, fontWeight: 700, color: W, textDecoration: 'none', whiteSpace: 'nowrap' as const, boxShadow: '0 4px 14px rgba(27,23,255,0.4)' }}
        >
          View Fix Queue <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
      </div>

      </div>
    </div>
  );
}
