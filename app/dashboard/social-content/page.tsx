'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getBrowserClient } from '@/lib/supabase';
import { usePlan } from '@/lib/usePlan';
import { normalizePlan, getPlanConfig } from '@/lib/planConfig';

const supabase = getBrowserClient();

// ── Dark theme palette (self-contained to this page) ──────────────────
const BG      = '#0B1120';
const CARD    = '#111827';
const CARD2   = '#0A0A14';
const BORDER  = '#1F2937';
const TEXT     = '#F1F5F9';
const SUBTLE  = '#94A3B8';
const FAINT   = '#64748B';
const BLUE    = '#1B17FF';

type Platform =
  | 'linkedin' | 'reddit' | 'twitter' | 'gbp'
  | 'facebook' | 'instagram' | 'email' | 'gbp_qa' | 'blog';

interface PlatformDef {
  key: Platform;
  name: string;
  icon: React.ReactNode;
  color: string;
  blurb: string;
  charLimit: number;
}

const PLATFORMS: PlatformDef[] = [
  { key: 'linkedin',  name: 'LinkedIn',       icon: <svg viewBox="0 0 512 512" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M184 48l144 0c4.4 0 8 3.6 8 8l0 40L176 96l0-40c0-4.4 3.6-8 8-8zm-56 8l0 40L64 96C28.7 96 0 124.7 0 160l0 96 192 0 128 0 192 0 0-96c0-35.3-28.7-64-64-64l-64 0 0-40c0-30.9-25.1-56-56-56L184 0c-30.9 0-56 25.1-56 56zM512 288l-192 0 0 32c0 17.7-14.3 32-32 32l-64 0c-17.7 0-32-14.3-32-32l0-32L0 288 0 416c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-128z"/></svg>, color: '#0077B5', blurb: 'Professional thought-leadership post', charLimit: 3000 },
  { key: 'reddit',    name: 'Reddit',         icon: '👽', color: '#FF4500', blurb: 'Authentic community contribution',     charLimit: 1000 },
  { key: 'twitter',   name: 'X (Twitter)',    icon: '𝕏', color: '#000000', blurb: 'Punchy, under-280-char tweet',        charLimit: 280 },
  { key: 'gbp',       name: 'Google Business', icon: <svg viewBox="0 0 384 512" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M215.7 499.2C267 435 384 279.4 384 192C384 86 298 0 192 0S0 86 0 192c0 87.4 117 243 168.3 307.2c12.3 15.3 35.1 15.3 47.4 0zM192 128a64 64 0 1 1 0 128 64 64 0 1 1 0-128z"/></svg>, color: '#4285F4', blurb: 'Google Business Profile update',      charLimit: 1500 },
  { key: 'facebook',  name: 'Facebook Post',  icon: <svg viewBox="0 0 576 512" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M249.6 471.5c10.8 3.8 22.4-4.1 22.4-15.5l0-377.4c0-4.2-1.6-8.4-5-11C247.4 52 202.4 32 144 32C93.5 32 46.3 45.3 18.1 56.1C6.8 60.5 0 71.7 0 83.8L0 454.1c0 11.9 12.8 20.2 24.1 16.5C55.6 460.1 105.5 448 144 448c33.9 0 79 14 105.6 23.5zm76.8 0C353 462 398.1 448 432 448c38.5 0 88.4 12.1 119.9 22.6c11.3 3.8 24.1-4.6 24.1-16.5l0-370.3c0-12.1-6.8-23.3-18.1-27.6C529.7 45.3 482.5 32 432 32c-58.4 0-103.4 20-123 35.6c-3.3 2.6-5 6.8-5 11L304 456c0 11.4 11.7 19.3 22.4 15.5z"/></svg>, color: '#1877F2', blurb: 'Community engagement post',            charLimit: 500 },
  { key: 'instagram', name: 'Instagram Caption', icon: <svg viewBox="0 0 512 512" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M149.1 64.8L138.7 96 64 96C28.7 96 0 124.7 0 160L0 416c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-256c0-35.3-28.7-64-64-64l-74.7 0L362.9 64.8C356.4 45.2 338.1 32 317.4 32L194.6 32c-20.7 0-39 13.2-45.5 32.8zM256 192a96 96 0 1 1 0 192 96 96 0 1 1 0-192z"/></svg>, color: '#E1306C', blurb: 'Visual content with hashtags',      charLimit: 150 },
  { key: 'email',     name: 'Email Newsletter', icon: <svg viewBox="0 0 512 512" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M48 64C21.5 64 0 85.5 0 112c0 15.1 7.1 29.3 19.2 38.4L236.8 313.6c11.4 8.5 27 8.5 38.4 0L492.8 150.4c12.1-9.1 19.2-23.3 19.2-38.4c0-26.5-21.5-48-48-48L48 64zM0 176L0 384c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-208L294.4 339.2c-22.8 17.1-54 17.1-76.8 0L0 176z"/></svg>, color: '#6B7280', blurb: 'Newsletter section with subject line', charLimit: 800 },
  { key: 'gbp_qa',    name: 'GBP Q&A',        icon: <svg viewBox="0 0 512 512" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM169.8 165.3c7.9-22.3 29.1-37.3 52.8-37.3l58.3 0c34.9 0 63.1 28.3 63.1 63.1c0 22.6-12.1 43.5-31.7 54.8L280 264.4c-.2 13-10.9 23.6-24 23.6c-13.3 0-24-10.7-24-24l0-13.5c0-8.6 4.6-16.5 12.1-20.8l44.3-25.4c4.7-2.7 7.6-7.7 7.6-13.1c0-8.4-6.8-15.1-15.1-15.1l-58.3 0c-3.4 0-6.4 2.1-7.5 5.3l-.4 1.2c-4.4 12.5-18.2 19-30.6 14.6s-19-18.2-14.6-30.6l.4-1.2zM224 352a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"/></svg>, color: '#4285F4', blurb: '5 customer Q&A pairs for Google',      charLimit: 1000 },
  { key: 'blog',      name: 'Blog Post Outline', icon: <svg viewBox="0 0 512 512" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M362.7 19.3L314.3 67.7 444.3 197.7l48.4-48.4c25-25 25-65.5 0-90.5L453.3 19.3c-25-25-65.5-25-90.5 0zm-71 71L58.6 323.5c-10.4 10.4-18 23.3-22.2 37.4L1 481.2C-1.5 489.7 .8 498.8 7 505s15.3 8.5 23.7 6.1l120.3-35.4c14.1-4.2 27-11.8 37.4-22.2L421.7 220.3 291.7 90.3z"/></svg>, color: '#F59E0B', blurb: 'SEO-optimized outline with headers', charLimit: 1500 },
];

interface ScanRow {
  overall_score: number | null;
  industry: string | null;
  location: string | null;
  user_business_name: string | null;
  input: string | null;
  competitor_name: string | null;
  country_code: string | null;
  created_at: string | null;
}

interface ScanData {
  score: number;
  industry: string;
  city: string;
  businessName: string;
  competitorName: string;
  competitorScore: number;
  countryCode: string;
  // b8ab: the strip's score was undated — a reader could not tell which
  // scan it came from without cross-checking /dashboard Overview.
  scanDate: string;
}

interface GeneratedState {
  content: string;
  characterCount: number;
  tips: string[];
}

export default function SocialContentPage() {
  const { plan, rawPlan, loading: planLoading } = usePlan();
  const normPlan = normalizePlan(plan);
  const isPersonal = normPlan === 'personal_pro';
  const isFree = !planLoading && normPlan === 'free';
  // b8ab: session awareness for the gate. Logged-out visitors used to hit
  // the PAID-plan upgrade gate ("Available on any paid plan") with no
  // login message at all — the page conflated "no user" with "Free user".
  // null = unknown (still checking); false = signed out -> sign-in gate.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  const [scanData, setScanData] = useState<ScanData | null>(null);
  const [scanLoading, setScanLoading] = useState(true);
  const [generating, setGenerating] = useState<Platform | null>(null);
  const [results, setResults] = useState<Partial<Record<Platform, GeneratedState>>>({});
  const [errors, setErrors] = useState<Partial<Record<Platform, string>>>({});
  const [copied, setCopied] = useState<Platform | null>(null);

  // GBP connection state (drives the Connect banner + Post-to-GBP button).
  const [gbp, setGbp] = useState<{ connected: boolean; pending: boolean; locationName?: string }>({ connected: false, pending: false });
  const [posting, setPosting] = useState(false);
  const [postMsg, setPostMsg] = useState<React.ReactNode>(null);

  // GA4 connection state (drives the top-of-page Analytics banner).
  const [ga4Connected, setGa4Connected] = useState(false);
  const [ga4PropertyName, setGa4PropertyName] = useState('');
  const [ga4Sessions, setGa4Sessions] = useState(0);
  const [ga4NoProperties, setGa4NoProperties] = useState(false);

  // Personal Brand users don't get the Google Business Profile generators.
  const visiblePlatforms = PLATFORMS.filter(p => (isPersonal ? p.key !== 'gbp' && p.key !== 'gbp_qa' : true));

  useEffect(() => {
    if (planLoading) return;
    let alive = true;
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { if (alive) { setSignedIn(false); setScanLoading(false); } return; }
        if (alive) setSignedIn(true);

        // Load the latest scan on the user's track — Personal Brand sees
        // personal_pro scans; every other plan excludes them (keeping NULLs).
        let q = supabase.from('rankall_scans').select('*').eq('user_id', session.user.id);
        q = isPersonal
          ? q.eq('intent_type', 'personal_pro')
          : q.or('intent_type.neq.personal_pro,intent_type.is.null');
        const { data } = await q.order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (!alive) return;
        const row = data as ScanRow | null;
        if (row) {
          setScanData({
            score: row.overall_score ?? 0,
            industry: row.industry ?? '',
            city: row.location ?? '',
            businessName: row.user_business_name ?? row.input ?? '',
            competitorName: row.competitor_name ?? '',
            competitorScore: 0,
            countryCode: row.country_code ?? '',
            scanDate: row.created_at ?? '',
          });
        }
      } catch { /* no scan — generators still work with defaults */ }
      if (alive) setScanLoading(false);
    }
    load();
    return () => { alive = false; };
  }, [planLoading, isPersonal]);

  // GBP connection status — only relevant when the GBP card is shown (not personal).
  useEffect(() => {
    if (isPersonal) return;
    let alive = true;
    fetch('/api/integrations/google-business-profile/status')
      .then(r => r.json())
      .then(d => { if (alive && d && !d.error) setGbp({ connected: !!d.connected, pending: !!d.pending, locationName: d.locationName }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [isPersonal]);

  // GA4 connection status. If connected, pull last-30-days sessions for the banner.
  useEffect(() => {
    let alive = true;
    fetch('/api/integrations/google-analytics/status')
      .then(r => r.json())
      .then(data => {
        if (!alive || !data || data.error) return;
        // "Connected but no property" (site_url === 'no_properties') → propertyName
        // is empty. Treat that as a distinct warning state, not a fresh connect.
        const hasProperty = !!data.propertyName;
        setGa4Connected(!!data.connected && hasProperty);
        setGa4NoProperties(!!data.connected && !hasProperty);
        setGa4PropertyName(data.propertyName || '');
        if (data.connected && hasProperty) {
          fetch('/api/integrations/google-analytics/data')
            .then(r => r.json())
            .then(d => { if (alive && d?.last30Days) setGa4Sessions(d.last30Days.sessions || 0); })
            .catch(() => {});
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  async function postToGbp(text: string) {
    setPosting(true);
    setPostMsg(null);
    try {
      const res = await fetch('/api/integrations/google-business-profile/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      const json = await res.json();
      if (json.success) setPostMsg(<><svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg> Posted to Google Business Profile</>);
      else if (json.pending) setPostMsg(<><svg viewBox="0 0 384 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M32 0C14.3 0 0 14.3 0 32S14.3 64 32 64l0 11c0 42.4 16.9 83.1 46.9 113.1L146.7 256 78.9 323.9C48.9 353.9 32 394.6 32 437l0 11c-17.7 0-32 14.3-32 32s14.3 32 32 32l32 0 256 0 32 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l0-11c0-42.4-16.9-83.1-46.9-113.1L237.3 256l67.9-67.9c30-30 46.9-70.7 46.9-113.1l0-11c17.7 0 32-14.3 32-32s-14.3-32-32-32L320 0 64 0 32 0zM96 75l0-11 192 0 0 11c0 19-5.6 37.4-16 53L112 128c-10.3-15.6-16-34-16-53zm16 309c3.5-5.3 7.6-10.3 12.1-14.9L192 301.3l67.9 67.9c4.6 4.6 8.6 9.6 12.1 14.9L112 384z"/></svg> {json.message}</>);
      else setPostMsg(<><svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg> {json.error || 'Could not post.'}</>);
    } catch {
      setPostMsg(<><svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg> Could not post — please try again.</>);
    } finally {
      setPosting(false);
    }
  }

  async function generate(platform: Platform) {
    setGenerating(platform);
    setErrors(e => ({ ...e, [platform]: undefined }));
    try {
      const res = await fetch('/api/social/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          entityType: isPersonal ? 'personal' : 'business',
          scanData: scanData ?? {},
        }),
      });
      const json = await res.json();
      if (res.status === 403) {
        // b8ab: the server-side plan gate — say so instead of a generic failure.
        setErrors(e => ({ ...e, [platform]: 'Social Content is available on paid plans — upgrade to generate.' }));
      } else if (!res.ok || json.error) {
        setErrors(e => ({ ...e, [platform]: 'Generation failed — please try again.' }));
      } else {
        setResults(r => ({ ...r, [platform]: { content: json.content, characterCount: json.characterCount, tips: json.tips || [] } }));
      }
    } catch {
      setErrors(e => ({ ...e, [platform]: 'Something went wrong — please try again.' }));
    } finally {
      setGenerating(null);
    }
  }

  async function copy(platform: Platform, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(platform);
      setTimeout(() => setCopied(c => (c === platform ? null : c)), 1800);
    } catch { /* clipboard unavailable */ }
  }

  // ── b8ab: signed-out visitors get a sign-in gate, not the paid-plan
  // upgrade gate (which made no sense to someone who has not logged in).
  if (signedIn === false) {
    return (
      <div style={{ minHeight: '100vh', background: BG, color: TEXT, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 440, textAlign: 'center', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '40px 32px' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 10px' }}>Social Content Generator</h1>
          <p style={{ fontSize: 14, color: SUBTLE, lineHeight: 1.6, margin: '0 0 24px' }}>
            Sign in to use the Social Content Generator. Your posts are tuned to your own visibility scan — sign in to see yours, or run a free scan to get your first score.
          </p>
          <Link href="/login?next=/dashboard/social-content" style={{ display: 'inline-block', background: BLUE, color: '#fff', fontWeight: 700, fontSize: 14, padding: '12px 28px', borderRadius: 10, textDecoration: 'none' }}>
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  // ── Free users: gate behind an upgrade prompt ───────────────────────
  if (isFree) {
    return (
      <div style={{ minHeight: '100vh', background: BG, color: TEXT, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 440, textAlign: 'center', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '40px 32px' }}>
          <div style={{ fontSize: 44, marginBottom: 16 }}><svg viewBox="0 0 384 512" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M16 64C16 28.7 44.7 0 80 0L304 0c35.3 0 64 28.7 64 64l0 384c0 35.3-28.7 64-64 64L80 512c-35.3 0-64-28.7-64-64L16 64zM224 448a32 32 0 1 0 -64 0 32 32 0 1 0 64 0zM304 64L80 64l0 320 224 0 0-320z"/></svg></div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 10px' }}>Social Content Generator</h1>
          <p style={{ fontSize: 14, color: SUBTLE, lineHeight: 1.6, margin: '0 0 24px' }}>
            Generate on-brand posts for LinkedIn, Reddit, X and Google Business — tuned to your AI visibility score. Available on any paid plan.
          </p>
          <Link href="/pricing" style={{ display: 'inline-block', background: BLUE, color: '#fff', fontWeight: 700, fontSize: 14, padding: '12px 28px', borderRadius: 10, textDecoration: 'none' }}>
            Upgrade to unlock <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, padding: '32px 24px 64px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 26 }}><svg viewBox="0 0 384 512" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M16 64C16 28.7 44.7 0 80 0L304 0c35.3 0 64 28.7 64 64l0 384c0 35.3-28.7 64-64 64L80 512c-35.3 0-64-28.7-64-64L16 64zM224 448a32 32 0 1 0 -64 0 32 32 0 1 0 64 0zM304 64L80 64l0 320 224 0 0-320z"/></svg></span>
            <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0, letterSpacing: '-0.02em' }}>Social Content Generator</h1>
          </div>
          <p style={{ fontSize: 14, color: SUBTLE, margin: 0, lineHeight: 1.6 }}>
            AI-written posts tuned to your latest visibility scan. Pick a platform, generate, tweak, and post.
          </p>
        </div>

        {/* b8ab: admin-view note. The gate reads the admin-upgraded plan,
            so an admin on a Free account sees the generator while a real
            Free account sees the upgrade gate — this note makes that
            visible instead of looking like a gate contradiction. */}
        {normalizePlan(plan) !== normalizePlan(rawPlan) && (
          <div style={{ background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '10px 16px', marginBottom: 24 }}>
            <p style={{ fontSize: 12, color: SUBTLE, margin: 0 }}>
              Admin view: this account&apos;s plan is {getPlanConfig(rawPlan).displayName} — Social Content is gated for {getPlanConfig(rawPlan).displayName} accounts. You see the generator because admins get full access.
            </p>
          </div>
        )}

        {/* GA4 connection banner — connect prompt only when there's no integration
            at all; a connected-but-no-property state gets its own warning. */}
        {!ga4Connected && !ga4NoProperties && (
          <div style={{ background: '#0f1629', border: '1px solid #374151', borderRadius: 12, padding: 16, marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ color: 'white', fontWeight: 600, margin: '0 0 4px', fontSize: 14 }}><svg viewBox="0 0 512 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M32 32c17.7 0 32 14.3 32 32l0 336c0 8.8 7.2 16 16 16l400 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L80 480c-44.2 0-80-35.8-80-80L0 64C0 46.3 14.3 32 32 32zM160 224c17.7 0 32 14.3 32 32l0 64c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32zm128-64l0 160c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-160c0-17.7 14.3-32 32-32s32 14.3 32 32zm64 32c17.7 0 32 14.3 32 32l0 96c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-96c0-17.7 14.3-32 32-32zM480 96l0 224c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-224c0-17.7 14.3-32 32-32s32 14.3 32 32z"/></svg> Connect Google Analytics</p>
              <p style={{ color: '#9ca3af', fontSize: 13, margin: 0 }}>See how your AI visibility improvements affect real website traffic</p>
            </div>
            <a href="/api/integrations/google-analytics?action=connect" style={{ background: '#4285f4', color: 'white', padding: '8px 16px', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', marginLeft: 16 }}>
              Connect GA4
            </a>
          </div>
        )}
        {ga4NoProperties && (
          <div style={{ background: '#0f1629', border: '1px solid #f59e0b', borderRadius: 12, padding: 16, marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <p style={{ color: '#f59e0b', fontWeight: 600, margin: '0 0 4px', fontSize: 14 }}><svg viewBox="0 0 512 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg> GA4 connected — but no property found</p>
              <p style={{ color: '#9ca3af', fontSize: 13, margin: 0 }}>Make sure you have a GA4 property at analytics.google.com, then reconnect.</p>
            </div>
            <a href="/api/integrations/google-analytics?action=connect" style={{ background: '#f59e0b', color: 'black', padding: '8px 16px', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', marginLeft: 16 }}>
              Reconnect GA4
            </a>
          </div>
        )}
        {ga4Connected && (
          <div style={{ background: '#0f1629', border: '1px solid #22c55e', borderRadius: 12, padding: 16, marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ color: '#22c55e', fontWeight: 600, margin: '0 0 4px', fontSize: 14 }}><svg viewBox="0 0 512 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg> Google Analytics Connected</p>
              <p style={{ color: '#9ca3af', fontSize: 13, margin: 0 }}>{ga4PropertyName} · Last 30 days: {ga4Sessions} sessions</p>
            </div>
            <a href="/api/integrations/google-analytics?action=connect" style={{ color: '#6b7280', fontSize: 12, textDecoration: 'none' }}>
              Reconnect
            </a>
          </div>
        )}

        {/* Scan context banner */}
        {!scanLoading && (
          <div style={{ background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '14px 18px', marginBottom: 24, display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center' }}>
            {scanData ? (
              <>
                <Ctx label="Score" value={`${scanData.score}/100`} />
                {scanData.businessName && <Ctx label={isPersonal ? 'Name' : 'Business'} value={scanData.businessName} />}
                {scanData.industry && <Ctx label="Industry" value={scanData.industry} />}
                {scanData.city && <Ctx label="Location" value={scanData.city} />}
                {scanData.scanDate && <Ctx label="Scan date" value={new Date(scanData.scanDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} />}
              </>
            ) : (
              <p style={{ fontSize: 13, color: FAINT, margin: 0 }}>
                No scan found yet — content will use general defaults. <Link href="/dashboard" style={{ color: BLUE, textDecoration: 'none' }}>Run a scan <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
              </p>
            )}
          </div>
        )}

        {/* 2×2 generator grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
          {visiblePlatforms.map(p => {
            const result = results[p.key];
            const isBusy = generating === p.key;
            const err = errors[p.key];
            return (
              <div key={p.key} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 22, display: 'flex', flexDirection: 'column' }}>
                {/* Card header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0, color: '#fff', fontWeight: 800 }}>
                    {p.icon}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{p.name}</p>
                    <p style={{ fontSize: 12, color: FAINT, margin: 0 }}>{p.blurb}</p>
                  </div>
                </div>

                {/* GBP connection banner */}
                {p.key === 'gbp' && (
                  <div style={{ background: '#1a1a2e', border: `1px solid ${BORDER}`, borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13, color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    {!gbp.connected ? (
                      <>
                        <span><svg viewBox="0 0 640 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M579.8 267.7c56.5-56.5 56.5-148 0-204.5c-50-50-128.8-56.5-186.3-15.4l-1.6 1.1c-14.4 10.3-17.7 30.3-7.4 44.6s30.3 17.7 44.6 7.4l1.6-1.1c32.1-22.9 76-19.3 103.8 8.6c31.5 31.5 31.5 82.5 0 114L422.3 334.8c-31.5 31.5-82.5 31.5-114 0c-27.9-27.9-31.5-71.8-8.6-103.8l1.1-1.6c10.3-14.4 6.9-34.4-7.4-44.6s-34.4-6.9-44.6 7.4l-1.1 1.6C206.5 251.2 213 330 263 380c56.5 56.5 148 56.5 204.5 0L579.8 267.7zM60.2 244.3c-56.5 56.5-56.5 148 0 204.5c50 50 128.8 56.5 186.3 15.4l1.6-1.1c14.4-10.3 17.7-30.3 7.4-44.6s-30.3-17.7-44.6-7.4l-1.6 1.1c-32.1 22.9-76 19.3-103.8-8.6C74 372 74 321 105.5 289.5L217.7 177.2c31.5-31.5 82.5-31.5 114 0c27.9 27.9 31.5 71.8 8.6 103.9l-1.1 1.6c-10.3 14.4-6.9 34.4 7.4 44.6s34.4 6.9 44.6-7.4l1.1-1.6C433.5 260.8 427 182 377 132c-56.5-56.5-148-56.5-204.5 0L60.2 244.3z"/></svg> Connect Google Business Profile to auto-post updates</span>
                        <a href="/api/integrations/google-business-profile?action=connect" style={{ background: '#4285f4', color: 'white', padding: '6px 12px', borderRadius: 6, textDecoration: 'none', fontSize: 12, whiteSpace: 'nowrap' }}>
                          Connect GBP
                        </a>
                      </>
                    ) : gbp.pending ? (
                      <span><svg viewBox="0 0 384 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M32 0C14.3 0 0 14.3 0 32S14.3 64 32 64l0 11c0 42.4 16.9 83.1 46.9 113.1L146.7 256 78.9 323.9C48.9 353.9 32 394.6 32 437l0 11c-17.7 0-32 14.3-32 32s14.3 32 32 32l32 0 256 0 32 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l0-11c0-42.4-16.9-83.1-46.9-113.1L237.3 256l67.9-67.9c30-30 46.9-70.7 46.9-113.1l0-11c17.7 0 32-14.3 32-32s-14.3-32-32-32L320 0 64 0 32 0zM96 75l0-11 192 0 0 11c0 19-5.6 37.4-16 53L112 128c-10.3-15.6-16-34-16-53zm16 309c3.5-5.3 7.6-10.3 12.1-14.9L192 301.3l67.9 67.9c4.6 4.6 8.6 9.6 12.1 14.9L112 384z"/></svg> Connected — awaiting Google API approval</span>
                    ) : (
                      <span><svg viewBox="0 0 512 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg> Connected to {gbp.locationName}</span>
                    )}
                  </div>
                )}

                {/* Generated content */}
                {result && (
                  <div style={{ background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
                    <p style={{ fontSize: 13.5, color: TEXT, whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: 0 }}>{result.content}</p>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, gap: 10 }}>
                      <span style={{ fontSize: 11, color: result.characterCount > p.charLimit ? '#F87171' : FAINT }}>{result.characterCount} / {p.charLimit} chars</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => copy(p.key, result.content)}
                          style={{ background: 'transparent', border: `1px solid ${BORDER}`, color: SUBTLE, fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 8, cursor: 'pointer' }}
                        >
                          {copied === p.key ? (<><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>{' '}Copied</>) : 'Copy'}
                        </button>
                        {p.key === 'gbp' && gbp.connected && !gbp.pending && (
                          <button
                            onClick={() => postToGbp(result.content)}
                            disabled={posting}
                            style={{ background: '#4285f4', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 8, cursor: posting ? 'default' : 'pointer', opacity: posting ? 0.7 : 1 }}
                          >
                            {posting ? 'Posting…' : 'Post to GBP'}
                          </button>
                        )}
                      </div>
                    </div>
                    {p.key === 'gbp' && postMsg && (
                      <p style={{ fontSize: 12, color: SUBTLE, margin: '10px 0 0' }}>{postMsg}</p>
                    )}
                    {p.key === 'twitter' && (
                      <p style={{ color: '#6b7280', fontSize: 11, margin: '8px 0 0', textAlign: 'center' }}>
                        <svg viewBox="0 0 512 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M362.7 19.3L314.3 67.7 444.3 197.7l48.4-48.4c25-25 25-65.5 0-90.5L453.3 19.3c-25-25-65.5-25-90.5 0zm-71 71L58.6 323.5c-10.4 10.4-18 23.3-22.2 37.4L1 481.2C-1.5 489.7 .8 498.8 7 505s15.3 8.5 23.7 6.1l120.3-35.4c14.1-4.2 27-11.8 37.4-22.2L421.7 220.3 291.7 90.3z"/></svg> Copy and post manually to X · Auto-post coming soon
                      </p>
                    )}
                    {p.key === 'linkedin' && (
                      <p style={{ color: '#6b7280', fontSize: 11, margin: '8px 0 0', textAlign: 'center' }}>
                        <svg viewBox="0 0 512 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M362.7 19.3L314.3 67.7 444.3 197.7l48.4-48.4c25-25 25-65.5 0-90.5L453.3 19.3c-25-25-65.5-25-90.5 0zm-71 71L58.6 323.5c-10.4 10.4-18 23.3-22.2 37.4L1 481.2C-1.5 489.7 .8 498.8 7 505s15.3 8.5 23.7 6.1l120.3-35.4c14.1-4.2 27-11.8 37.4-22.2L421.7 220.3 291.7 90.3z"/></svg> Copy and post manually to LinkedIn · Auto-post coming soon
                      </p>
                    )}
                  </div>
                )}

                {/* Tips */}
                {result && result.tips.length > 0 && (
                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px' }}>
                    {result.tips.map((t, i) => (
                      <li key={i} style={{ fontSize: 11.5, color: FAINT, lineHeight: 1.5, paddingLeft: 16, position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 0, color: p.color }}>›</span>{t}
                      </li>
                    ))}
                  </ul>
                )}

                {err && <p style={{ fontSize: 12, color: '#F87171', margin: '0 0 12px' }}>{err}</p>}

                {/* Generate button */}
                <button
                  onClick={() => generate(p.key)}
                  disabled={isBusy || scanLoading}
                  style={{
                    marginTop: 'auto',
                    background: isBusy ? BORDER : p.color,
                    color: '#fff', fontWeight: 700, fontSize: 13.5,
                    padding: '11px 16px', borderRadius: 10, border: 'none',
                    cursor: isBusy || scanLoading ? 'default' : 'pointer',
                    opacity: scanLoading ? 0.6 : 1,
                  }}
                >
                  {isBusy ? 'Generating…' : result ? `Regenerate ${p.name} post` : `Generate ${p.name} post`}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Ctx({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontSize: 13.5, fontWeight: 700, color: TEXT }}>{value}</span>
    </div>
  );
}
