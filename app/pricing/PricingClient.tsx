'use client';
// Pricing — V2 design

import Link from 'next/link';
import RiskReversal from '@/components/RiskReversal';
import { useState, useEffect } from 'react';
import type { CountryConfig } from '@/lib/countryConfig';
import type { ReactNode } from 'react';
import { getBrowserClient } from '@/lib/supabase';
import { TRUST_SIGNALS_LABEL, PRICE_LOCAL_USD, PRICE_AGENCY_USD, PRICE_PERSONAL_USD, tierPrice } from '@/lib/publicStats';
import { TRIAL_MAX_LOCATIONS, TRIAL_LIMITS } from '@/lib/trialCaps';
import { tierKeyFromParams, intervalFromParams, annualConfigured, INTENDED_INTERVAL_KEY } from '@/lib/pricingParams';

// V2 design tokens
const INK = '#0A0A14';
const BLUE = '#1B17FF';
const BODY = '#55556A';
const BG = '#F6F6FB';
const CARD = '#FFFFFF';
const BORDER = '#EDEDF4';
const DIM = '#8A8AA3';

// ax6z: annual totals are the config values (US), NOT monthly*12*0.8 — the
// formula matches US by coincidence but disagrees with other countries'
// config annuals (e.g. GB agency: formula 4502 vs config 3900).

interface Tier {
  key: string;
  name: string;
  emoji: ReactNode;
  monthly: number;
  annual: number; // ax6z: real annual total (US config), shown as $X/yr
  desc: string;
  badge?: string;
  cta: ReactNode;
  href: string;
  demoHref?: string; // b28m: secondary "Book a demo" path, alongside — never instead of — the trial CTA
  note: string;
  features: string[];
  featured?: boolean;
}

const LOCAL_TRACK: Tier[] = [
  {
    key: 'business',
    name: 'Local Business',
    emoji: <svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true" style={{ verticalAlign: 'middle' }}><path d="M32 32c17.7 0 32 14.3 32 32l0 336c0 8.8 7.2 16 16 16l400 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L80 480c-44.2 0-80-35.8-80-80L0 64C0 46.3 14.3 32 32 32zM160 224c17.7 0 32 14.3 32 32l0 64c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32zm128-64l0 160c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-160c0-17.7 14.3-32 32-32s32 14.3 32 32zm64 32c17.7 0 32 14.3 32 32l0 96c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-96c0-17.7 14.3-32 32-32zM480 96l0 224c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-224c0-17.7 14.3-32 32-32s32 14.3 32 32z"/></svg>,
    monthly: PRICE_LOCAL_USD,
    annual: 374,
    desc: 'Your AI visibility dashboard for local business growth',
    badge: 'MOST POPULAR',
    cta: (<>Start Free Trial <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>),
    href: '/signup?plan=business',
    note: '7-day free trial · Card required · Cancel anytime',
    featured: true,
    features: [
      'Local business AI scan',
      '11 platform scanning',
      'Competitor intelligence',
      'Revenue gap calculator',
      'Fix Engine (13 tools)',
      `Trust Layer (${TRUST_SIGNALS_LABEL} signals)`,
      'Recommendation Simulator',
      'Intelligence Graph',
      'SEO Health audit',
      'Score history + trends',
      'Knowledge Panel detection',
      'AI Inbox',
    ],
  },
  {
    key: 'agency',
    name: 'Agency',
    emoji: <svg viewBox="0 0 384 512" width="13" height="13" fill="currentColor" aria-hidden="true" style={{ verticalAlign: 'middle' }}><path d="M48 0C21.5 0 0 21.5 0 48L0 464c0 26.5 21.5 48 48 48l96 0 0-80c0-26.5 21.5-48 48-48s48 21.5 48 48l0 80 96 0c26.5 0 48-21.5 48-48l0-416c0-26.5-21.5-48-48-48L48 0zM64 240c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32zm112-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16zm80 16c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32zM80 96l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16zm80 16c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32zM272 96l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16z"/></svg>,
    monthly: PRICE_AGENCY_USD,
    annual: 2486,
    desc: 'For agencies managing AI visibility for multiple clients',
    badge: 'BEST ROI',
    cta: (<>Start Agency Trial <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>),
    href: '/signup?plan=agency',
    demoHref: '/agency/demo',
    note: '7-day free trial · Card required · Cancel anytime',
    features: [
      'Everything in Business',
      'Unlimited client accounts',
      'White label reports',
      'Proposal builder',
      'Client dashboard',
      'PDF exports',
      'Agency alerts',
    ],
  },
];

const PERSONAL_TRACK: Tier[] = [
  {
    key: 'personal_pro',
    name: 'Personal Brand',
    emoji: <svg viewBox="0 0 576 512" width="13" height="13" fill="currentColor" aria-hidden="true" style={{ verticalAlign: 'middle' }}><path d="M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329 542.7 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z"/></svg>,
    monthly: PRICE_PERSONAL_USD,
    annual: 144,
    desc: 'For doctors, lawyers, consultants, and coaches who want AI to know their name',
    badge: 'MOST POPULAR',
    cta: (<>Start Free Trial <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>),
    href: '/signup?plan=personal_pro',
    note: '7-day free trial · Card required · Cancel anytime',
    featured: true,
    features: [
      'Personal AI name recognition scan',
      '11 platform scanning',
      'AI Inbox — what AI says about you',
      'Personal brand dashboard',
      'Reputation monitoring',
      'Authority signals',
      'Pitch kit generator',
      'Fix Engine',
      `Trust Layer (${TRUST_SIGNALS_LABEL} signals)`,
      'Recommendation Simulator',
      'Score history + trends',
      '100 scans per month',
    ],
  },
  {
    key: 'free',
    name: 'Free',
    emoji: <svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true" style={{ verticalAlign: 'middle' }}><path d="M0 80L0 229.5c0 17 6.7 33.3 18.7 45.3l176 176c25 25 65.5 25 90.5 0L418.7 317.3c25-25 25-65.5 0-90.5l-176-176c-12-12-28.3-18.7-45.3-18.7L48 32C21.5 32 0 53.5 0 80zm112 32a32 32 0 1 1 0 64 32 32 0 1 1 0-64z"/></svg>,
    monthly: 0,
    annual: 0,
    desc: 'Try your first AI visibility scan — no card required',
    cta: (<>Start Free <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>),
    href: '/signup?plan=free',
    note: 'No credit card required',
    features: [
      '3 scans per month',
      'Your AI Visibility Score (0–100)',
      'See which platforms mention you',
      'Top fix preview',
    ],
  },
];

const FAQ = [
  { q: 'Which track is right for me?', a: 'Choose Local Businesses if you serve a local area (restaurant, dental practice, law firm, HVAC, gym, salon). Choose Personal Brands if you are an individual professional — doctor, lawyer, consultant, coach — who wants AI assistants to recognise your name.' },
  { q: 'Can I cancel any time?', a: 'Yes. Cancel any time from your account settings. No cancellation fees, no questions asked. Your scan history and verified outcomes stay in your account.' },
  // ax6p/trial caps: the old answer promised "full access", but a trialing
  // account is capped (lib/trialCaps.ts) — state the caps honestly.
  { q: 'What is included in the free trial?', a: `Your chosen plan for 7 days, with trial limits: ${TRIAL_MAX_LOCATIONS} business location, reduced scan allowances (for example ${TRIAL_LIMITS.local_scan} local scans and ${TRIAL_LIMITS.competitor_scan} competitor scans), and no PDF report exports or white-label until the trial converts to a paid plan. A card is required to start the trial — you will not be charged until the trial ends. Cancel anytime. Real scans on real AI platforms, with real fix content generated for your specific business or brand.` },
  { q: 'How do I get a refund?', a: 'If you are within 14 days of your first payment, request a full refund from your billing page — no questions asked. A refund also cancels your subscription and moves your account to the Free plan. After 14 days, subscriptions are non-refundable for the current billing period, but you can cancel anytime to stop future charges.' },
  { q: 'What AI platforms do you scan?', a: 'All 11 — ChatGPT, Gemini, Google AI, Copilot, Perplexity, Grok, Claude, DeepSeek, Mistral, Kimi, and Groq. Every plan includes all platforms on every scan.' },
  { q: 'Can I upgrade or downgrade later?', a: 'Absolutely. Switch plans any time. Upgrades take effect immediately; downgrades apply at the end of your current billing period.' },
];

function TrackHead({ title, text, icon, order }: { title: string; text: string; icon: ReactNode; order: string }) {
  return (
    <div className={`pr-track ${order}`} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 4px 4px' }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: INK, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: BLUE, display: 'inline-flex' }}>{icon}</span>{title}
      </span>
      <span style={{ fontSize: 13, color: BODY, lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}

export default function PricingClient({ country }: { country: CountryConfig }) {
  const [annual, setAnnual] = useState(false);
  // Plan carried in from ?plan= / ?upgrade= — highlighted and scrolled to.
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const [stripeReady, setStripeReady] = useState(false);
  // Which plan/interval Stripe prices are configured (GET /api/billing/status).
  const [priceConfig, setPriceConfig] = useState<Record<string, boolean> | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  // Human-readable checkout error shown inline (role="alert") — never a
  // cryptic browser alert. In particular a logged-out visitor who clicks a
  // paid CTA must be routed to signup, not shown an error at all.
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  // ax6z: annual checkout (and unconfigured Stripe) returns a waitlist URL.
  // The old code silently redirected — a buyer clicking "Start Free Trial"
  // landed on /waitlist with no explanation. Show the reason + a choice.
  const [waitlistNotice, setWaitlistNotice] = useState<{ message: string; url: string; plan: string; reason: string; annual: boolean } | null>(null);
  // b28j: when checkout is blocked for an unverified email, offer the
  // resend-verification path inline instead of a dead-end error.
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  useEffect(() => {
    const key = tierKeyFromParams(window.location.search);
    if (!key) return;
    // Read from the URL after mount (no hydration mismatch), then bring the
    // chosen card into view once it has re-rendered with the highlight.
    const t = window.setTimeout(() => {
      setHighlightKey(key);
      // Round 2: ?interval= or the interval saved at signup.
      let stored: string | null = null;
      try { stored = localStorage.getItem(INTENDED_INTERVAL_KEY); } catch { /* private mode */ }
      if (intervalFromParams(window.location.search, stored) === 'annual') setAnnual(true);
      window.requestAnimationFrame(() => {
        document.getElementById(`tier-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/billing/status')
      .then(r => r.json())
      .then(d => { if (active) { setStripeReady(!!d?.ready); setPriceConfig(d?.prices && typeof d.prices === 'object' ? d.prices : null); } })
      .catch(() => { if (active) setStripeReady(false); });
    return () => { active = false; };
  }, []);

  async function handleCheckout(plan: string) {
    if (plan === 'free') { window.location.href = '/signup?plan=free'; return; }
    setCheckoutError(null);
    setEmailNotVerified(false);
    setResendStatus('idle');
    setWaitlistNotice(null);
    // ax6p: a logged-out visitor used to POST to /api/billing/create-checkout,
    // get a 401, and see a cryptic "Something went wrong" alert — a dead-end
    // sale. Check auth first and route logged-out visitors to signup with
    // their plan choice preserved. The 401 branch below covers the race
    // (session expiring between the check and the POST).
    // ax6p: carry the interval — the old URL dropped it, so an
    // annual buyer who hit the 401 path silently became monthly.
    const signupUrl = `/signup?plan=${encodeURIComponent(plan)}&interval=${annual ? 'annual' : 'monthly'}`;
    try {
      const { data: { user } } = await getBrowserClient().auth.getUser();
      if (!user) { window.location.href = signupUrl; return; }
    } catch {
      window.location.href = signupUrl;
      return;
    }
    // Round 2: annual prices may still be placeholders — say so BEFORE
    // checkout instead of bouncing the buyer through Stripe/waitlist.
    if (annual && annualConfigured(plan, priceConfig) === false) {
      setWaitlistNotice({
        message: 'Annual billing for this plan isn\u2019t set up yet, so we can\u2019t take an annual payment today. You can start on monthly billing instead (same 7-day trial), or join the waitlist and we\u2019ll tell you when annual opens.',
        url: `/waitlist?plan=${encodeURIComponent(plan)}&interval=annual`,
        plan, reason: 'price_not_configured', annual: true,
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    try {
      const res = await fetch('/api/billing/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, interval: annual ? 'annual' : 'monthly', countryCode: country.code }),
      });
      const data = await res.json();
      // Logged-out visitor: create-checkout requires a session (401). Route
      // to signup with the chosen plan preselected — never a cryptic error.
      if (res.status === 401 || data?.error === 'Unauthorized') {
        window.location.href = signupUrl;
        return;
      }
      // b28j: unverified email — show the message + the resend path, never
      // a dead end. b28j: rate-limited checkout — show the message.
      if (res.status === 403 && data?.error === 'email_not_verified') {
        setCheckoutError(data?.message || 'Verify your email to start your trial.');
        setEmailNotVerified(true);
        return;
      }
      if (res.status === 429) {
        setCheckoutError(data?.message || 'Too many attempts — please wait a bit and try again.');
        return;
      }
      if (data?.url) window.location.href = data.url;
      else if (data?.waitlistUrl) {
        // ax6z: don't silently dump the buyer on /waitlist. Annual billing
        // has no Stripe price yet, so checkout can't complete — say so, and
        // offer monthly instead.
        setWaitlistNotice({ message: data?.message || 'This plan is not yet available. Join the waitlist.', url: data.waitlistUrl, plan, reason: String(data?.error || ''), annual });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      else setCheckoutError(data?.message || 'Checkout is not available right now. Please try again, or contact us and we will help you get started.');
    } catch {
      setCheckoutError('Checkout is not available right now. Please check your connection and try again, or contact us and we will help you get started.');
    }
  }

  async function resendVerification() {
    setResendStatus('sending');
    try {
      const res = await fetch('/api/auth/resend-verification', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setResendStatus('sent');
        if (data?.alreadyVerified) setEmailNotVerified(false);
      } else {
        setResendStatus('error');
      }
    } catch {
      setResendStatus('error');
    }
  }

  // Layout follows the reference pattern: one row of plan cards (Free →
  // Personal Brand → Local Business → Agency) under two track headers, one
  // dark "hero" card, a soft inner panel for each plan's headline items,
  // then the full checklist. Copy and logic are unchanged.
  const isDark = (t: Tier) => t.key === 'business';

  function TierCard({ t, order }: { t: Tier; order: string }) {
    // ax6z: prices are USD for every visitor — checkout charges the single
    // USD Stripe price per plan (getStripePrice ignores country), so the
    // old country.symbol on a USD amount showed £39 for a $39 charge.
    const price = annual && t.monthly > 0 ? t.annual : t.monthly;
    const isFree = t.monthly === 0;
    const isChosen = highlightKey === t.key;
    const dark = isDark(t);
    const fg = dark ? '#fff' : INK;
    const sub = dark ? '#B4B4C8' : BODY;
    const dim = dark ? '#9C9CB4' : DIM;
    const headline = t.features.slice(0, 3);
    const rest = t.features.slice(3);
    const ctaStyle: React.CSSProperties = {
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', boxSizing: 'border-box',
      minHeight: 46, borderRadius: 999, fontSize: 15, fontWeight: 700, textDecoration: 'none', cursor: 'pointer', fontFamily: 'inherit',
      border: dark || !isFree ? 'none' : `1px solid ${BORDER}`,
      background: dark || !isFree ? BLUE : CARD,
      color: dark || !isFree ? '#fff' : INK,
      boxShadow: dark ? '0 12px 32px rgba(27,23,255,0.45)' : 'none',
    };
    return (
      <div id={`tier-${t.key}`} aria-current={isChosen ? 'true' : undefined} className={`pr-card ${order}`} style={{
        background: dark ? INK : CARD,
        border: `1px solid ${dark ? INK : BORDER}`,
        outline: isChosen ? `3px solid ${BLUE}` : 'none',
        outlineOffset: isChosen ? 4 : 0,
        borderRadius: 20,
        padding: '24px 22px',
        color: fg,
        boxShadow: dark ? '0 24px 64px rgba(10,10,20,0.28)' : '0 1px 2px rgba(10,10,20,0.04)',
        display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        <div className="pr-head" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: fg, display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
              <span style={{ color: dark ? '#8D8BFF' : BLUE, display: 'inline-flex' }}>{t.emoji}</span>{t.name}
            </span>
            {t.badge && (
              <span style={{ background: dark ? BLUE : '#EEF0FF', color: dark ? '#fff' : BLUE, fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap', letterSpacing: '0.06em' }}>{t.badge}</span>
            )}
          </div>
          {isChosen && (
            <span style={{ fontSize: 12, fontWeight: 700, color: dark ? '#8D8BFF' : BLUE }}>Your selected plan</span>
          )}
          <p style={{ fontSize: 13, color: sub, margin: 0, lineHeight: 1.5 }}>{t.desc}</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 84 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 44, fontWeight: 700, color: fg, letterSpacing: '-0.04em', lineHeight: 1 }}>${price}</span>
            <span style={{ fontSize: 14, color: sub }}>{isFree ? '/forever' : annual ? '/yr' : '/mo'}</span>
          </div>
          {annual && !isFree ? (
            <span style={{ fontSize: 12, color: dim }}>≈ ${Math.round(t.annual / 12)}/mo, billed annually — save 20%</span>
          ) : (
            <span style={{ fontSize: 12, color: dim }}>{t.note}</span>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {isFree ? (
            <Link href={t.href} style={ctaStyle}>{t.cta}</Link>
          ) : stripeReady ? (
            <button onClick={() => handleCheckout(t.key)} style={ctaStyle}>{t.cta}</button>
          ) : (
            <Link href={t.href} style={ctaStyle}>{t.cta}</Link>
          )}
          {t.demoHref && (
            <Link href={t.demoHref} style={{ display: 'block', textAlign: 'center', fontSize: 14, fontWeight: 600, color: dark ? '#fff' : BLUE, textDecoration: 'underline' }}>
              Book a demo
            </Link>
          )}
        </div>

        <ul style={{ listStyle: 'none', margin: 0, padding: 14, borderRadius: 14, background: dark ? 'rgba(255,255,255,0.06)' : BG, border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : BORDER}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {headline.map(feat => (
            <li key={feat} style={{ fontSize: 14, fontWeight: 600, color: fg, lineHeight: 1.4 }}>{feat}</li>
          ))}
        </ul>

        {rest.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rest.map(feat => (
              <li key={feat} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ color: dark ? '#8D8BFF' : BLUE, flexShrink: 0, marginTop: 2 }}><svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg></span>
                <span style={{ fontSize: 13, color: dark ? '#DCDCE8' : INK, lineHeight: 1.5 }}>{feat}</span>
              </li>
            ))}
          </ul>
        )}

        {t.monthly > 0 && (
          <div style={{ marginTop: 'auto', paddingTop: 14, borderTop: `1px solid ${dark ? 'rgba(255,255,255,0.12)' : BORDER}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ fontSize: 12, color: dim, margin: 0 }}><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 6 }}><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> 14-day money back guarantee</p>
            {/* CONV-03: risk reversal at every CTA */}
            <RiskReversal compact />
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ background: BG, minHeight: '100vh', fontFamily: "'Geist','Inter','Helvetica Neue',Arial,sans-serif" }}>
      <style>{`
        .pr-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;align-items:stretch}
        .pr-grid .pr-track{grid-column:span 2}
        .pr-head{min-height:118px}
        .pr-split{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.6fr);gap:48px;align-items:start}
        /* Tablet: each track's header, then its two plans. */
        @media (max-width:1080px){
          .pr-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
          .pr-o1{order:1}.pr-o2{order:2}.pr-o3{order:3}.pr-o4{order:4}.pr-o5{order:5}.pr-o6{order:6}
          .pr-head{min-height:0}
        }
        @media (max-width:640px){
          .pr-grid{grid-template-columns:minmax(0,1fr)}
          .pr-grid .pr-track{grid-column:auto}
          .pr-split{grid-template-columns:minmax(0,1fr);gap:24px}
        }
      `}</style>

      {/* Hero */}
      <section style={{ padding: '72px 24px 8px', textAlign: 'center' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: BODY, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <span aria-hidden="true" style={{ width: 18, height: 1, background: DIM }} /> Founding Member Pricing
          </span>
          <h1 style={{ margin: 0, fontSize: 'clamp(38px,5vw,56px)', fontWeight: 700, color: INK, letterSpacing: '-0.045em', lineHeight: 1.05 }}>Find your <span style={{ color: BLUE }}>plan</span></h1>
          <p style={{ margin: 0, fontSize: 17, color: BODY, maxWidth: 520, lineHeight: 1.6 }}>Two tracks. Choose the one that fits your situation.</p>
          {/* ax6z: the charge is USD for every visitor (single USD Stripe
              price per plan). Say so — don't let a non-US visitor assume a
              local-currency charge. */}
          {country.code !== 'US' && (
            <p style={{ margin: 0, fontSize: 13, color: DIM }}>All prices in USD — your card is charged in USD.</p>
          )}
          {/* Billing toggle */}
          <div role="group" aria-label="Billing period" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 999, padding: 4, marginTop: 8 }}>
            <button onClick={() => setAnnual(false)} aria-pressed={!annual} style={{ minHeight: 36, padding: '0 18px', borderRadius: 999, border: 'none', background: annual ? 'transparent' : INK, color: annual ? BODY : '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Monthly</button>
            <button onClick={() => setAnnual(true)} aria-pressed={annual} aria-label="Toggle annual billing" style={{ minHeight: 36, padding: '0 18px', borderRadius: 999, border: 'none', background: annual ? INK : 'transparent', color: annual ? '#fff' : BODY, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              Annual <span style={{ background: annual ? BLUE : '#EEF0FF', borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 700, color: annual ? '#fff' : BLUE }}>Save 20%</span>
            </button>
          </div>
        </div>
      </section>

      {/* ax6z: annual billing isn't purchasable yet (no annual Stripe
          prices) — explain instead of silently redirecting to /waitlist. */}
      {waitlistNotice && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 20px 0' }}>
          <div style={{ maxWidth: 640, width: '100%', background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 14, padding: '18px 22px', textAlign: 'center' }}>
            {/* The heading follows the server's reason — it used to say
                "Annual billing…" even for a monthly checkout when Stripe
                itself is not configured. */}
            <p style={{ fontSize: 14, fontWeight: 700, color: '#92400E', margin: '0 0 6px' }}>
              {waitlistNotice.reason === 'stripe_not_configured'
                ? 'Checkout isn’t open yet'
                : waitlistNotice.annual
                  ? 'Annual billing for this plan isn’t available yet'
                  : 'This plan isn’t available to buy yet'}
            </p>
            <p style={{ fontSize: 13, color: '#78350F', margin: '0 0 14px', lineHeight: 1.6 }}>{waitlistNotice.message}</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <a href={waitlistNotice.url} style={{ background: INK, color: '#fff', borderRadius: 999, padding: '10px 22px', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>Join the waitlist</a>
              {waitlistNotice.annual && waitlistNotice.reason !== 'stripe_not_configured' && (
                <button onClick={() => { setAnnual(false); setWaitlistNotice(null); }} style={{ background: '#fff', border: `1.5px solid ${BORDER}`, borderRadius: 999, padding: '10px 22px', fontSize: 13, fontWeight: 700, color: INK, cursor: 'pointer', fontFamily: 'inherit' }}>Switch to monthly instead</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Checkout error — visible, human-readable, never a cryptic alert */}
      {checkoutError && (
        <div role="alert" style={{ maxWidth: 1200, margin: '24px auto 0', padding: '0 24px' }}>
          <p style={{ background: '#FDECEC', border: '1px solid #F5C2C2', borderRadius: 12, padding: '14px 18px', fontSize: 14, color: '#8B1A1A', lineHeight: 1.6, margin: 0 }}>
            {checkoutError}
          </p>
          {/* b28j: unverified email — resend-verification path inline */}
          {emailNotVerified && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
              <button
                onClick={resendVerification}
                disabled={resendStatus === 'sending' || resendStatus === 'sent'}
                style={{ background: BLUE, border: 'none', borderRadius: 999, padding: '10px 20px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: resendStatus === 'sending' || resendStatus === 'sent' ? 'default' : 'pointer', opacity: resendStatus === 'sending' || resendStatus === 'sent' ? 0.7 : 1 }}
              >
                {resendStatus === 'sending' ? 'Sending…' : resendStatus === 'sent' ? 'Verification email sent' : 'Resend verification email'}
              </button>
              {resendStatus === 'sent' && (
                <span style={{ fontSize: 14, color: '#059669' }}>Check your inbox for the confirmation link.</span>
              )}
              {resendStatus === 'error' && (
                <span style={{ fontSize: 14, color: '#8B1A1A' }}>Could not send it — please try again in a bit.</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Plans: one row, grouped by track */}
      <section style={{ maxWidth: 1240, margin: '0 auto', padding: '40px 24px 72px' }}>
        <div className="pr-grid">
          <TrackHead
              order="pr-o1"
              title="For Personal Brands"
              text="Doctors, lawyers, consultants, coaches, realtors, financial advisors — professionals who want AI to recognise their name."
              icon={<svg viewBox="0 0 576 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329 542.7 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z"/></svg>}
            />
          <TrackHead
              order="pr-o4"
              title="For Local Businesses"
              text="Restaurants, dental practices, law firms, HVAC, gyms, salons — any business that serves a local area and wants AI to recommend them."
              icon={<svg viewBox="0 0 576 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M547.6 103.8L490.3 13.1C485.2 5 476.1 0 466.4 0L109.6 0C99.9 0 90.8 5 85.7 13.1L28.3 103.8c-29.6 46.8-3.4 111.9 51.9 119.4c4 .5 8.1 .8 12.1 .8c26.1 0 49.3-11.4 65.2-29c15.9 17.6 39.1 29 65.2 29c26.1 0 49.3-11.4 65.2-29c15.9 17.6 39.1 29 65.2 29c26.2 0 49.3-11.4 65.2-29c16 17.6 39.1 29 65.2 29c4.1 0 8.1-.3 12.1-.8c55.5-7.4 81.8-72.5 52.1-119.4zM499.7 254.9c0 0 0 0-.1 0c-5.3 .7-10.7 1.1-16.2 1.1c-12.4 0-24.3-1.9-35.4-5.3L448 384l-320 0 0-133.4c-11.2 3.5-23.2 5.4-35.6 5.4c-5.5 0-11-.4-16.3-1.1l-.1 0c-4.1-.6-8.1-1.3-12-2.3L64 384l0 64c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-64 0-131.4c-4 1-8 1.8-12.3 2.3z"/></svg>}
            />
          {[...PERSONAL_TRACK].reverse().map((t, i) => <TierCard key={t.key} t={t} order={i === 0 ? 'pr-o2' : 'pr-o3'} />)}
          {LOCAL_TRACK.map((t, i) => <TierCard key={t.key} t={t} order={i === 0 ? 'pr-o5' : 'pr-o6'} />)}
        </div>
      </section>

      {/* More plans — the founder tiers without a card above (b8b0).
          Prices come from FOUNDER_PRICING_USD via tierPrice, never a
          literal. Product Pro is self-serve; SEO / Government / Global
          are contact-led (no signup ?plan= key exists for them). */}
      <section style={{ background: CARD, borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}` }}>
        <div className="pr-split" style={{ maxWidth: 1200, margin: '0 auto', padding: '72px 24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h2 style={{ fontSize: 'clamp(26px,3vw,34px)', fontWeight: 700, color: INK, letterSpacing: '-0.03em', margin: 0 }}>More plans</h2>
            <p style={{ fontSize: 15, color: BODY, margin: 0, lineHeight: 1.6 }}>Specialist tiers from the same founder pricing.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(220px,100%),1fr))', gap: 12 }}>
            {([
              { name: 'Product Pro', desc: 'AI visibility for your product or SaaS', href: '/signup?plan=product_pro', cta: 'Start Free Trial' },
              { name: 'SEO', desc: 'AI-visibility SEO tooling', href: '/contact', cta: 'Contact Us' },
              { name: 'Government', desc: 'For public-sector organizations', href: '/contact', cta: 'Contact Us' },
              { name: 'Global Brand Intelligence', desc: 'Global brand monitoring', href: '/contact', cta: 'Contact Us' },
            ] as const).map(t => (
              <div key={t.name} style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: INK, margin: 0 }}>{t.name}</p>
                <p style={{ fontSize: 26, fontWeight: 700, color: INK, margin: 0, letterSpacing: '-0.03em' }}>${tierPrice(t.name).toLocaleString()}<span style={{ fontSize: 14, color: BODY, fontWeight: 500 }}>/mo</span></p>
                <p style={{ fontSize: 13, color: BODY, margin: '0 0 8px', lineHeight: 1.5 }}>{t.desc}</p>
                <Link href={t.href} style={{ marginTop: 'auto', fontSize: 13, fontWeight: 700, color: BLUE, textDecoration: 'underline' }}>{t.cta}</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ — heading left, questions right */}
      <section style={{ padding: '72px 24px' }}>
        <div className="pr-split" style={{ maxWidth: 1200, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(26px,3vw,34px)', fontWeight: 700, color: INK, letterSpacing: '-0.03em', margin: 0 }}>Common questions</h2>
          <div style={{ borderTop: `1px solid ${BORDER}` }}>
            {FAQ.map((item, i) => (
              <div key={i} style={{ borderBottom: `1px solid ${BORDER}` }}>
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)} aria-expanded={openFaq === i} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, background: 'none', border: 'none', padding: '18px 0', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: INK }}>{item.q}</span>
                  <span style={{ fontSize: 20, color: BLUE, fontWeight: 400, flexShrink: 0 }}>{openFaq === i ? '−' : '+'}</span>
                </button>
                {openFaq === i && (
                  <p style={{ fontSize: 15, color: BODY, lineHeight: 1.7, margin: '0 0 18px', paddingRight: 40 }}>{item.a}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Enterprise — closing dark band */}
      <section style={{ background: INK, padding: '80px 24px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#8D8BFF', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 14px' }}>Enterprise</p>
          <h2 style={{ fontSize: 'clamp(28px,3.5vw,40px)', fontWeight: 700, color: '#fff', letterSpacing: '-0.03em', margin: '0 0 14px' }}>
            For chains, governments and global brands
          </h2>
          <p style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: '0 0 14px' }}>${tierPrice('Enterprise').toLocaleString()}<span style={{ fontSize: 15, color: '#B4B4C8', fontWeight: 500 }}>/mo</span></p>
          <p style={{ fontSize: 16, color: '#B4B4C8', maxWidth: 560, margin: '0 auto 32px', lineHeight: 1.6 }}>
            Unlimited locations, custom query libraries, dedicated account management, API access, and enterprise SLAs.
          </p>
          <Link href="/contact" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: BLUE, borderRadius: 999, padding: '15px 32px', fontSize: 15, fontWeight: 700, color: '#fff', textDecoration: 'none' }}>
            Contact Us <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
        </div>
      </section>
    </div>
  );
}
