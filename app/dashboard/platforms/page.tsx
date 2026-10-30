'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Geist, Geist_Mono } from 'next/font/google';
import { getBrowserClient } from '@/lib/supabase'
import PlatformBadge from '@/components/PlatformBadge';
// b8a2: business display name (strips SEO taglines). Same helper as
// the Trust page (b8ad).
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
  .pagehead { margin-bottom: 24px; animation: fadeInUp .4s ease both; }
  .pagehead h1 { font-size: 30px; font-weight: 700; color: ${NAVY}; margin: 0 0 4px; letter-spacing: -0.5px; }
  .pagehead p { font-size: 14px; color: ${GRAY}; margin: 0; }
  .card { background: ${W}; border: 1.5px solid ${BORDER}; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
  .dash-card { animation: fadeInUp .4s ease both; }
  .lbl { font-size: 11px; font-weight: 700; color: ${LGRAY}; text-transform: uppercase; letter-spacing: 0.06em; }
  .btn { display: inline-block; border-radius: 10px; padding: 13px 28px; font-size: 14px; font-weight: 700; text-decoration: none; cursor: pointer; border: none; }
  .btn-blue { background: ${BLUE}; color: #fff; }
  .btn-line { background: ${W}; color: ${NAVY}; border: 1.5px solid ${BORDER}; }
  .btn-ghost { background: transparent; color: ${NAVY}; }
  @media (max-width: 639px) { .pagehead h1 { font-size: 24px; } }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
`;

const PLATFORM_META: Record<string, { color: string; l: string }> = {
  ChatGPT:    { color: '#10A37F', l: 'G' },
  Gemini:     { color: '#4285F4', l: 'G' },
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
  weight: number | null;
}

export default function PlatformsPage() {
  const [results, setResults] = useState<PlatformResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [noScan, setNoScan] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // b8a2: session + scan attribution — the page named no business, scan,
  // query or date, and logged-out visitors got an empty shell with
  // zeroed counts instead of a gate.
  const [signedIn, setSignedIn] = useState(false);
  const [scanMeta, setScanMeta] = useState<{ business: string; input: string; date: string } | null>(null);

  useEffect(() => {
    async function fetchData() {
      // ax8r: try/catch — a thrown fetch error used to leave the page stuck
      // on "Loading..." forever. Now it renders the honest error state.
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setLoading(false); return; }
        setSignedIn(true);

        const { data: scan } = await supabase
          .from('rankall_scans')
          .select('id, input, user_business_name, created_at')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (!scan) { setNoScan(true); setLoading(false); return; }
        setScanMeta({
          business: (scan as any).user_business_name || (scan as any).input || '',
          input: (scan as any).input || '',
          date: (scan as any).created_at
            ? new Date((scan as any).created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : '',
        });

        const { data: platformResults } = await supabase
          .from('rankall_platform_results')
          .select('platform, mentioned, response_text, weight')
          .eq('scan_id', scan.id);

        setResults(platformResults ?? []);
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
    <div className={`${geistSans.variable} ${geistMono.variable}`} style={{ background: BG, minHeight: '100vh', padding: '28px 24px', fontFamily: "'var(--font-geist-sans)',ui-sans-serif,system-ui,sans-serif" }}>
      <style>{SHARED_STYLE}</style>
      <div className="pagehead">
        <h1>AI Platform Results</h1>
        <p>What each AI platform says about your business right now</p>
      </div>
      <div className="card dash-card" style={{ padding: '24px', textAlign: 'center' }}>
        <p style={{ fontSize: 18, fontWeight: 700, color: NAVY, marginBottom: 12 }}>Couldn't load platform results</p>
        <p style={{ fontSize: 14, color: GRAY }}>The platform data failed to load. Please refresh the page or try again later.</p>
      </div>
    </div>
  );

  // b8a2: signed-out visitors get a sign-in gate, not a zeroed shell.
  if (!signedIn) return (
    <div style={{ background: BG, minHeight: '100vh', padding: '28px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <p style={{ fontSize: 20, fontWeight: 800, color: NAVY, marginBottom: 10 }}>Sign in to view your platform results</p>
        <p style={{ fontSize: 14, color: GRAY, marginBottom: 24, lineHeight: 1.7 }}>
          Per-platform results come from your own latest scan — sign in to see them, or run a free scan to get your first score.
        </p>
        <Link href="/login?next=/dashboard/platforms" style={{ display: 'inline-block', background: BLUE, borderRadius: 10, padding: '13px 28px', fontSize: 14, fontWeight: 700, color: '#fff', textDecoration: 'none' }}>
          Sign in
        </Link>
      </div>
    </div>
  );

  if (noScan) return (
    <div className={`${geistSans.variable} ${geistMono.variable}`} style={{ background: BG, minHeight: '100vh', padding: '28px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'var(--font-geist-sans)',ui-sans-serif,system-ui,sans-serif" }}>
      <style>{SHARED_STYLE}</style>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}><svg viewBox="0 0 512 512" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M32 32c17.7 0 32 14.3 32 32l0 336c0 8.8 7.2 16 16 16l400 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L80 480c-44.2 0-80-35.8-80-80L0 64C0 46.3 14.3 32 32 32zM160 224c17.7 0 32 14.3 32 32l0 64c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32zm128-64l0 160c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-160c0-17.7 14.3-32 32-32s32 14.3 32 32zm64 32c17.7 0 32 14.3 32 32l0 96c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-96c0-17.7 14.3-32 32-32zM480 96l0 224c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-224c0-17.7 14.3-32 32-32s32 14.3 32 32z"/></svg></div>
        <p style={{ fontSize: 20, fontWeight: 800, color: NAVY, marginBottom: 10 }}>No platform data yet</p>
        <p style={{ fontSize: 14, color: GRAY, marginBottom: 24, lineHeight: 1.7 }}>
          Run a scan to see which AI platforms — ChatGPT, Gemini, Perplexity, and 9 more — are recommending your business when customers search.
        </p>
        <Link href="/" className="btn btn-blue">
          Run my first scan <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
      </div>
    </div>
  );

  // b8a2: three honest groups — mentioned / responded-but-not-mentioned /
  // never responded. "Not appearing" used to fold the non-responders in.
  const mentionedCount = results.filter(r => r.mentioned).length;
  const notMentionedCount = results.filter(r => !r.mentioned && !!r.response_text).length;
  const noResponseCount = results.filter(r => !r.response_text).length;

  return (
    <div className={`${geistSans.variable} ${geistMono.variable}`} style={{ background: BG, minHeight: '100vh', padding: '28px 24px', fontFamily: "'var(--font-geist-sans)',ui-sans-serif,system-ui,sans-serif" }}>
      <style>{SHARED_STYLE}</style>

      {/* Header */}
      <div className="pagehead">
        <h1>AI Platform Results</h1>
        <p>{scanMeta
            ? <>Results for <strong>{coreBusinessName(scanMeta.business)}</strong> — from your scan of &ldquo;{scanMeta.input}&rdquo;{scanMeta.date ? <> on {scanMeta.date}</> : null} (your latest scan)</>
            : 'What each AI platform says about your business right now'}</p>
      </div>

      {/* Summary row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { l: 'Platforms tracked',   v: results.length, c: BLUE  },
          { l: 'Platforms mentioned', v: mentionedCount,  c: GREEN },
          { l: 'Not mentioned',       v: notMentionedCount, c: RED },
          { l: 'No response',         v: noResponseCount, c: GRAY },
        ].map((s, i) => (
          <div key={i} className="card dash-card" style={{ padding: '16px 14px', textAlign: 'center' }}>
            <p style={{ fontSize: 28, fontWeight: 900, color: s.c, marginBottom: 4 }}>{s.v}</p>
            <p style={{ fontSize: 12, color: GRAY }}>{s.l}</p>
          </div>
        ))}
      </div>

      {/* Platform cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(440px,1fr))', gap: 14 }}>
        {results.map((r, i) => {
          const responded = !!r.response_text;
          const truncated = responded ? r.response_text!.slice(0, 200) + (r.response_text!.length > 200 ? '…' : '') : null;

          return (
            <div key={i} className="card dash-card" style={{ padding: '20px' }}>

              {/* Platform header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14, color: NAVY }}>
                <PlatformBadge platform={r.platform} mentioned={r.mentioned} responded={responded} />
                {r.weight != null && <span style={{ fontSize: 11, color: LGRAY, whiteSpace: 'nowrap' }}>Scoring weight: {Math.round(r.weight * 100)}%</span>}
              </div>

              {/* Response text — b8a2: a non-response is not a quote; it is
                  no longer rendered in italics inside quotation marks. */}
              <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>What {r.platform} says right now</p>
                {truncated
                  ? <p style={{ fontSize: 13, color: GRAY, lineHeight: 1.65, fontStyle: 'italic' }}>"{truncated}"</p>
                  : <p style={{ fontSize: 13, color: GRAY, lineHeight: 1.65 }}>No response recorded from this platform in this scan.</p>}
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
}
