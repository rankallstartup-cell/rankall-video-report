'use client';

import { useEffect, useState } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';
import Link from 'next/link';
import { getBrowserClient } from '@/lib/supabase';
import { isBusinessPlan } from '@/lib/planConfig';
import { usePlan } from '@/lib/usePlan';

const supabase = getBrowserClient();

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

const BG     = '#F6F6FB';
const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#E7E7F0';
const GRAY   = '#55556A';
const LGRAY  = '#94A3B8';
const BLUE   = '#1B17FF';
const GREEN  = '#12A150';
const GREEN_BG = '#E3F6EC';
const AMBER  = '#D97706';
const RED    = '#B4232A';
const RED_BG = '#FDECEC';
const PURPLE = '#7C3AED'; // page accent (type selector, best-practices panel) — kept from staging

type ContentType =
  | 'live_scan'
  | 'competitor_reveal'
  | 'ai_education'
  | 'fix_breakdown'
  | 'case_study'
  | 'founder_story';

type Platform = 'tiktok' | 'reels' | 'shorts' | 'linkedin';

type Generated = {
  id: string | null;
  contentType: ContentType;
  hook: string;
  script: string;
  captions: string;
  shot_list: string;
  cta: string;
  hashtags: string[];
};

type ContentPiece = {
  id: string;
  user_id: string;
  content_type: string;
  format: string | null;
  platform: string | null;
  hook: string | null;
  script: string | null;
  captions: string | null;
  shot_list: string | null;
  cta: string | null;
  hashtags: string[] | null;
  scan_id: string | null;
  status: string;
  created_at: string;
};

const TYPES: { key: ContentType; emoji: React.ReactNode; label: string; desc: string; disclaimer?: string }[] = [
  { key: 'live_scan',         emoji: <svg viewBox="0 0 512 512" width="20" height="20" fill="#EF4444" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512z"/></svg>, label: 'Live Scan',         desc: 'Scan a real business on camera' },
  { key: 'competitor_reveal', emoji: <svg viewBox="0 0 640 512" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M384 32l128 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L398.4 96c-5.2 25.8-22.9 47.1-46.4 57.3L352 448l160 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-192 0-192 0c-17.7 0-32-14.3-32-32s14.3-32 32-32l160 0 0-294.7c-23.5-10.3-41.2-31.6-46.4-57.3L128 96c-17.7 0-32-14.3-32-32s14.3-32 32-32l128 0c14.6-19.4 37.8-32 64-32s49.4 12.6 64 32zm55.6 288l144.9 0L512 195.8 439.6 320zM512 416c-62.9 0-115.2-34-126-78.9c-2.6-11 1-22.3 6.7-32.1l95.2-163.2c5-8.6 14.2-13.8 24.1-13.8s19.1 5.3 24.1 13.8l95.2 163.2c5.7 9.8 9.3 21.1 6.7 32.1C627.2 382 574.9 416 512 416zM126.8 195.8L54.4 320l144.9 0L126.8 195.8zM.9 337.1c-2.6-11 1-22.3 6.7-32.1l95.2-163.2c5-8.6 14.2-13.8 24.1-13.8s19.1 5.3 24.1 13.8l95.2 163.2c5.7 9.8 9.3 21.1 6.7 32.1C242 382 189.7 416 126.8 416S11.7 382 .9 337.1z"/></svg>, label: 'Competitor Reveal', desc: 'Why AI picks one business over another' },
  { key: 'ai_education',      emoji: <svg viewBox="0 0 640 512" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M320 32c-8.1 0-16.1 1.4-23.7 4.1L15.8 137.4C6.3 140.9 0 149.9 0 160s6.3 19.1 15.8 22.6l57.9 20.9C57.3 229.3 48 259.8 48 291.9l0 28.1c0 28.4-10.8 57.7-22.3 80.8c-6.5 13-13.9 25.8-22.5 37.6C0 442.7-.9 448.3 .9 453.4s6 8.9 11.2 10.2l64 16c4.2 1.1 8.7 .3 12.4-2s6.3-6.1 7.1-10.4c8.6-42.8 4.3-81.2-2.1-108.7C90.3 344.3 86 329.8 80 316.5l0-24.6c0-30.2 10.2-58.7 27.9-81.5c12.9-15.5 29.6-28 49.2-35.7l157-61.7c8.2-3.2 17.5 .8 20.7 9s-.8 17.5-9 20.7l-157 61.7c-12.4 4.9-23.3 12.4-32.2 21.6l159.6 57.6c7.6 2.7 15.6 4.1 23.7 4.1s16.1-1.4 23.7-4.1L624.2 182.6c9.5-3.4 15.8-12.5 15.8-22.6s-6.3-19.1-15.8-22.6L343.7 36.1C336.1 33.4 328.1 32 320 32zM128 408c0 35.3 86 72 192 72s192-36.7 192-72L496.7 262.6 354.5 314c-11.1 4-22.8 6-34.5 6s-23.5-2-34.5-6L143.3 262.6 128 408z"/></svg>, label: 'AI Education',      desc: 'Teach how AI visibility works' },
  { key: 'fix_breakdown',     emoji: <svg viewBox="0 0 512 512" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M352 320c88.4 0 160-71.6 160-160c0-15.3-2.2-30.1-6.2-44.2c-3.1-10.8-16.4-13.2-24.3-5.3l-76.8 76.8c-3 3-7.1 4.7-11.3 4.7L336 192c-8.8 0-16-7.2-16-16l0-57.4c0-4.2 1.7-8.3 4.7-11.3l76.8-76.8c7.9-7.9 5.4-21.2-5.3-24.3C382.1 2.2 367.3 0 352 0C263.6 0 192 71.6 192 160c0 19.1 3.4 37.5 9.5 54.5L19.9 396.1C7.2 408.8 0 426.1 0 444.1C0 481.6 30.4 512 67.9 512c18 0 35.3-7.2 48-19.9L297.5 310.5c17 6.2 35.4 9.5 54.5 9.5zM80 408a24 24 0 1 1 0 48 24 24 0 1 1 0-48z"/></svg>, label: 'Fix Breakdown',     desc: 'Walk through one concrete fix' },
  { key: 'case_study',        emoji: <svg viewBox="0 0 512 512" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M32 32c17.7 0 32 14.3 32 32l0 336c0 8.8 7.2 16 16 16l400 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L80 480c-44.2 0-80-35.8-80-80L0 64C0 46.3 14.3 32 32 32zM160 224c17.7 0 32 14.3 32 32l0 64c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32zm128-64l0 160c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-160c0-17.7 14.3-32 32-32s32 14.3 32 32zm64 32c17.7 0 32 14.3 32 32l0 96c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-96c0-17.7 14.3-32 32-32zM480 96l0 224c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-224c0-17.7 14.3-32 32-32s32 14.3 32 32z"/></svg>, label: 'Case Study',        desc: 'Anonymized, illustrative pattern', disclaimer: 'Must be illustrative & anonymized — no real customers, no invented numbers.' },
  { key: 'founder_story',     emoji: <svg viewBox="0 0 384 512" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M192 0C139 0 96 43 96 96l0 160c0 53 43 96 96 96s96-43 96-96l0-160c0-53-43-96-96-96zM64 216c0-13.3-10.7-24-24-24s-24 10.7-24 24l0 40c0 89.1 66.2 162.7 152 174.4l0 33.6-48 0c-13.3 0-24 10.7-24 24s10.7 24 24 24l72 0 72 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-48 0 0-33.6c85.8-11.7 152-85.3 152-174.4l0-40c0-13.3-10.7-24-24-24s-24 10.7-24 24l0 40c0 70.7-57.3 128-128 128s-128-57.3-128-128l0-40z"/></svg>, label: 'Founder Story',     desc: 'Why Rankall exists' },
];

const TYPE_META: Record<string, { emoji: React.ReactNode; label: string }> = Object.fromEntries(
  TYPES.map(t => [t.key, { emoji: t.emoji, label: t.label }]),
);

const PLATFORMS: { key: Platform; label: string }[] = [
  { key: 'tiktok',   label: 'TikTok' },
  { key: 'reels',    label: 'Reels' },
  { key: 'shorts',   label: 'Shorts' },
  { key: 'linkedin', label: 'LinkedIn' },
];

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  draft:    { label: 'Draft',    bg: '#F1F5F9', color: GRAY  },
  scripted: { label: 'Scripted', bg: '#ECEBFF', color: BLUE  },
  filmed:   { label: 'Filmed',   bg: '#FFFBEB', color: AMBER },
  posted:   { label: 'Posted',   bg: GREEN_BG, color: GREEN },
};
const STATUS_OPTIONS = ['draft', 'scripted', 'filmed', 'posted'];

const SHARED_STYLE = `
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
  .pagehead{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}
  @media (max-width:639px){
    .pagehead{flex-direction:column;align-items:stretch}
    .card{padding:18px}
  }
  @media (prefers-reduced-motion:reduce){*{animation:none!important}}
`;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <button
      onClick={async () => {
        setFailed(false);
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Don't claim "Copied!" — say the copy failed so the user can do it manually.
          setFailed(true);
        }
      }}
      style={{ background: copied ? GREEN_BG : W, color: copied ? GREEN : BLUE, border: `1.5px solid ${copied ? GREEN : BORDER}`, borderRadius: 10, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
    >
      {copied ? (<><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>{' '}Copied!</>) : failed ? 'Copy failed — select manually' : 'Copy'}
    </button>
  );
}

function Field({ title, body }: { title: string; body: string }) {
  if (!body) return null;
  return (
    <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: NAVY, letterSpacing: '0.05em', marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, color: NAVY, whiteSpace: 'pre-wrap', lineHeight: 1.5, marginBottom: 10 }}>{body}</div>
      <CopyButton text={body} />
    </div>
  );
}

export default function ContentStudioPage() {
  const { plan, rawPlan, loading: planLoading, userId } = usePlan();
  const [genError, setGenError] = useState<string | null>(null);

  const [selected, setSelected] = useState<ContentType>('live_scan');
  const [businessName, setBusinessName] = useState('');
  const [industry, setIndustry] = useState('');
  const [city, setCity] = useState('');
  const [score, setScore] = useState('');
  const [platform, setPlatform] = useState<Platform>('tiktok');

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<Generated | null>(null);

  const [library, setLibrary] = useState<ContentPiece[]>([]);
  const [libLoading, setLibLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  async function loadLibrary(uid: string) {
    setLibLoading(true);
    try {
      const { data } = await supabase
        .from('content_pieces')
        .select()
        .eq('user_id', uid)
        .order('created_at', { ascending: false });
      setLibrary((data as ContentPiece[]) || []);
    } catch {
      setLibrary([]);
    }
    setLibLoading(false);
  }

  useEffect(() => {
    if (userId) loadLibrary(userId);
  }, [userId]);

  async function generate() {
    if (!userId) return;
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch('/api/content/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userId,
          contentType: selected,
          businessName: businessName.trim() || undefined,
          industry: industry.trim() || undefined,
          city: city.trim() || undefined,
          score: score.trim() ? Number(score) : undefined,
          platform,
        }),
      });
      const data = await res.json();
      // b89q: failures used to be swallowed silently (the button just
      // stopped spinning). A 403 is the plan gate; anything else is a
      // generation failure — both are said out loud.
      if (!res.ok) {
        setGenError(res.status === 403
          ? 'Content Studio is available on Business plan and above.'
          : 'Generation failed — please try again.');
        setGenerating(false);
        return;
      }
      if (data && data.hook) {
        setResult({
          id: data.id ?? null,
          contentType: data.contentType,
          hook: data.hook,
          script: data.script,
          captions: data.captions,
          shot_list: data.shot_list,
          cta: data.cta,
          hashtags: Array.isArray(data.hashtags) ? data.hashtags : [],
        });
        await loadLibrary(userId);
      }
    } catch {
      setGenError('Generation failed — please check your connection and try again.');
    }
    setGenerating(false);
  }

  async function updateStatus(id: string, status: string) {
    if (!userId) return;
    setStatusError(null);
    try {
      // Scope the update to this user — the old query relied entirely on RLS
      // and applied the new status locally even when the write failed.
      const { error } = await supabase
        .from('content_pieces')
        .update({ status })
        .eq('id', id)
        .eq('user_id', userId);
      if (error) {
        setStatusError('Could not save that status. Please try again.');
        return;
      }
      setLibrary(prev => prev.map(p => p.id === id ? { ...p, status } : p));
    } catch {
      setStatusError('Could not save that status. Please check your connection and try again.');
    }
  }

  // ── Plan gate ──
  if (planLoading) {
    return <div className={`${geistSans.variable} ${geistMono.variable}`} style={{ padding: 40, color: GRAY, fontFamily: 'var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif' }}>Loading…</div>;
  }

  // b89q: the sign-in gate comes BEFORE the plan gate — logged-out
  // visitors previously got the "Business plan and above" paywall
  // card, the wrong message for someone who is simply signed out.
  if (!userId) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>Sign in to use Content Studio.</p>
        <p style={{ fontSize: 13, color: GRAY, margin: '0 0 16px' }}>Scripts for educational short-form video about AI visibility.</p>
        <Link href="/login?next=/dashboard/content" style={{ color: BLUE, fontWeight: 700, fontSize: 14 }}>Sign in</Link>
      </div>
    );
  }

  if (!isBusinessPlan(plan)) {
    return (
      <div className={`${geistSans.variable} ${geistMono.variable}`} style={{ minHeight: '100vh', background: BG, padding: '60px 24px', fontFamily: 'var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif' }}>
        <style>{SHARED_STYLE}</style>
        <div className="card dash-card" style={{ maxWidth: 520, margin: '0 auto', padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}><svg viewBox="0 0 512 512" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M448 32l-86.1 0-1 1-127 127 92.1 0 1-1L453.8 32.3c-1.9-.2-3.8-.3-5.8-.3zm64 128l0-64c0-15.1-5.3-29.1-14-40l-104 104L512 160zM294.1 32l-92.1 0-1 1L73.9 160l92.1 0 1-1 127-127zM64 32C28.7 32 0 60.7 0 96l0 64 6.1 0 1-1 127-127L64 32zM512 192L0 192 0 416c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-224z"/></svg></div>
          <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.035em', color: NAVY, marginBottom: 10 }}>Content Studio</h1>
          <p style={{ color: GRAY, fontSize: 15, marginBottom: 24, lineHeight: 1.5 }}>
            Content Studio is available on Business plan and above.
          </p>
          <Link href="/pricing" className="btn btn-blue" style={{ textDecoration: 'none' }}>
            Upgrade <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
        </div>
      </div>
    );
  }

  const inputStyle = { width: '100%', boxSizing: 'border-box' as const, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: '9px 12px', fontSize: 13, color: NAVY, marginTop: 4 };
  const labelStyle = { fontSize: 12, fontWeight: 700, color: GRAY };
  const selectedMeta = TYPES.find(t => t.key === selected);

  return (
    <div className={`${geistSans.variable} ${geistMono.variable}`} style={{ minHeight: '100vh', background: BG, padding: '28px 24px', fontFamily: 'var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif' }}>
      <style>{SHARED_STYLE}</style>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        {plan !== rawPlan && (
          <div style={{ background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 12, padding: '10px 16px', marginBottom: 20 }}>
            <p style={{ fontSize: 12, color: '#92400E', fontWeight: 600, margin: 0 }}>
              Admin view — your account plan is {rawPlan}; Content Studio is gated to Business plans and above for customers.
            </p>
          </div>
        )}

        {/* Header */}
        <header className="pagehead" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.035em', color: NAVY, margin: 0 }}><svg viewBox="0 0 512 512" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M448 32l-86.1 0-1 1-127 127 92.1 0 1-1L453.8 32.3c-1.9-.2-3.8-.3-5.8-.3zm64 128l0-64c0-15.1-5.3-29.1-14-40l-104 104L512 160zM294.1 32l-92.1 0-1 1L73.9 160l92.1 0 1-1 127-127zM64 32C28.7 32 0 60.7 0 96l0 64 6.1 0 1-1 127-127L64 32zM512 192L0 192 0 416c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-224z"/></svg> Content Studio</h1>
          <p style={{ color: GRAY, fontSize: 14, margin: '6px 0 0' }}>
            Scripts for educational short-form video (TikTok / Reels / Shorts) about AI visibility.
          </p>
          </div>
        </header>

        {/* Honesty note */}
        <div className="dash-card" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 16, padding: '14px 18px', marginBottom: 24 }}>
          <div style={{ fontSize: 13, color: '#92400E', fontWeight: 600, lineHeight: 1.5 }}>
            <svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg> Educational only. No fake claims, no fake customers, no invented metrics or results. The score you scan is real — present it as it is.
          </div>
        </div>

        {/* Type selector */}
        <h2 style={{ fontSize: 13, fontWeight: 800, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>Pick a content type</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12, marginBottom: 20 }}>
          {TYPES.map(t => {
            const active = selected === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setSelected(t.key)}
                className="dash-card" style={{ textAlign: 'left', background: active ? '#F4F3FF' : W, border: `2px solid ${active ? PURPLE : BORDER}`, borderRadius: 16, padding: 16, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <div style={{ fontSize: 22, marginBottom: 6 }}>{t.emoji}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: NAVY }}>{t.label}</div>
                <div style={{ fontSize: 12, color: GRAY, marginTop: 4, lineHeight: 1.4 }}>{t.desc}</div>
                {t.disclaimer && (
                  <div style={{ fontSize: 11, color: RED, marginTop: 8, lineHeight: 1.4, fontWeight: 600 }}><svg viewBox="0 0 512 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg> {t.disclaimer}</div>
                )}
              </button>
            );
          })}
        </div>

        {/* Context inputs */}
        <div className="card dash-card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 13, fontWeight: 800, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 14px' }}>
            Optional context <span style={{ color: LGRAY, fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>(leave blank if not relevant)</span>
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <label style={labelStyle}>Business name<input value={businessName} onChange={e => setBusinessName(e.target.value)} style={inputStyle} /></label>
            <label style={labelStyle}>Industry<input value={industry} onChange={e => setIndustry(e.target.value)} style={inputStyle} /></label>
            <label style={labelStyle}>City<input value={city} onChange={e => setCity(e.target.value)} style={inputStyle} /></label>
            <label style={labelStyle}>AI score<input type="number" value={score} onChange={e => setScore(e.target.value)} style={inputStyle} /></label>
            <label style={labelStyle}>Platform
              <select value={platform} onChange={e => setPlatform(e.target.value as Platform)} style={inputStyle}>
                {PLATFORMS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </label>
          </div>
          <button
            onClick={generate}
            disabled={generating}
            className="btn btn-blue" style={{ marginTop: 18, cursor: generating ? 'default' : 'pointer', opacity: generating ? 0.7 : 1 }}
          >
            {generating ? 'Generating…' : (<><svg viewBox="0 0 576 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M234.7 42.7L197 56.8c-3 1.1-5 4-5 7.2s2 6.1 5 7.2l37.7 14.1L248.8 123c1.1 3 4 5 7.2 5s6.1-2 7.2-5l14.1-37.7L315 71.2c3-1.1 5-4 5-7.2s-2-6.1-5-7.2L277.3 42.7 263.2 5c-1.1-3-4-5-7.2-5s-6.1 2-7.2 5L234.7 42.7zM46.1 395.4c-18.7 18.7-18.7 49.1 0 67.9l34.6 34.6c18.7 18.7 49.1 18.7 67.9 0L529.9 116.5c18.7-18.7 18.7-49.1 0-67.9L495.3 14.1c-18.7-18.7-49.1-18.7-67.9 0L46.1 395.4zM484.6 82.6l-105 105-23.3-23.3 105-105 23.3 23.3zM7.5 117.2C3 118.9 0 123.2 0 128s3 9.1 7.5 10.8L64 160l21.2 56.5c1.7 4.5 6 7.5 10.8 7.5s9.1-3 10.8-7.5L128 160l56.5-21.2c4.5-1.7 7.5-6 7.5-10.8s-3-9.1-7.5-10.8L128 96 106.8 39.5C105.1 35 100.8 32 96 32s-9.1 3-10.8 7.5L64 96 7.5 117.2zm352 256c-4.5 1.7-7.5 6-7.5 10.8s3 9.1 7.5 10.8L416 416l21.2 56.5c1.7 4.5 6 7.5 10.8 7.5s9.1-3 10.8-7.5L480 416l56.5-21.2c4.5-1.7 7.5-6 7.5-10.8s-3-9.1-7.5-10.8L480 352l-21.2-56.5c-1.7-4.5-6-7.5-10.8-7.5s-9.1 3-10.8 7.5L416 352l-56.5 21.2z"/></svg> Generate {selectedMeta?.label || ''} script</>)}
          </button>
          {genError && (
            <p style={{ fontSize: 13, color: RED, fontWeight: 600, margin: '12px 0 0' }}>{genError}</p>
          )}
        </div>

        {/* Generated content */}
        {result && (
          <div className="card dash-card" style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: NAVY }}>
                {TYPE_META[result.contentType]?.emoji} {TYPE_META[result.contentType]?.label || result.contentType}
              </div>
              <button
                onClick={generate}
                disabled={generating}
                className="btn btn-line" style={{ fontSize: 13, cursor: generating ? 'default' : 'pointer', opacity: generating ? 0.7 : 1 }}
              >
                {generating ? 'Regenerating…' : (<><svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M105.1 202.6c7.7-21.8 20.2-42.3 37.8-59.8c62.5-62.5 163.8-62.5 226.3 0L386.3 160 352 160c-17.7 0-32 14.3-32 32s14.3 32 32 32l111.5 0c0 0 0 0 0 0l.4 0c17.7 0 32-14.3 32-32l0-112c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 35.2L414.4 97.6c-87.5-87.5-229.3-87.5-316.8 0C73.2 122 55.6 150.7 44.8 181.4c-5.9 16.7 2.9 34.9 19.5 40.8s34.9-2.9 40.8-19.5zM39 289.3c-5 1.5-9.8 4.2-13.7 8.2c-4 4-6.7 8.8-8.1 14c-.3 1.2-.6 2.5-.8 3.8c-.3 1.7-.4 3.4-.4 5.1L16 432c0 17.7 14.3 32 32 32s32-14.3 32-32l0-35.1 17.6 17.5c0 0 0 0 0 0c87.5 87.4 229.3 87.4 316.7 0c24.4-24.4 42.1-53.1 52.9-83.8c5.9-16.7-2.9-34.9-19.5-40.8s-34.9 2.9-40.8 19.5c-7.7 21.8-20.2 42.3-37.8 59.8c-62.5 62.5-163.8 62.5-226.3 0l-.1-.1L125.6 352l34.4 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L48.4 288c-1.6 0-3.2 .1-4.8 .3s-3.1 .5-4.6 1z"/></svg>{' '}Regenerate</>)}
              </button>
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              <Field title="HOOK (first 3 seconds)" body={result.hook} />
              <Field title="SCRIPT" body={result.script} />
              <Field title="CAPTIONS" body={result.captions} />
              <Field title="SHOT LIST" body={result.shot_list} />
              <Field title="CTA" body={result.cta} />
              {result.hashtags.length > 0 && (
                <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: NAVY, letterSpacing: '0.05em', marginBottom: 8 }}>HASHTAGS</div>
                  <div style={{ fontSize: 13, color: BLUE, lineHeight: 1.6, marginBottom: 10 }}>{result.hashtags.join(' ')}</div>
                  <CopyButton text={result.hashtags.join(' ')} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Library */}
        <h2 style={{ fontSize: 13, fontWeight: 800, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>Content Library</h2>
        {statusError && (
          <p style={{ fontSize: 13, color: RED, background: RED_BG, border: '1.5px solid #FECACA', borderRadius: 10, padding: '10px 14px', margin: '0 0 12px' }}>{statusError}</p>
        )}
        {libLoading ? (
          <p style={{ color: GRAY, fontSize: 14 }}>Loading library…</p>
        ) : library.length === 0 ? (
          <div className="dash-card" style={{ background: W, border: `1px dashed ${BORDER}`, borderRadius: 16, padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}><svg viewBox="0 0 512 512" width="28" height="28" fill="currentColor" aria-hidden="true"><path d="M448 32l-86.1 0-1 1-127 127 92.1 0 1-1L453.8 32.3c-1.9-.2-3.8-.3-5.8-.3zm64 128l0-64c0-15.1-5.3-29.1-14-40l-104 104L512 160zM294.1 32l-92.1 0-1 1L73.9 160l92.1 0 1-1 127-127zM64 32C28.7 32 0 60.7 0 96l0 64 6.1 0 1-1 127-127L64 32zM512 192L0 192 0 416c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-224z"/></svg></div>
            <p style={{ color: GRAY, fontSize: 14, fontWeight: 600 }}>No content yet — generate your first script above.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12, marginBottom: 28 }}>
            {library.map(p => {
              const meta = TYPE_META[p.content_type];
              const badge = STATUS_META[p.status] || STATUS_META.draft;
              return (
                <div key={p.id} className="card dash-card" style={{ padding: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 11, color: LGRAY, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {meta ? (<>{meta.emoji} {meta.label}</>) : p.content_type}{p.platform ? ` · ${p.platform}` : ''}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginTop: 4, lineHeight: 1.4 }}>
                        {p.hook ? (p.hook.length > 120 ? `${p.hook.slice(0, 120)}…` : p.hook) : '(no hook)'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ background: badge.bg, color: badge.color, borderRadius: 100, padding: '4px 12px', fontSize: 12, fontWeight: 700 }}>{badge.label}</span>
                      <select
                        value={STATUS_OPTIONS.includes(p.status) ? p.status : 'draft'}
                        onChange={e => updateStatus(p.id, e.target.value)}
                        style={{ border: `1.5px solid ${BORDER}`, borderRadius: 8, padding: '6px 8px', fontSize: 12, fontWeight: 700, color: NAVY, cursor: 'pointer' }}
                      >
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Best practices */}
        <div className="card dash-card" style={{ background: '#F4F3FF', border: '1px solid #DDD6FE', padding: '20px 22px', marginTop: 8 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: PURPLE, margin: '0 0 12px' }}>Short-Form Best Practices</h3>
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
            <li style={{ fontSize: 13, color: NAVY }}><svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M349.4 44.6c5.9-13.7 1.5-29.7-10.6-38.5s-28.6-8-39.9 1.8l-256 224c-10 8.8-13.6 22.9-8.9 35.3S50.7 288 64 288l111.5 0L98.6 467.4c-5.9 13.7-1.5 29.7 10.6 38.5s28.6 8 39.9-1.8l256-224c10-8.8 13.6-22.9 8.9-35.3s-16.6-20.7-30-20.7l-111.5 0L349.4 44.6z"/></svg> Hook in the first 3 seconds — say the payoff up front</li>
            <li style={{ fontSize: 13, color: NAVY }}><svg viewBox="0 0 384 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M16 64C16 28.7 44.7 0 80 0L304 0c35.3 0 64 28.7 64 64l0 384c0 35.3-28.7 64-64 64L80 512c-35.3 0-64-28.7-64-64L16 64zM224 448a32 32 0 1 0 -64 0 32 32 0 1 0 64 0zM304 64L80 64l0 320 224 0 0-320z"/></svg> Shoot vertical 9:16, fill the frame</li>
            <li style={{ fontSize: 13, color: NAVY }}><svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M512 240c0 114.9-114.6 208-256 208c-37.1 0-72.3-6.4-104.1-17.9c-11.9 8.7-31.3 20.6-54.3 30.6C73.6 471.1 44.7 480 16 480c-6.5 0-12.3-3.9-14.8-9.9c-2.5-6-1.1-12.8 3.4-17.4c0 0 0 0 0 0s0 0 0 0s0 0 0 0c0 0 0 0 0 0l.3-.3c.3-.3 .7-.7 1.3-1.4c1.1-1.2 2.8-3.1 4.9-5.7c4.1-5 9.6-12.4 15.2-21.6c10-16.6 19.5-38.4 21.4-62.9C17.7 326.8 0 285.1 0 240C0 125.1 114.6 32 256 32s256 93.1 256 208z"/></svg> Burn in captions — most people watch on mute</li>
            <li style={{ fontSize: 13, color: NAVY }}><svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M128 0c17.7 0 32 14.3 32 32l0 32 128 0 0-32c0-17.7 14.3-32 32-32s32 14.3 32 32l0 32 48 0c26.5 0 48 21.5 48 48l0 48L0 160l0-48C0 85.5 21.5 64 48 64l48 0 0-32c0-17.7 14.3-32 32-32zM0 192l448 0 0 272c0 26.5-21.5 48-48 48L48 512c-26.5 0-48-21.5-48-48L0 192zm64 80l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0c-8.8 0-16 7.2-16 16zm128 0l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0c-8.8 0-16 7.2-16 16zm144-16c-8.8 0-16 7.2-16 16l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0zM64 400l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0c-8.8 0-16 7.2-16 16zm144-16c-8.8 0-16 7.2-16 16l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0zm112 16l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0c-8.8 0-16 7.2-16 16z"/></svg> Post consistently — volume beats perfection</li>
            <li style={{ fontSize: 13, color: NAVY }}><svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM164.1 325.5C182 346.2 212.6 368 256 368s74-21.8 91.9-42.5c5.8-6.7 15.9-7.4 22.6-1.6s7.4 15.9 1.6 22.6C349.8 372.1 311.1 400 256 400s-93.8-27.9-116.1-53.5c-5.8-6.7-5.1-16.8 1.6-22.6s16.8-5.1 22.6 1.6zM144.4 208a32 32 0 1 1 64 0 32 32 0 1 1 -64 0zm192-32a32 32 0 1 1 0 64 32 32 0 1 1 0-64z"/></svg> Be authentic — talk like a person, not an ad</li>
            <li style={{ fontSize: 13, color: NAVY }}><svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M367.2 412.5L99.5 144.8C77.1 176.1 64 214.5 64 256c0 106 86 192 192 192c41.5 0 79.9-13.1 111.2-35.5zm45.3-45.3C434.9 335.9 448 297.5 448 256c0-106-86-192-192-192c-41.5 0-79.9 13.1-111.2 35.5L412.5 367.2zM0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256z"/></svg> No fake claims, no fake customers, no invented numbers</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
