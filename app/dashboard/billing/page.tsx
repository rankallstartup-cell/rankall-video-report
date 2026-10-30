'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getBrowserClient } from '@/lib/supabase';
import { normalizePlan, getPlanMeta, isAdminUser } from '@/lib/planConfig';
import { usePlan } from '@/lib/usePlan';
import { trialEndDateLabel, trialDaysLeft } from '@/lib/trialEnd';
import { moneyBackDateLabel, formatRefundAmount } from '@/lib/moneyBack';
import { Geist, Geist_Mono } from 'next/font/google';

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

// Refund eligibility from GET /api/billing/refund-eligibility (b28k).
type RefundEligibility =
  | { eligible: true; chargeId: string; amountCents: number; currency: string; firstPaidAt: string; deadline: string }
  | { eligible: false; reason: 'no_payment' | 'already_refunded' | 'outside_window'; firstPaidAt: string | null; deadline: string | null; chargeId: string | null; amountCents: number | null; currency: string | null };

// ── b35y: b35q design tokens on staging logic ──
const BG     = '#F6F6FB';
const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#E7E7F0';
const BLUE   = '#1B17FF';
const GREEN  = '#12A150';
const GREEN_DARK = '#0B6B37';
const GREEN_BG = '#E3F6EC';
const AMBER  = '#D97706';
const RED_X  = '#D92D20';
const GRAY   = '#55556A';

type BillingState =
  | 'loading'
  | 'error'            // ax73: load failed — never present as 'free'
  | 'not_configured'   // 1: Stripe not ready
  | 'free'             // 2: ready but free / no sub
  | 'trialing'         // 7-day Stripe trial, card on file (b28h)
  | 'active'           // 3: active paid sub
  | 'payment_failed'   // 4: payment_failed / past_due
  | 'cancelled';       // 5: subscription ended

export default function BillingPage() {
  const { plan: effectivePlan, rawPlan, loading: planLoading, userId, userEmail, isTrialing, trialEndsAt } = usePlan();
  const isAdmin = isAdminUser(userEmail);
  const plan = isAdmin ? rawPlan : effectivePlan;
  const [state, setState] = useState<BillingState>('loading');
  const [portalLoading, setPortalLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [retry, setRetry] = useState(0); // ax73: retry the billing load
  const [adminPreview, setAdminPreview] = useState(false); // admin w/o real Stripe sub
  // Grace deadline for a failed payment (b28h): payment_failed_at + 3 days,
  // read from app_metadata. Shown on the payment_failed card so the
  // in-app notice states the deadline and the consequence.
  const [graceDeadlineLabel, setGraceDeadlineLabel] = useState<string | null>(null);
  // Money-back refund eligibility (b28k): fetched once per load. Null
  // means "unknown / not loaded" — the refund section stays hidden rather
  // than showing a wrong state.
  const [refundEligibility, setRefundEligibility] = useState<RefundEligibility | null>(null);
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundConfirmArmed, setRefundConfirmArmed] = useState(false);
  // "Start paid plan now" (ends the trial early): two-step confirm.
  const [endTrialArmed, setEndTrialArmed] = useState(false);
  const [endTrialLoading, setEndTrialLoading] = useState(false);

  useEffect(() => {
    if (planLoading) return;
    (async () => {
      try {
        // ax73: a status-endpoint FAILURE is not 'Stripe not configured' —
        // the old .catch(() => ({ ready: false })) showed 'Payments
        // launching soon' + waitlist even when Stripe was configured.
        // Only a positive ready:false means not_configured.
        const [{ data: userData }, statusRes] = await Promise.all([
          getBrowserClient().auth.getUser(),
          fetch('/api/billing/status'),
        ]);
        if (!statusRes.ok) throw new Error(`billing status failed: ${statusRes.status}`);
        const statusJson = await statusRes.json().catch(() => null);
        const ready = !!statusJson?.ready;
        setAdminPreview(ready && isAdmin && plan !== 'free'); // truthful: no Stripe sub behind admin preview
        // app_metadata only (admin-written by the billing webhook / cron).
        // user_metadata is user-editable and never drives billing state.
        const meta = (userData?.user?.app_metadata ?? {}) as Record<string, unknown>;
        const subStatus = (meta.subscription_status as string | undefined) ?? null;
        // Grace deadline (b28h): failed payment + 3 days. When the stamp is
        // missing (legacy row), show the window without a date rather than
        // inventing one.
        const failedAt = typeof meta.payment_failed_at === 'string' ? meta.payment_failed_at : null;
        setGraceDeadlineLabel(
          failedAt
            ? new Date(new Date(failedAt).getTime() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString(undefined, {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })
            : null,
        );

        // Money-back eligibility (b28k): fetched alongside billing status.
        // A failed fetch leaves it null (section hidden) — never a wrong
        // refund state. Only paid-history states render the section.
        try {
          const eligRes = await fetch('/api/billing/refund-eligibility');
          if (eligRes.ok) {
            const elig = await eligRes.json();
            if (typeof elig?.eligible === 'boolean') setRefundEligibility(elig);
          }
        } catch {
          // Leave null — no refund section rather than a wrong one.
        }

        if (!ready) {
          setState('not_configured');
        } else if (isAdmin && plan !== 'free') {
          // Admin testing: no real Stripe sub, derive from plan value
          setState('active');
        } else if (subStatus === 'cancelled') {
          setState('cancelled');
        } else if (subStatus === 'payment_failed' || subStatus === 'past_due') {
          setState('payment_failed');
        } else if (isTrialing) {
          // b28h: trialing users previously fell through to 'free' ("You're
          // on the free plan") — wrong and dishonest. Trialing is its own
          // state, driven by the subscriptions row (usePlan), not metadata.
          setState('trialing');
        } else if (subStatus === 'active' && plan !== 'free') {
          setState('active');
        } else {
          setState('free');
        }
      } catch {
        // ax73: any load failure is an error state — never 'free' (a paid
        // user must not be told 'You're on the free plan / Upgrade').
        setState('error');
      }
    })();
  }, [planLoading, plan, retry, isTrialing]);

  async function openPortal() {
    if (!userId) { setMsg('Please sign in again to manage billing.'); return; }
    setPortalLoading(true);
    setMsg(null);
    try {
      // The server derives the user from the session — no user id sent.
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.portalUrl) {
        window.location.href = data.portalUrl;
        return;
      }
      setMsg(data?.message || data?.error || 'Could not open billing portal.');
    } catch {
      setMsg('Could not open billing portal.');
    }
    setPortalLoading(false);
  }

  // End the trial early (charges the card on file now, lifts trial caps).
  async function endTrialNow() {
    setEndTrialLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/billing/end-trial', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      setMsg(data?.message || (res.ok ? 'Your paid plan has started.' : 'Could not start your paid plan. Nothing was charged — please try again.'));
      if (res.ok) {
        setEndTrialArmed(false);
        setState('active');
      }
    } catch {
      setMsg('Could not start your paid plan. Nothing was charged — please check your connection and try again.');
    }
    setEndTrialLoading(false);
  }

  // Money-back refund (b28k): two-step inline confirm — first click arms
  // the confirm, second click issues the refund. No browser alert(), no
  // one-click money action. On success the subscription is cancelled by
  // the server and the account moves to Free, so the page reflects that.
  async function requestRefund() {
    if (!userId) { setMsg('Please sign in again to request a refund.'); return; }
    setRefundLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/billing/refund', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        setRefundConfirmArmed(false);
        setRefundEligibility({
          eligible: false,
          reason: 'already_refunded',
          firstPaidAt: null,
          deadline: null,
          chargeId: null,
          amountCents: null,
          currency: null,
        });
        setState('cancelled');
        setMsg(
          data?.cancelWarning ||
            'Your refund has been issued. It can take 5–10 business days to appear on your statement. Your subscription has been cancelled and your account moved to the Free plan.',
        );
      } else {
        setMsg(
          data?.message ||
            'Could not process your refund. Nothing was refunded. Please try again, or contact hello@rankall.io and we will help.',
        );
      }
    } catch {
      setMsg('Could not process your refund. Nothing was refunded. Please check your connection and try again, or contact hello@rankall.io and we will help.');
    }
    setRefundLoading(false);
  }

  // Money-back section (b28k): rendered on paid-history states (active,
  // payment_failed, cancelled) — a user who cancelled inside the window
  // can still claim. Trialing users have nothing charged yet, so they
  // get the trial card's note instead (no refund UI). Every branch states
  // the real terms: deadline when eligible, actual end date when expired,
  // and the cancel consequence before confirming.
  function RefundSection() {
    const elig = refundEligibility;
    if (!elig || (!elig.eligible && elig.reason === 'no_payment')) return null;
    if (elig.eligible) {
      const amount = formatRefundAmount(elig.amountCents, elig.currency);
      return (
        <div className="card dash-card" style={{ marginTop: 16, background: GREEN_BG, border: '1px solid #BBF7D0' }}>
          <p className="lbl" style={{ marginBottom: 12 }}>14-Day Money-Back Guarantee</p>
          <p style={{ fontSize: 16, fontWeight: 800, color: NAVY, margin: '0 0 8px' }}>
            Request a full refund{amount ? ` of ${amount}` : ''} by {moneyBackDateLabel(elig.deadline)}.
          </p>
          <p style={{ fontSize: 14, color: GRAY, margin: '0 0 20px', lineHeight: 1.6 }}>
            No questions asked. Requesting a refund will also cancel your subscription and move your account to the Free plan — your scans and data stay.
          </p>
          {!refundConfirmArmed ? (
            <button onClick={() => setRefundConfirmArmed(true)} style={primaryBtn}>Request a refund</button>
          ) : (
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: '0 0 12px' }}>
                This will refund{amount ? ` ${amount}` : ''} to your original payment method and cancel your subscription. Are you sure?
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={requestRefund} disabled={refundLoading} style={{ ...primaryBtn, background: RED_X, cursor: refundLoading ? 'wait' : 'pointer', opacity: refundLoading ? 0.7 : 1 }}>
                  {refundLoading ? 'Processing…' : 'Confirm refund'}
                </button>
                <button
                  onClick={() => setRefundConfirmArmed(false)}
                  style={{ ...primaryBtn, background: W, color: NAVY, boxShadow: 'none', border: '1px solid #D9D9E6' }}
                >
                  Keep my plan
                </button>
              </div>
            </div>
          )}
        </div>
      );
    }
    if (elig.reason === 'already_refunded') {
      return (
        <div className="card dash-card" style={{ marginTop: 16 }}>
          <p className="lbl" style={{ marginBottom: 12 }}>14-Day Money-Back Guarantee</p>
          <p style={{ fontSize: 14, color: GRAY, margin: 0, lineHeight: 1.6 }}>
            The 14-day money-back guarantee has already been used for your account or card (it can be used once per customer). If you are waiting on a refund and do not see it on your statement within 10 business days, contact hello@rankall.io and we will help.
          </p>
        </div>
      );
    }
    // outside_window
    return (
      <div className="card dash-card" style={{ marginTop: 16 }}>
        <p className="lbl" style={{ marginBottom: 12 }}>14-Day Money-Back Guarantee</p>
        <p style={{ fontSize: 14, color: GRAY, margin: 0, lineHeight: 1.6 }}>
          Your 14-day money-back guarantee ended on {moneyBackDateLabel(elig.deadline)}. Subscriptions are non-refundable after that, but you can cancel anytime to stop future charges. If you believe this is a billing error, contact hello@rankall.io and we will review it.
        </p>
      </div>
    );
  }

  const meta = getPlanMeta(plan);

  const primaryBtn: React.CSSProperties = {
    background: BLUE, border: 'none', borderRadius: 12, padding: '12px 22px',
    fontSize: 14, fontWeight: 700, color: '#fff', textDecoration: 'none',
    display: 'inline-block', cursor: 'pointer', fontFamily: 'inherit',
    boxShadow: '0 2px 8px rgba(27,23,255,0.3)',
  };

  function PortalButton({ label }: { label: React.ReactNode }) {
    return (
      <button onClick={openPortal} disabled={portalLoading} style={{ ...primaryBtn, cursor: portalLoading ? 'wait' : 'pointer', opacity: portalLoading ? 0.7 : 1 }}>
        {portalLoading ? 'Opening…' : label}
      </button>
    );
  }

  return (
    <div className={`${geistSans.variable} ${geistMono.variable}`} style={{ fontFamily: 'var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif' }}>
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
        .btn-white{background:#fff;color:#0A0A14}.btn-white:hover{color:#1B17FF}
        .pagehead{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}
        @media (max-width:639px){
          .pagehead{flex-direction:column;align-items:stretch}
          .card{padding:18px}
        }
        @media (prefers-reduced-motion:reduce){*{animation:none!important}}
      `}</style>
    <div style={{ background: BG, minHeight: '100vh', padding: '28px 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 30, fontWeight: 700, color: NAVY, margin: '0 0 6px', letterSpacing: '-0.035em' }}>Billing</h1>
        {/* ax8r: the page renders no invoice data — the old subtitle promised invoices. */}
        <p style={{ fontSize: 14, color: GRAY, margin: 0 }}>Manage your plan and payment method</p>
      </div>

      <div style={{ maxWidth: 560 }}>
      {state === 'error' && (
        <div className="card dash-card">
          <p style={{ fontSize: 18, fontWeight: 800, color: NAVY, margin: '0 0 8px' }}>Couldn&apos;t load your billing details</p>
          <p style={{ fontSize: 14, color: GRAY, margin: '0 0 20px', lineHeight: 1.6 }}>
            We couldn&apos;t load your plan status. Your subscription is unchanged — this is a loading problem, not a plan change.
          </p>
          <button onClick={() => { setState('loading'); setRetry(r => r + 1); }} style={primaryBtn}>Retry</button>
        </div>
      )}

      {state === 'loading' && (
        <div className="card dash-card">
          <p style={{ fontSize: 14, color: GRAY, margin: 0 }}>Loading your billing details…</p>
        </div>
      )}

      {/* 1 — Stripe not configured */}
      {state === 'not_configured' && (
        <div className="card dash-card">
          <p className="lbl" style={{ marginBottom: 12 }}>Billing</p>
          <p style={{ fontSize: 18, fontWeight: 800, color: NAVY, margin: '0 0 8px' }}>Payments launching soon</p>
          <p style={{ fontSize: 14, color: GRAY, margin: '0 0 20px', lineHeight: 1.6 }}>
            Payments launching soon. You'll be notified when billing is available.
          </p>
          <Link href="/waitlist" style={primaryBtn}>Join Waitlist <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
        </div>
      )}

      {/* 2 — Free / no sub */}
      {state === 'free' && (
        <div className="card dash-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ background: '#F4F3FF', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '4px 14px' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: GRAY }}>Free Plan</span>
            </div>
          </div>
          <p style={{ fontSize: 18, fontWeight: 800, color: NAVY, margin: '0 0 8px' }}>You're on the free plan.</p>
          <p style={{ fontSize: 14, color: GRAY, margin: '0 0 20px', lineHeight: 1.6 }}>
            Upgrade to unlock every AI platform, competitor tracking, and GenAI fix tools.
          </p>
          <Link href="/pricing" style={primaryBtn}>Upgrade to Business <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
        </div>
      )}

      {/* 3 — Active paid sub */}
      {state === 'active' && (
        <div className="card dash-card">
          <p className="lbl" style={{ marginBottom: 16 }}>Current Plan</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 20, fontWeight: 900, color: NAVY }}>{meta.icon} {meta.label}</span>
            {adminPreview ? (
              <span style={{ fontSize: 13, fontWeight: 700, color: GRAY, background: '#F4F3FF', border: `1px solid ${BORDER}`, borderRadius: 100, padding: '3px 12px' }}>
                Complimentary access
              </span>
            ) : (
              <span style={{ fontSize: 13, fontWeight: 700, color: GREEN_DARK, background: GREEN_BG, border: '1px solid #BBF7D0', borderRadius: 100, padding: '3px 12px' }}>
                Status: Active <svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>
              </span>
            )}
          </div>
          <p style={{ fontSize: 28, fontWeight: 900, color: NAVY, margin: '0 0 4px' }}>{meta.price.split('·')[0].trim()}</p>
          <p style={{ fontSize: 13, color: GRAY, margin: '0 0 22px' }}>{adminPreview ? 'No subscription — billing not connected' : 'Next billing: managed in portal'}</p>
          {!adminPreview && <PortalButton label={<>Manage Billing <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>} />}
        </div>
      )}

      {state === 'active' && <RefundSection />}

      {/* 3b — Trialing (b28h): 7-day trial, card on file */}
      {state === 'trialing' && (
        <div className="card dash-card" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
          <p className="lbl" style={{ marginBottom: 16 }}>Free Trial</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 20, fontWeight: 900, color: NAVY }}>{meta.icon} {meta.label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: AMBER, background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 100, padding: '3px 12px' }}>
              Trial
            </span>
          </div>
          <p style={{ fontSize: 18, fontWeight: 800, color: NAVY, margin: '0 0 8px' }}>
            Your free trial ends{trialEndsAt ? ` on ${trialEndDateLabel(trialEndsAt)}` : ''}.
          </p>
          <p style={{ fontSize: 14, color: GRAY, margin: '0 0 8px', lineHeight: 1.6 }}>
            Your card on file will be charged when the trial ends. Cancel anytime before then and you pay nothing.
          </p>
          <p style={{ fontSize: 13, color: GRAY, margin: '0 0 22px' }}>
            Some features are capped during the trial (for example 1 location and a limited number of scans). Start your paid plan now to lift the caps — your card on file is charged today. Covered by the 14-day money-back guarantee once your paid plan starts.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            {!endTrialArmed ? (
              <button onClick={() => setEndTrialArmed(true)} style={{ ...primaryBtn, background: GREEN }}>Start paid plan now</button>
            ) : (
              <>
                <button onClick={endTrialNow} disabled={endTrialLoading} style={{ ...primaryBtn, background: GREEN, cursor: endTrialLoading ? 'wait' : 'pointer', opacity: endTrialLoading ? 0.7 : 1 }}>
                  {endTrialLoading ? 'Starting…' : 'Confirm — charge my card now'}
                </button>
                <button onClick={() => setEndTrialArmed(false)} style={{ ...primaryBtn, background: W, color: NAVY, boxShadow: 'none', border: '1px solid #D9D9E6' }}>
                  Keep my trial
                </button>
              </>
            )}
          </div>
          <PortalButton label={<>Manage Billing <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>} />
        </div>
      )}

      {/* 4 — Payment failed / past due */}
      {state === 'payment_failed' && (
        <div className="card dash-card" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#92400E' }}>{meta.icon} {meta.label}</span>
          </div>
          <p style={{ fontSize: 16, fontWeight: 800, color: '#92400E', margin: '0 0 8px' }}>
            <svg viewBox="0 0 512 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg> Payment failed — please update your payment method
          </p>
          <p style={{ fontSize: 14, color: '#92400E', margin: '0 0 20px', lineHeight: 1.6 }}>
            We couldn't process your last payment. Update your card{graceDeadlineLabel ? ` by ${graceDeadlineLabel}` : ' within 3 days'} to keep your plan active. If payment still hasn't gone through by then, your plan will move to Free — your scans and data stay.
          </p>
          <PortalButton label={<>Update Payment <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>} />
        </div>
      )}

      {state === 'payment_failed' && <RefundSection />}

      {/* 5 — Cancelled */}
      {state === 'cancelled' && (
        <div className="card dash-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ background: '#F4F3FF', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '4px 14px' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: GRAY }}>Cancelled</span>
            </div>
          </div>
          <p style={{ fontSize: 18, fontWeight: 800, color: NAVY, margin: '0 0 8px' }}>Your subscription has ended.</p>
          <p style={{ fontSize: 14, color: GRAY, margin: '0 0 20px', lineHeight: 1.6 }}>
            Reactivate any time to restore full access to your AI visibility tools.
          </p>
          <Link href="/pricing" style={primaryBtn}>Reactivate <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
        </div>
      )}

      {state === 'cancelled' && <RefundSection />}

      {msg && (
        <div style={{ marginTop: 16, background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 12, padding: '12px 14px' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#92400E', margin: 0 }}>{msg}</p>
        </div>
      )}
      </div>
    </div>
    </div>
  );
}
