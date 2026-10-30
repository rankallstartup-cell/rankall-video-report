'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { getBrowserClient } from '@/lib/supabase';
import { normalizePlan, getPlanConfig, isAdminUser } from '@/lib/planConfig';
import { getPlanLabel } from '@/lib/planLabels';
import { usePlan } from '@/lib/usePlan';
import { generateReferralCode } from '@/lib/referralCode';

const BG     = '#F8FAFC';
const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#E2E8F0';
const PURPLE = '#1B17FF';
const GRAY   = '#64748B';
const LGRAY  = '#94A3B8';
const GREEN  = '#059669';
const RED    = '#DC2626';
const BLUE   = '#1B17FF';

type Tab = 'profile' | 'security' | 'plan' | 'integrations' | 'notifications' | 'referrals';

const TABS: { key: Tab; label: string }[] = [
  { key: 'profile',       label: 'Profile' },
  { key: 'security',      label: 'Security' },
  { key: 'plan',          label: 'Plan' },
  { key: 'integrations',  label: 'Integrations' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'referrals',     label: 'Referrals' },
];

const cardStyle: React.CSSProperties = {
  background: W,
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  padding: 28,
  marginBottom: 20,
  maxWidth: 640,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: NAVY,
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 14,
  color: NAVY,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  outline: 'none',
  boxSizing: 'border-box',
  background: W,
};

const primaryBtn: React.CSSProperties = {
  padding: '10px 18px',
  fontSize: 14,
  fontWeight: 600,
  color: W,
  background: PURPLE,
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  padding: '10px 18px',
  fontSize: 14,
  fontWeight: 600,
  color: NAVY,
  background: W,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  cursor: 'pointer',
};

function Msg({ msg }: { msg: { type: 'ok' | 'err'; text: string } | null }) {
  if (!msg) return null;
  return (
    <div
      style={{
        marginTop: 14,
        padding: '8px 12px',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        color: msg.type === 'ok' ? GREEN : RED,
        background: msg.type === 'ok' ? '#ECFDF5' : '#FEF2F2',
      }}
    >
      {msg.text}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      style={{
        width: 44,
        height: 24,
        borderRadius: 999,
        border: 'none',
        cursor: 'pointer',
        background: on ? PURPLE : '#CBD5E1',
        position: 'relative',
        transition: 'background 0.15s',
        flexShrink: 0,
      }}
      aria-pressed={on}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 22 : 2,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: W,
          transition: 'left 0.15s',
          boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
        }}
      />
    </button>
  );
}

// ── Cancel / Retention flow (ported from the legacy dashboard/settings page) ──
type CancelReason =
  | 'too_expensive'
  | 'no_results'
  | 'missing_feature'
  | 'switching_competitor'
  | 'just_testing'
  | 'other'
  | '';

type ModalStep = 1 | 2 | 3 | 4;

interface AccountStats {
  monthsActive: number;
  improvementRecords: number;
  scansRun: number;
  tracksCompetitor: boolean;
}

const REASONS: { value: CancelReason; label: string }[] = [
  { value: 'too_expensive',        label: 'Too expensive'                },
  { value: 'no_results',           label: 'Not seeing results yet'       },
  { value: 'missing_feature',      label: 'Missing a feature I need'     },
  { value: 'switching_competitor', label: 'Switching to a competitor'    },
  { value: 'just_testing',         label: 'Just testing, not ready yet'  },
  { value: 'other',                label: 'Other'                        },
];

function RetentionModal({
  onClose,
  onCancelled,
  businessName,
  accountStats,
}: {
  onClose: () => void;
  onCancelled: () => void;
  userId: string;
  userEmail: string;
  businessName: string;
  accountStats: AccountStats;
}) {
  const [step, setStep]           = useState<ModalStep>(1);
  const [reason, setReason]       = useState<CancelReason>('');
  const [feedback, setFeedback]   = useState('');
  const [featureReq, setFeatureReq] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');
  const [pausedDone, setPausedDone] = useState(false);

  // Pause the account for 30 days via the API. The confirmation screen
  // shows ONLY when the API actually paused the account — the old code
  // showed "paused" even when the request failed.
  async function handlePause() {
    setSubmitting(true);
    setModalError('');
    try {
      const res = await fetch('/api/user/pause-subscription', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setModalError(data?.message || 'Could not pause your account. Please try again or contact support.');
        return;
      }
      setPausedDone(true);
    } catch {
      setModalError('Could not pause your account. Please try again or contact support.');
    } finally {
      setSubmitting(false);
    }
  }

  // Cancel for real. The "cancelled" banner shows ONLY when the API
  // confirms the cancellation — the old code claimed success even when
  // the request failed.
  async function confirmCancel() {
    setSubmitting(true);
    setModalError('');
    try {
      const res = await fetch('/api/cancel-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The server derives the user from the session — no user ids sent.
        body: JSON.stringify({
          businessName,
          reason, feedback: feedback || featureReq || '',
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setModalError(data?.message || 'Cancellation failed. Your subscription was NOT cancelled. Please try again or contact support.');
        return;
      }
      onCancelled();
    } catch {
      setModalError('Cancellation failed. Your subscription was NOT cancelled. Please try again or contact support.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleAcceptOffer() {
    onClose();
  }

  // Whether the offer the user just saw was already a pause offer (so the pause
  // fallback would be redundant): both 'just_testing' and 'too_expensive'
  // show the pause offer at step 3.
  const offerWasPause = reason === 'just_testing' || reason === 'too_expensive';

  // Submit the typed feature request for real (POST /api/feedback emails it
  // to the team). The old button just closed the modal and DISCARDED the text.
  async function submitFeedback() {
    if (!featureReq.trim()) return;
    setSubmitting(true);
    setModalError('');
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'feature_request', text: featureReq }),
      });
      if (!res.ok) throw new Error('feedback failed');
      onClose();
    } catch {
      setModalError('Could not send your feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // "Cancel anyway": give one last pause fallback UNLESS they already saw a pause
  // offer, in which case cancel for real.
  function handleCancelAttempt() {
    if (offerWasPause) confirmCancel();
    else setStep(4);
  }

  // Step 1: what you'll lose (loss aversion).
  const lossItems = [
    { icon: <svg viewBox="0 0 448 512" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M128 0c17.7 0 32 14.3 32 32l0 32 128 0 0-32c0-17.7 14.3-32 32-32s32 14.3 32 32l0 32 48 0c26.5 0 48 21.5 48 48l0 48L0 160l0-48C0 85.5 21.5 64 48 64l48 0 0-32c0-17.7 14.3-32 32-32zM0 192l448 0 0 272c0 26.5-21.5 48-48 48L48 512c-26.5 0-48-21.5-48-48L0 192zm64 80l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0c-8.8 0-16 7.2-16 16zm128 0l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0c-8.8 0-16 7.2-16 16zm144-16c-8.8 0-16 7.2-16 16l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0zM64 400l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0c-8.8 0-16 7.2-16 16zm144-16c-8.8 0-16 7.2-16 16l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0zm112 16l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0c-8.8 0-16 7.2-16 16z"/></svg>, text: `${accountStats.monthsActive} month${accountStats.monthsActive !== 1 ? 's' : ''} of AI visibility score history` },
    { icon: <svg viewBox="0 0 576 512" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M384 160c-17.7 0-32-14.3-32-32s14.3-32 32-32l160 0c17.7 0 32 14.3 32 32l0 160c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-82.7L342.6 374.6c-12.5 12.5-32.8 12.5-45.3 0L192 269.3 54.6 406.6c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3l160-160c12.5-12.5 32.8-12.5 45.3 0L320 306.7 466.7 160 384 160z"/></svg>, text: `${accountStats.improvementRecords} verified improvement record${accountStats.improvementRecords !== 1 ? 's' : ''}` },
    { icon: <svg viewBox="0 0 512 512" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M463.5 224l8.5 0c13.3 0 24-10.7 24-24l0-128c0-9.7-5.8-18.5-14.8-22.2s-19.3-1.7-26.2 5.2L413.4 96.6c-87.6-86.5-228.7-86.2-315.8 1c-87.5 87.5-87.5 229.3 0 316.8s229.3 87.5 316.8 0c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0c-62.5 62.5-163.8 62.5-226.3 0s-62.5-163.8 0-226.3c62.2-62.2 162.7-62.5 225.3-1L327 183c-6.9 6.9-8.9 17.2-5.2 26.2s12.5 14.8 22.2 14.8l119.5 0z"/></svg>, text: 'Automatic verification rescans after you apply a fix' },
    { icon: <svg viewBox="0 0 640 512" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M384 32l128 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L398.4 96c-5.2 25.8-22.9 47.1-46.4 57.3L352 448l160 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-192 0-192 0c-17.7 0-32-14.3-32-32s14.3-32 32-32l160 0 0-294.7c-23.5-10.3-41.2-31.6-46.4-57.3L128 96c-17.7 0-32-14.3-32-32s14.3-32 32-32l128 0c14.6-19.4 37.8-32 64-32s49.4 12.6 64 32zm55.6 288l144.9 0L512 195.8 439.6 320zM512 416c-62.9 0-115.2-34-126-78.9c-2.6-11 1-22.3 6.7-32.1l95.2-163.2c5-8.6 14.2-13.8 24.1-13.8s19.1 5.3 24.1 13.8l95.2 163.2c5.7 9.8 9.3 21.1 6.7 32.1C627.2 382 574.9 416 512 416zM126.8 195.8L54.4 320l144.9 0L126.8 195.8zM.9 337.1c-2.6-11 1-22.3 6.7-32.1l95.2-163.2c5-8.6 14.2-13.8 24.1-13.8s19.1 5.3 24.1 13.8l95.2 163.2c5.7 9.8 9.3 21.1 6.7 32.1C242 382 189.7 416 126.8 416S11.7 382 .9 337.1z"/></svg>, text: accountStats.tracksCompetitor ? 'Your competitor tracking data and gap analysis' : 'Competitor monitoring and gap analysis' },
    { icon: <svg viewBox="0 0 512 512" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M48 64C21.5 64 0 85.5 0 112c0 15.1 7.1 29.3 19.2 38.4L236.8 313.6c11.4 8.5 27 8.5 38.4 0L492.8 150.4c12.1-9.1 19.2-23.3 19.2-38.4c0-26.5-21.5-48-48-48L48 64zM0 176L0 384c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-208L294.4 339.2c-22.8 17.1-54 17.1-76.8 0L0 176z"/></svg>, text: 'Weekly AI Visibility Report emails' },
  ];

  const step1 = (
    <div>
      <p style={{ fontSize: 11, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Step 1 of 3</p>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: NAVY, marginBottom: 6 }}>Before you go…</h2>
      <p style={{ fontSize: 14, color: GRAY, marginBottom: 16 }}>If you cancel today you will lose:</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {lossItems.map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, padding: '11px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#7F1D1D' }}>{item.text}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onClose} style={{ flex: 1, background: BLUE, border: 'none', borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 700, color: W, cursor: 'pointer', fontFamily: 'inherit' }}>
          Keep my account
        </button>
        <button onClick={() => setStep(2)} style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '13px 20px', fontSize: 14, fontWeight: 600, color: GRAY, cursor: 'pointer', fontFamily: 'inherit' }}>
          Continue to cancel
        </button>
      </div>
    </div>
  );

  // Step 2: reason selection.
  const step2 = (
    <div>
      <p style={{ fontSize: 11, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Step 2 of 3</p>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: NAVY, marginBottom: 6 }}>Help us understand</h2>
      <p style={{ fontSize: 14, color: GRAY, marginBottom: 24 }}>Your feedback helps us improve (optional).</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
        {REASONS.map(r => (
          <button
            key={r.value}
            onClick={() => setReason(r.value)}
            style={{
              background: reason === r.value ? '#ECEBFF' : W,
              border: `1.5px solid ${reason === r.value ? BLUE : BORDER}`,
              borderRadius: 10, padding: '13px 16px',
              fontSize: 14, fontWeight: reason === r.value ? 700 : 500,
              color: reason === r.value ? BLUE : NAVY,
              cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all 0.15s',
            }}
          >
            {reason === r.value ? '● ' : '○ '}{r.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => setStep(1)} style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '13px 20px', fontSize: 14, fontWeight: 600, color: GRAY, cursor: 'pointer', fontFamily: 'inherit' }}>
          Back
        </button>
        <button onClick={() => { if (reason) { setStep(3); } }}
          disabled={!reason}
          style={{ flex: 1, background: reason ? NAVY : BORDER, border: 'none', borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 700, color: reason ? W : LGRAY, cursor: reason ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}
        >
          Continue <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></button>
      </div>
    </div>
  );

  // Step 3: retention offer keyed on the reason.
  const offerContent: Record<CancelReason, React.ReactNode> = {
    too_expensive: (
      <div>
        <div style={{ background: '#ECEBFF', border: '1.5px solid #C9C6FF', borderRadius: 14, padding: '20px 22px', marginBottom: 20 }}>
          <p style={{ fontSize: 16, fontWeight: 800, color: NAVY, marginBottom: 6 }}>Pause for 30 days instead</p>
          <p style={{ fontSize: 13, color: GRAY, lineHeight: 1.6 }}>Pause your account for 30 days with no charge (paid features pause too). Your data, fixes and score history stay safe — resume anytime. Available once every 6 months.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handlePause} disabled={submitting} style={{ flex: 1, background: BLUE, border: 'none', borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 700, color: W, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: submitting ? 0.6 : 1 }}>{submitting ? 'Pausing…' : (<>Pause for 30 days <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>)}</button>
          <button onClick={handleCancelAttempt} disabled={submitting} style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '13px 16px', fontSize: 13, fontWeight: 600, color: RED, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: submitting ? 0.6 : 1 }}>{submitting ? 'Cancelling…' : 'Cancel anyway'}</button>
        </div>
      </div>
    ),
    just_testing: (
      <div>
        <div style={{ background: '#ECEBFF', border: '1.5px solid #C9C6FF', borderRadius: 14, padding: '20px 22px', marginBottom: 20 }}>
          <p style={{ fontSize: 16, fontWeight: 800, color: NAVY, marginBottom: 6 }}>Pause for 30 days instead</p>
          <p style={{ fontSize: 13, color: GRAY, lineHeight: 1.6 }}>Pause your account for 30 days with no charge (paid features pause too). Your data, fixes and score history stay safe. Resume anytime. Available once every 6 months.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handlePause} disabled={submitting} style={{ flex: 1, background: BLUE, border: 'none', borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 700, color: W, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: submitting ? 0.6 : 1 }}>{submitting ? 'Pausing…' : (<>Pause for 30 days <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>)}</button>
          <button onClick={handleCancelAttempt} disabled={submitting} style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '13px 16px', fontSize: 13, fontWeight: 600, color: RED, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: submitting ? 0.6 : 1 }}>{submitting ? 'Cancelling…' : 'Cancel anyway'}</button>
        </div>
      </div>
    ),
    missing_feature: (
      <div>
        <p style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 12 }}>What feature do you need?</p>
        <textarea
          value={featureReq}
          onChange={e => setFeatureReq(e.target.value)}
          placeholder="Describe the feature you're looking for…"
          rows={4}
          style={{ width: '100%', border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px', fontSize: 14, color: NAVY, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box', marginBottom: 16 }}
        />
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={submitFeedback} disabled={!featureReq.trim() || submitting} style={{ flex: 1, background: featureReq.trim() ? BLUE : BORDER, border: 'none', borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 700, color: featureReq.trim() ? W : LGRAY, cursor: featureReq.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>{submitting ? 'Sending…' : 'Submit feedback'} <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></button>
          <button onClick={handleCancelAttempt} disabled={submitting} style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '13px 16px', fontSize: 13, fontWeight: 600, color: RED, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: submitting ? 0.6 : 1 }}>{submitting ? 'Cancelling…' : 'Cancel anyway'}</button>
        </div>
      </div>
    ),
    no_results: (
      <div>
        <div style={{ background: '#ECEBFF', border: '1.5px solid #C9C6FF', borderRadius: 14, padding: '20px 22px', marginBottom: 20 }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: NAVY, marginBottom: 8 }}>Give it 30 more days</p>
          <p style={{ fontSize: 13, color: GRAY, lineHeight: 1.6 }}>Users who apply their top 3 fixes see an average +32 point improvement in 30 days. Stay and let us help you get there.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handleAcceptOffer} style={{ flex: 1, background: BLUE, border: 'none', borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 700, color: W, cursor: 'pointer', fontFamily: 'inherit' }}>I&apos;ll give it 30 more days <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></button>
          <button onClick={handleCancelAttempt} disabled={submitting} style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '13px 16px', fontSize: 13, fontWeight: 600, color: RED, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: submitting ? 0.6 : 1 }}>{submitting ? 'Cancelling…' : 'Cancel anyway'}</button>
        </div>
      </div>
    ),
    switching_competitor: (
      <div>
        <div style={{ background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '20px 22px', marginBottom: 20 }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: NAVY, marginBottom: 8 }}>Before you switch</p>
          <p style={{ fontSize: 13, color: GRAY, lineHeight: 1.6 }}>Rankall queries ChatGPT, Gemini, Perplexity and 9 more in real time — and hands you ready-to-paste fix content. Most tools only show predictions.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handleAcceptOffer} style={{ flex: 1, background: NAVY, border: 'none', borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 700, color: W, cursor: 'pointer', fontFamily: 'inherit' }}>Stay and see results <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></button>
          <button onClick={handleCancelAttempt} disabled={submitting} style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '13px 16px', fontSize: 13, fontWeight: 600, color: RED, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: submitting ? 0.6 : 1 }}>{submitting ? 'Cancelling…' : 'Cancel anyway'}</button>
        </div>
      </div>
    ),
    other: (
      <div>
        <div style={{ background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '20px 22px', marginBottom: 16 }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: NAVY, marginBottom: 6 }}>We&apos;re sorry to see you go</p>
          <p style={{ fontSize: 13, color: GRAY, lineHeight: 1.6 }}>Your data will be available for 30 days after cancellation.</p>
        </div>
        <textarea
          value={feedback}
          onChange={e => setFeedback(e.target.value)}
          placeholder="Anything we could have done better? (optional)"
          rows={3}
          style={{ width: '100%', border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px', fontSize: 14, color: NAVY, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box', marginBottom: 16 }}
        />
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, background: BLUE, border: 'none', borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 700, color: W, cursor: 'pointer', fontFamily: 'inherit' }}>Keep my account</button>
          <button onClick={handleCancelAttempt} disabled={submitting} style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 10, padding: '13px 16px', fontSize: 13, fontWeight: 700, color: RED, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: submitting ? 0.6 : 1 }}>{submitting ? 'Cancelling…' : 'Cancel my account'}</button>
        </div>
      </div>
    ),
    '': <></>,
  };

  const step3 = (
    <div>
      <p style={{ fontSize: 11, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Step 3 of 3</p>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: NAVY, marginBottom: 20 }}>One last thing…</h2>
      {offerContent[reason]}
    </div>
  );

  // Step 4: final pause fallback — shown after "Cancel anyway" if the user hasn't
  // already been offered a pause. Only "No thanks" runs the actual cancellation.
  const step4 = (
    <div>
      <p style={{ fontSize: 11, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>One last thing…</p>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: NAVY, marginBottom: 12 }}>Pause instead of cancel?</h2>
      <div style={{ background: '#ECEBFF', border: '1.5px solid #C9C6FF', borderRadius: 14, padding: '20px 22px', marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: GRAY, lineHeight: 1.6, margin: 0 }}>
          Instead of cancelling, pause your account for 30 days (paid features pause too). Your score history, fixes, and data stay safe. Resume anytime with one click. Available once every 6 months.
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button onClick={handlePause} disabled={submitting} style={{ background: BLUE, border: 'none', borderRadius: 10, padding: '14px', fontSize: 14, fontWeight: 700, color: W, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: submitting ? 0.6 : 1 }}>
          {submitting ? 'Pausing…' : 'Pause for 30 days'}
        </button>
        <button onClick={confirmCancel} disabled={submitting} style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 700, color: RED, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: submitting ? 0.6 : 1 }}>
          {submitting ? 'Cancelling…' : 'No thanks, cancel my account'}
        </button>
      </div>
    </div>
  );

  // Paused confirmation — replaces the step flow once the account is paused.
  const pausedScreen = (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 44, marginBottom: 12, color: NAVY, display:'flex', justifyContent:'center' }}><svg viewBox="0 0 320 512" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M48 64C21.5 64 0 85.5 0 112L0 400c0 26.5 21.5 48 48 48l32 0c26.5 0 48-21.5 48-48l0-288c0-26.5-21.5-48-48-48L48 64zm192 0c-26.5 0-48 21.5-48 48l0 288c0 26.5 21.5 48 48 48l32 0c26.5 0 48-21.5 48-48l0-288c0-26.5-21.5-48-48-48l-32 0z"/></svg></div>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: NAVY, marginBottom: 10 }}>Account paused</h2>
      <p style={{ fontSize: 14, color: GRAY, lineHeight: 1.6, marginBottom: 24 }}>
        Your account is paused for 30 days. You won&apos;t be charged, paid features are paused, and your data is safe. Resume anytime from your dashboard.
      </p>
      <button onClick={() => { onClose(); window.location.reload(); }} style={{ background: BLUE, border: 'none', borderRadius: 10, padding: '13px 28px', fontSize: 14, fontWeight: 700, color: W, cursor: 'pointer', fontFamily: 'inherit' }}>
        Got it
      </button>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget && !pausedDone) onClose(); }}
    >
      <div style={{ background: W, borderRadius: 20, padding: '32px 28px', maxWidth: 480, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.25)', maxHeight: '90vh', overflowY: 'auto' }}>
        {pausedDone ? pausedScreen : (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
              {[1, 2, 3].map(s => (
                <div key={s} style={{ height: 4, flex: 1, borderRadius: 100, background: step >= s ? NAVY : BORDER, transition: 'background 0.3s' }} />
              ))}
            </div>
            {modalError && (
              <p style={{ fontSize: 13, fontWeight: 600, color: RED, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 12px', marginBottom: 16 }}>{modalError}</p>
            )}
            {step === 1 && step1}
            {step === 2 && step2}
            {step === 3 && step3}
            {step === 4 && step4}
          </>
        )}
      </div>
    </div>
  );
}

function CancelledBanner() {
  return (
    <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 14, padding: '20px 24px', marginBottom: 16, maxWidth: 640 }}>
      <p style={{ fontSize: 15, fontWeight: 700, color: RED, marginBottom: 4 }}>Subscription cancelled</p>
      <p style={{ fontSize: 13, color: GRAY }}>Your subscription will not renew. You keep full access until the end of your current billing period (or trial) and won&apos;t be charged again. A confirmation email is on its way.</p>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const supabase = getBrowserClient();
  const { plan: effectivePlan, rawPlan, userEmail: planEmail } = usePlan();
  const settingsIsAdmin = isAdminUser(planEmail);
  const resolvedPlan = settingsIsAdmin ? rawPlan : effectivePlan;

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>('profile');

  // Profile
  const [fullName, setFullName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarPreview, setAvatarPreview] = useState('');
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Security
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwMsg, setPwMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  // Plan / cancellation
  const [showCancel, setShowCancel] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [accountStats, setAccountStats] = useState<AccountStats>({
    monthsActive: 1, improvementRecords: 0, scansRun: 1, tracksCompetitor: false,
  });
  // (usage fetch effect defined below, after user state is available)

  // Usage
  type UsageRow = { used: number; limit: number; remaining: number };
  const [usage, setUsage] = useState<Record<string, UsageRow> | null>(null);
  const [usageError, setUsageError] = useState(false);
  const [usageLoading, setUsageLoading] = useState(false);

  // Fetch usage summary when the Plan tab opens.
  useEffect(() => {
    if (tab !== 'plan' || !user?.id || usage || usageLoading) return;
    let active = true;
    (async () => {
      setUsageLoading(true);
      setUsageError(false);
      try {
        const res = await fetch(`/api/usage/summary?userId=${encodeURIComponent(user.id)}`);
        if (!res.ok) throw new Error('failed');
        const json = await res.json();
        if (!active) return;
        if (json?.summary) setUsage(json.summary as Record<string, UsageRow>);
        else setUsageError(true);
      } catch {
        if (active) setUsageError(true);
      } finally {
        if (active) setUsageLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, user?.id]);

  const USAGE_LABELS: { key: string; label: string }[] = [
    { key: 'local_scan', label: 'Local Scans' },
    { key: 'personal_scan', label: 'Personal Scans' },
    { key: 'ai_inbox', label: 'AI Inbox' },
    { key: 'competitor_scan', label: 'Competitor Scans' },
    { key: 'simulator', label: 'Simulator' },
    { key: 'demo_generation', label: 'Demo Generation' },
  ];

  const usageResetDate = (() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  })();

  // Notifications
  const [prefs, setPrefs] = useState({
    weekly_report: true,
    competitor_alerts: true,
    milestone_emails: true,
    fix_recommendations: true,
    marketing_emails: false,
  });
  const [prefsMsg, setPrefsMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [prefsSaving, setPrefsSaving] = useState(false);

  // Referrals
  const [copied, setCopied] = useState(false);
  const [refStats, setRefStats] = useState({ clicks: 0, signups: 0, active: 0, earnings: 0 });

  // Integrations — Google Business Profile connection status.
  const [gbp, setGbp] = useState<{ connected: boolean; pending: boolean; locationName?: string } | null>(null);
  const [gbpLoading, setGbpLoading] = useState(false);

  useEffect(() => {
    if (tab !== 'integrations' || !user?.id || gbp || gbpLoading) return;
    let active = true;
    (async () => {
      setGbpLoading(true);
      try {
        const res = await fetch('/api/integrations/google-business-profile/status');
        const json = await res.json();
        if (active) setGbp(json?.error ? { connected: false, pending: false } : { connected: !!json.connected, pending: !!json.pending, locationName: json.locationName });
      } catch {
        if (active) setGbp({ connected: false, pending: false });
      } finally {
        if (active) setGbpLoading(false);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, user?.id]);

  async function disconnectGbp() {
    try {
      await fetch('/api/integrations/google-business-profile', { method: 'DELETE' });
      setGbp({ connected: false, pending: false });
    } catch { /* leave state as-is */ }
  }

  // Integrations — Google Analytics connection status.
  const [ga4, setGa4] = useState<{ connected: boolean; propertyName?: string } | null>(null);
  const [ga4Loading, setGa4Loading] = useState(false);

  useEffect(() => {
    if (tab !== 'integrations' || !user?.id || ga4 || ga4Loading) return;
    let active = true;
    (async () => {
      setGa4Loading(true);
      try {
        const res = await fetch('/api/integrations/google-analytics/status');
        const json = await res.json();
        if (active) setGa4(json?.error ? { connected: false } : { connected: !!json.connected, propertyName: json.propertyName });
      } catch {
        if (active) setGa4({ connected: false });
      } finally {
        if (active) setGa4Loading(false);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, user?.id]);

  async function disconnectGa4() {
    try {
      await fetch('/api/integrations/google-analytics', { method: 'DELETE' });
      setGa4({ connected: false });
    } catch { /* leave state as-is */ }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data?.user) {
          router.replace('/login');
          return;
        }
        if (!active) return;
        const u = data.user;
        setUser(u);
        setFullName((u.user_metadata?.full_name as string) || '');
        const av = (u.user_metadata?.avatar_url as string) || '';
        setAvatarUrl(av);
        setAvatarPreview(av);

        // Account stats for the retention modal's loss-aversion copy.
        try {
          const [scansRes, improvRes] = await Promise.all([
            supabase.from('rankall_scans').select('created_at').eq('user_id', u.id).order('created_at', { ascending: true }),
            supabase.from('rankall_scans').select('id').eq('user_id', u.id).not('verified_improvement', 'is', null),
          ]);
          if (active) {
            const scansArr = scansRes.data ?? [];
            const improvements = improvRes.data ?? [];
            const firstScan = scansArr[0]?.created_at ? new Date(scansArr[0].created_at) : new Date();
            const monthsActive = Math.max(1, Math.round((Date.now() - firstScan.getTime()) / (1000 * 60 * 60 * 24 * 30)));
            setAccountStats({
              monthsActive,
              improvementRecords: improvements.length,
              scansRun: scansArr.length,
              tracksCompetitor: scansArr.length > 0,
            });
          }
        } catch { /* stats are best-effort */ }

        // Load notification preferences (resilient)
        try {
          const { data: prefRow } = await supabase
            .from('user_preferences')
            .select('*')
            .eq('user_id', u.id)
            .maybeSingle();
          if (active && prefRow) {
            setPrefs({
              weekly_report:       prefRow.weekly_report       ?? true,
              competitor_alerts:   prefRow.competitor_alerts   ?? true,
              milestone_emails:    prefRow.milestone_emails    ?? true,
              fix_recommendations: prefRow.fix_recommendations ?? true,
              marketing_emails:    prefRow.marketing_emails    ?? false,
            });
          }
        } catch {
          /* table may not exist — keep defaults */
        }

        // Load referral stats (resilient). Conversions come from referral_conversions;
        // click count comes from referral_clicks (both keyed off the referrer).
        try {
          const { data: refRows } = await supabase
            .from('referral_conversions')
            .select('*')
            .eq('referrer_user_id', u.id);
          const { count: clickCount } = await supabase
            .from('referral_clicks')
            .select('*', { count: 'exact', head: true })
            .eq('ref_code', u.id.replace(/-/g, '').slice(0, 8).toUpperCase());
          if (active && Array.isArray(refRows) && refRows.length > 0) {
            const signups = refRows.length;
            const activeCount = refRows.filter((r: any) => r.status === 'active').length;
            const earnings = refRows.reduce((s: number, r: any) => s + (Number(r.commission) || 0), 0);
            setRefStats({ clicks: clickCount ?? 0, signups, active: activeCount, earnings });
          } else if (active && typeof clickCount === 'number' && clickCount > 0) {
            setRefStats(prev => ({ ...prev, clicks: clickCount }));
          }
        } catch {
          /* tables may not exist yet — keep zeros */
        }
      } catch {
        router.replace('/login');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Profile actions ----
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setProfileMsg(null);
    // local preview
    const localUrl = URL.createObjectURL(file);
    setAvatarPreview(localUrl);
    setUploading(true);
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const path = `${user.id}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = `${pub.publicUrl}?t=${Date.now()}`;
      setAvatarUrl(publicUrl);
      setAvatarPreview(publicUrl);
      setProfileMsg({ type: 'ok', text: 'Photo uploaded — click Save Profile to keep it.' });
    } catch (err: any) {
      setProfileMsg({ type: 'err', text: err?.message || 'Photo upload failed.' });
    } finally {
      setUploading(false);
    }
  }

  async function saveProfile() {
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: fullName, avatar_url: avatarUrl },
      });
      if (error) throw error;
      setProfileMsg({ type: 'ok', text: 'Profile saved ✓' });
    } catch (err: any) {
      setProfileMsg({ type: 'err', text: err?.message || 'Could not save profile.' });
    } finally {
      setProfileSaving(false);
    }
  }

  // ---- Security ----
  async function updatePassword() {
    setPwMsg(null);
    if (newPw.length < 8) {
      setPwMsg({ type: 'err', text: 'Password must be at least 8 characters.' });
      return;
    }
    if (newPw !== confirmPw) {
      setPwMsg({ type: 'err', text: 'Passwords do not match.' });
      return;
    }
    setPwSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;
      setNewPw('');
      setConfirmPw('');
      setPwMsg({ type: 'ok', text: 'Password updated ✓' });
    } catch (err: any) {
      setPwMsg({ type: 'err', text: err?.message || 'Could not update password.' });
    } finally {
      setPwSaving(false);
    }
  }

  // ---- Notifications ----
  async function savePrefs() {
    if (!user) return;
    setPrefsSaving(true);
    setPrefsMsg(null);
    try {
      const { error } = await supabase.from('user_preferences').upsert(
        {
          user_id: user.id,
          weekly_report: prefs.weekly_report,
          competitor_alerts: prefs.competitor_alerts,
          milestone_emails: prefs.milestone_emails,
          fix_recommendations: prefs.fix_recommendations,
          marketing_emails: prefs.marketing_emails,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
      if (error) throw error;
      setPrefsMsg({ type: 'ok', text: 'Saved ✓' });
    } catch (err: any) {
      setPrefsMsg({ type: 'err', text: err?.message || 'Could not save preferences.' });
    } finally {
      setPrefsSaving(false);
    }
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: BG,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: GRAY,
          fontSize: 15,
        }}
      >
        Loading your settings…
      </div>
    );
  }

  if (!user) return null;

  const email = user.email || '';
  const initial = (fullName || email || '?').trim().charAt(0).toUpperCase();
  const plan = resolvedPlan;
  const cfg = getPlanConfig(plan);
  const isTopTier = plan === 'agency' || plan === 'enterprise';
  const refCode = generateReferralCode(user.id);
  // b8a9 (found via the /dashboard/settings test): the referral link was
  // hardcoded to the production domain and scheme-less — a share copied
  // from staging (or any preview) pointed at prod. Use the current
  // origin, the same fix the /referrals page got in b8b3. The code is
  // already the canonical UPPERCASE form from generateReferralCode.
  const refLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/?ref=${refCode}`;

  const planFeatures = [
    `${cfg.scansPerMonth ?? cfg.scansPerDay} scans / ${cfg.scansPerMonth ? 'month' : 'day'}`,
    cfg.canSeeFixes || cfg.canSeeEverything ? 'AI Fix Engine' : null,
    cfg.canSeeCompetitors || cfg.canSeeEverything ? 'Competitor Intelligence' : null,
    cfg.canSeeSEOHealth || cfg.canSeeEverything ? 'SEO Health Autopilot' : null,
    cfg.canSeeAgency || cfg.canSeeEverything ? 'Agency / multi-client tools' : null,
  ].filter(Boolean) as string[];

  return (
    <div style={{ minHeight: '100vh', background: BG, padding: '36px 24px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {/* Header */}
        <h1 style={{ fontSize: 26, fontWeight: 700, color: NAVY, margin: '0 0 4px' }}>
          Account Settings
        </h1>
        <p style={{ fontSize: 14, color: GRAY, margin: '0 0 24px' }}>{email}</p>

        {/* Tab bar */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            borderBottom: `1px solid ${BORDER}`,
            marginBottom: 28,
            flexWrap: 'wrap',
          }}
        >
          {TABS.map((t) => {
            const activeTab = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                style={{
                  padding: '10px 16px',
                  fontSize: 14,
                  fontWeight: 600,
                  color: activeTab ? PURPLE : GRAY,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${activeTab ? PURPLE : 'transparent'}`,
                  cursor: 'pointer',
                  marginBottom: -1,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* PROFILE */}
        {tab === 'profile' && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: '50%',
                  background: avatarPreview ? `#fff` : PURPLE,
                  backgroundImage: avatarPreview ? `url(${avatarPreview})` : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  color: W,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                  fontWeight: 700,
                  flexShrink: 0,
                  border: `1px solid ${BORDER}`,
                }}
              >
                {!avatarPreview && initial}
              </div>
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFile}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  style={secondaryBtn}
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? 'Uploading…' : 'Upload Photo'}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>Full Name</label>
              <input
                style={inputStyle}
                placeholder="Your full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: 22 }}>
              <label style={labelStyle}>Email</label>
              <input style={{ ...inputStyle, background: BG, color: GRAY }} value={email} readOnly />
              <p style={{ fontSize: 12, color: LGRAY, margin: '6px 0 0' }}>
                Contact support to change email
              </p>
            </div>

            <button type="button" style={primaryBtn} disabled={profileSaving} onClick={saveProfile}>
              {profileSaving ? 'Saving…' : 'Save Profile'}
            </button>
            <Msg msg={profileMsg} />
          </div>
        )}

        {/* SECURITY */}
        {tab === 'security' && (
          <div style={cardStyle}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: NAVY, margin: '0 0 18px' }}>
              Change Password
            </h2>
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>New Password</label>
              <input
                style={inputStyle}
                type="password"
                placeholder="At least 8 characters"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
              />
            </div>
            <div style={{ marginBottom: 22 }}>
              <label style={labelStyle}>Confirm Password</label>
              <input
                style={inputStyle}
                type="password"
                placeholder="Re-enter new password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
              />
            </div>
            <button type="button" style={primaryBtn} disabled={pwSaving} onClick={updatePassword}>
              {pwSaving ? 'Updating…' : 'Update Password'}
            </button>
            <Msg msg={pwMsg} />
          </div>
        )}

        {/* PLAN */}
        {tab === 'plan' && cancelled && <CancelledBanner />}

        {tab === 'plan' && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div
                  style={{
                    display: 'inline-block',
                    padding: '3px 10px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 700,
                    color: cfg.badgeColor,
                    background: cfg.badgeBg,
                    marginBottom: 8,
                  }}
                >
                  {getPlanLabel(normalizePlan(rawPlan))}
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: NAVY, margin: '0 0 4px' }}>
                  {getPlanLabel(normalizePlan(rawPlan))} Plan
                </h2>
              </div>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: GREEN,
                  background: '#ECFDF5',
                  padding: '4px 10px',
                  borderRadius: 999,
                }}
              >
                Active
              </span>
            </div>

            <ul style={{ margin: '16px 0 18px', padding: 0, listStyle: 'none' }}>
              {planFeatures.map((f) => (
                <li
                  key={f}
                  style={{ fontSize: 14, color: NAVY, padding: '4px 0', display: 'flex', gap: 8 }}
                >
                  <span style={{ color: GREEN, display:'inline-flex' }}><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg></span> {f}
                </li>
              ))}
            </ul>

            <p style={{ fontSize: 13, color: GRAY, margin: '0 0 20px' }}>
              Next billing date — available when billing is live.
            </p>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {!isTopTier && (
                <button
                  type="button"
                  style={primaryBtn}
                  onClick={() => router.push('/pricing')}
                >
                  Upgrade Plan <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></button>
              )}
              <button
                type="button"
                style={secondaryBtn}
                title="Stripe customer portal coming when billing is live"
                onClick={() => router.push('/dashboard/billing')}
              >
                Manage Billing <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></button>
              {/* b8b9: a Free account has no subscription to cancel —
                  showing "Cancel Plan" on Free was confusing. */}
              {normalizePlan(rawPlan) !== 'free' && (
                <button
                  type="button"
                  style={{ ...secondaryBtn, color: RED, borderColor: '#FECACA' }}
                  onClick={() => setShowCancel(true)}
                >
                  Cancel Plan
                </button>
              )}
            </div>
          </div>
        )}

        {/* USAGE THIS MONTH */}
        {tab === 'plan' && (
          <div style={cardStyle}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: NAVY, margin: '0 0 4px' }}>
              Your Usage This Month
            </h2>
            <p style={{ fontSize: 13, color: GRAY, margin: '0 0 18px' }}>
              Resets: {usageResetDate}
            </p>

            {usageError ? (
              <p style={{ fontSize: 14, color: GRAY, margin: 0 }}>Usage data unavailable</p>
            ) : usageLoading || !usage ? (
              <p style={{ fontSize: 14, color: GRAY, margin: 0 }}>Loading usage…</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: GRAY }}>
                    <th style={{ padding: '8px 0', fontWeight: 600 }}>Feature</th>
                    <th style={{ padding: '8px 0', fontWeight: 600, textAlign: 'right' }}>Used</th>
                    <th style={{ padding: '8px 0', fontWeight: 600, textAlign: 'right' }}>Limit</th>
                    <th style={{ padding: '8px 0 8px 16px', fontWeight: 600, width: '34%' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {USAGE_LABELS.map(({ key, label }) => {
                    const row = usage[key] || { used: 0, limit: 0, remaining: 0 };
                    const unlimited = row.limit >= 999999;
                    const notOnPlan = row.limit === 0;
                    const pct = unlimited || notOnPlan
                      ? 0
                      : Math.min(100, Math.round((row.used / row.limit) * 100));
                    return (
                      <tr key={key} style={{ borderTop: `1px solid ${BORDER}` }}>
                        <td style={{ padding: '10px 0', color: NAVY, fontWeight: 600 }}>{label}</td>
                        <td style={{ padding: '10px 0', textAlign: 'right', color: NAVY }}>
                          {notOnPlan ? '—' : row.used}
                        </td>
                        <td style={{ padding: '10px 0', textAlign: 'right', color: GRAY }}>
                          {unlimited ? 'Unlimited' : notOnPlan ? '—' : row.limit}
                        </td>
                        <td style={{ padding: '10px 0 10px 16px' }}>
                          {/* b8b9: the LIMIT column already says "Unlimited" —
                              a second green "Unlimited" badge here was a
                              display duplication. Unlimited rows leave
                              the status cell empty (no cap to show
                              progress against). */}
                          {unlimited ? null : notOnPlan ? (
                            <span style={{ fontSize: 12, color: LGRAY }}>Not on your plan</span>
                          ) : (
                            <div
                              style={{
                                width: '100%',
                                height: 8,
                                background: '#E5E7EB',
                                borderRadius: 100,
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  width: `${pct}%`,
                                  height: '100%',
                                  background: pct >= 100 ? RED : PURPLE,
                                  borderRadius: 100,
                                }}
                              />
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* INTEGRATIONS */}
        {tab === 'integrations' && (
          <div style={cardStyle}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: NAVY, margin: '0 0 4px' }}>
              Connected Accounts
            </h2>
            <p style={{ fontSize: 13, color: GRAY, margin: '0 0 20px' }}>
              Connect platforms to publish content directly from Rankall.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 0', borderTop: `1px solid ${BORDER}`, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 8, background: '#4285f4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}><svg viewBox="0 0 384 512" width="18" height="18" fill="#fff" aria-hidden="true"><path d="M215.7 499.2C267 435 384 279.4 384 192C384 86 298 0 192 0S0 86 0 192c0 87.4 117 243 168.3 307.2c12.3 15.3 35.1 15.3 47.4 0zM192 128a64 64 0 1 1 0 128 64 64 0 1 1 0-128z"/></svg></div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>Google Business Profile</div>
                  <div style={{ fontSize: 12, color: GRAY }}>
                    {gbpLoading || !gbp
                      ? 'Checking…'
                      : !gbp.connected
                        ? 'Not connected'
                        : gbp.pending
                          ? (<><span style={{display:'inline-flex',verticalAlign:'middle',marginRight:4}}><svg viewBox="0 0 384 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M32 0C14.3 0 0 14.3 0 32S14.3 64 32 64l0 11c0 42.4 16.9 83.1 46.9 113.1L146.7 256 78.9 323.9C48.9 353.9 32 394.6 32 437l0 11c-17.7 0-32 14.3-32 32s14.3 32 32 32l32 0 256 0 32 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l0-11c0-42.4-16.9-83.1-46.9-113.1L237.3 256l67.9-67.9c30-30 46.9-70.7 46.9-113.1l0-11c17.7 0 32-14.3 32-32s-14.3-32-32-32L320 0 64 0 32 0zM96 75l0-11 192 0 0 11c0 19-5.6 37.4-16 53L112 128c-10.3-15.6-16-34-16-53zm16 309c3.5-5.3 7.6-10.3 12.1-14.9L192 301.3l67.9 67.9c4.6 4.6 8.6 9.6 12.1 14.9L112 384z"/></svg></span>Connected — awaiting Google API approval</>)
                          : (<><span style={{display:'inline-flex',verticalAlign:'middle',marginRight:4,color:GREEN}}><svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg></span>{gbp.locationName || 'Connected'}</>)}
                  </div>
                </div>
              </div>
              {!gbpLoading && gbp && (
                gbp.connected ? (
                  <button type="button" style={{ ...secondaryBtn, color: RED, borderColor: '#FECACA' }} onClick={disconnectGbp}>
                    Disconnect
                  </button>
                ) : (
                  <a href="/api/integrations/google-business-profile?action=connect" style={{ ...primaryBtn, background: '#4285f4', textDecoration: 'none', display: 'inline-block' }}>
                    Connect GBP
                  </a>
                )
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 0', borderTop: `1px solid ${BORDER}`, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 8, background: '#F9AB00', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}><svg viewBox="0 0 512 512" width="18" height="18" fill="#fff" aria-hidden="true"><path d="M32 32c17.7 0 32 14.3 32 32l0 336c0 8.8 7.2 16 16 16l400 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L80 480c-44.2 0-80-35.8-80-80L0 64C0 46.3 14.3 32 32 32zM160 224c17.7 0 32 14.3 32 32l0 64c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32zm128-64l0 160c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-160c0-17.7 14.3-32 32-32s32 14.3 32 32zm64 32c17.7 0 32 14.3 32 32l0 96c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-96c0-17.7 14.3-32 32-32zM480 96l0 224c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-224c0-17.7 14.3-32 32-32s32 14.3 32 32z"/></svg></div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>Google Analytics</div>
                  <div style={{ fontSize: 12, color: GRAY }}>
                    {ga4Loading || !ga4
                      ? 'Checking…'
                      : !ga4.connected
                        ? 'Not connected'
                        : (<><span style={{display:'inline-flex',verticalAlign:'middle',marginRight:4,color:GREEN}}><svg viewBox="0 0 512 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg></span>{ga4.propertyName || 'Connected'}</>)}
                  </div>
                </div>
              </div>
              {!ga4Loading && ga4 && (
                ga4.connected ? (
                  <button type="button" style={{ ...secondaryBtn, color: RED, borderColor: '#FECACA' }} onClick={disconnectGa4}>
                    Disconnect
                  </button>
                ) : (
                  <a href="/api/integrations/google-analytics?action=connect" style={{ ...primaryBtn, background: '#4285f4', textDecoration: 'none', display: 'inline-block' }}>
                    Connect GA4
                  </a>
                )
              )}
            </div>
          </div>
        )}

        {/* NOTIFICATIONS */}
        {tab === 'notifications' && (
          <div style={cardStyle}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: NAVY, margin: '0 0 18px' }}>
              Email Notifications
            </h2>
            {(
              [
                ['weekly_report', 'Weekly AI visibility report'],
                ['competitor_alerts', 'Competitor score changes'],
                ['milestone_emails', 'Score improvement milestones'],
                ['fix_recommendations', 'New fix recommendations'],
                ['marketing_emails', 'Marketing emails'],
              ] as [keyof typeof prefs, string][]
            ).map(([key, label]) => (
              <div
                key={key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 0',
                  borderBottom: `1px solid ${BG}`,
                }}
              >
                <span style={{ fontSize: 14, color: NAVY }}>{label}</span>
                <Toggle
                  on={prefs[key]}
                  onChange={(v) => setPrefs((p) => ({ ...p, [key]: v }))}
                />
              </div>
            ))}
            <button
              type="button"
              style={{ ...primaryBtn, marginTop: 20 }}
              disabled={prefsSaving}
              onClick={savePrefs}
            >
              {prefsSaving ? 'Saving…' : 'Save Preferences'}
            </button>
            <Msg msg={prefsMsg} />
          </div>
        )}

        {/* REFERRALS */}
        {tab === 'referrals' && (
          <div style={cardStyle}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: NAVY, margin: '0 0 6px' }}>
              Earn 25% recurring commission
            </h2>
            <p style={{ fontSize: 14, color: GRAY, margin: '0 0 20px' }}>
              Share your link. Earn 25% on every paying customer you refer — for as long as they
              stay subscribed.
            </p>

            <label style={labelStyle}>Your referral link</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
              <input style={{ ...inputStyle, flex: 1 }} value={refLink} readOnly />
              <button
                type="button"
                style={primaryBtn}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(refLink);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1800);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                gap: 12,
                marginBottom: 24,
              }}
            >
              {[
                ['Clicks', refStats.clicks],
                ['Signups', refStats.signups],
                ['Active', refStats.active],
                ['Earnings', `$${refStats.earnings}`],
              ].map(([label, val]) => (
                <div
                  key={label as string}
                  style={{
                    background: BG,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 10,
                    padding: '16px 14px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 24, fontWeight: 700, color: NAVY }}>{val}</div>
                  <div style={{ fontSize: 12, color: GRAY, marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>

            <button type="button" style={secondaryBtn} onClick={() => router.push('/referrals')}>
              View Full Dashboard <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></button>
          </div>
        )}
      </div>

      {/* Cancel / retention flow */}
      {showCancel && (
        <RetentionModal
          userId={user.id}
          userEmail={email}
          businessName={fullName || ''}
          accountStats={accountStats}
          onClose={() => setShowCancel(false)}
          onCancelled={() => { setShowCancel(false); setCancelled(true); }}
        />
      )}
    </div>
  );
}
