'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { HONEYPOT_FIELD } from '@/lib/publicFormGuardShared';

const PLAN_LABELS: Record<string, string> = {
  product_pro: 'Product Pro',
  publisher_pro: 'Publisher Pro',
  enterprise: 'Enterprise',
  government: 'Government',
  global_brand: 'Global Brand',
  local_pro_seo: 'Local Pro + SEO Autopilot',
  agency_seo: 'Agency + SEO Autopilot',
};

const BG = '#F6F6FB';
const W = '#FFFFFF';
const NAVY = '#0A0A14';
const BORDER = '#EDEDF4';
const BLUE = '#1B17FF';
const GREEN = '#059669';
const GRAY = '#55556A';
const LGRAY = '#8A8AA3';

function WaitlistForm() {
  const searchParams = useSearchParams();
  const planParam = searchParams?.get('plan') ?? '';
  // b8bh: a bare /waitlist (or an unknown ?plan=) rendered
  // "Be first in line when  launches." — always name something.
  const planLabel = PLAN_LABELS[planParam] || 'our next plan';
  // ax6p: the interval arrives from create-checkout's waitlistUrl
  // (?plan=&interval=) — an annual buyer's choice must survive.
  const intervalParam = searchParams?.get('interval') ?? '';

  const [email, setEmail] = useState('');
  const [businessName, setBusinessName] = useState('');
  // b8bh: default to Product Pro — the old '' default rendered the
  // headline as "Be first in line when launches." (blank plan name)
  // and inserted plan_type 'general'.
  const [plan, setPlan] = useState(PLAN_LABELS[planParam] ? planParam : 'product_pro');
  const [interval, setInterval] = useState(intervalParam === 'annual' ? 'annual' : 'monthly');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // b8bh: only honour ?plan= when it names a known plan — the old
    // unconditional setPlan('') reset the default to blank on mount.
    if (PLAN_LABELS[planParam]) setPlan(planParam);
    setInterval(intervalParam === 'annual' ? 'annual' : 'monthly');
  }, [planParam, intervalParam]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes('@')) { setErrorMsg('Please enter a valid email.'); return; }
    setStatus('loading');
    setErrorMsg('');
    // b8bh: joins go through the server route (validation + honeypot +
    // per-IP rate limit + service-role insert). The old direct client
    // insert always failed: waitlist_signups never existed.
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          business_name: businessName.trim() || null,
          // ax6p: no interval column exists on waitlist_signups, so the
          // interval rides as a ':annual' suffix on plan_type —
          // readable in the table, stripped nowhere else.
          plan_type: interval === 'annual' ? `${plan}:annual` : plan,
          // Honeypot value comes from the hidden input (empty for humans).
          [HONEYPOT_FIELD]: new FormData(e.currentTarget as HTMLFormElement).get(HONEYPOT_FIELD) ?? '',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setStatus('error');
        setErrorMsg(typeof data.error === 'string' && data.error ? data.error : "We couldn't save your signup — please try again.");
      } else {
        setStatus('done');
      }
    } catch {
      setStatus('error');
      setErrorMsg("We couldn't save your signup — please try again.");
    }
  }

  return (
    <div style={{ background: BG, minHeight: '100vh', fontFamily: "'Geist','Inter',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <div style={{ maxWidth: 460, width: '100%' }}>
        <a href="/pricing" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: GRAY, fontSize: 14, textDecoration: 'none', marginBottom: 28 }}><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L109.2 288 416 288c17.7 0 32-14.3 32-32s-14.3-32-32-32l-306.7 0L214.6 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160z"/></svg> Back to pricing</a>

        {status === 'done' ? (
          <div style={{ background: '#ECFDF5', border: '1.5px solid #A7F3D0', borderRadius: 16, padding: '36px 32px', textAlign: 'center' }}>
            <p style={{ fontSize: 32, marginBottom: 12 }}><svg viewBox="0 0 512 512" width="32" height="32" fill="#059669" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg></p>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 8 }}>You&apos;re on the list!</h2>
            <p style={{ fontSize: 15, color: GRAY }}>
              We&apos;ll notify you at <strong>{email}</strong> when <strong>{PLAN_LABELS[plan] || 'our next plan'}</strong> launches{interval === 'annual' ? ' — annual billing' : ''} — with founding member pricing.
            </p>
          </div>
        ) : (
          <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '36px 32px' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: BLUE, textTransform: 'uppercase' as const, letterSpacing: '0.1em', marginBottom: 8 }}>Early Access</p>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: NAVY, letterSpacing: '-0.5px', marginBottom: 8 }}>
              Join the {PLAN_LABELS[plan] ?? 'waitlist'}
            </h1>
            <p style={{ fontSize: 14, color: GRAY, marginBottom: 28, lineHeight: 1.6 }}>
              Be first in line when {PLAN_LABELS[plan] || planLabel} launches{interval === 'annual' ? ' — annual billing' : ''}. We&apos;ll lock in founding member pricing for everyone on this list.
            </p>

            <form onSubmit={handleSubmit}>
              {/* Honeypot: hidden from humans; bots that fill it get a silent fake success from the route. */}
              <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 6 }}>Email *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={{ width: '100%', background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px', fontSize: 15, color: NAVY, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
                />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 6 }}>Business name (optional)</label>
                <input
                  type="text"
                  value={businessName}
                  onChange={e => setBusinessName(e.target.value)}
                  placeholder="Acme Dental"
                  style={{ width: '100%', background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px', fontSize: 15, color: NAVY, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
                />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 6 }}>Billing</label>
                <select
                  value={interval}
                  onChange={e => setInterval(e.target.value === 'annual' ? 'annual' : 'monthly')}
                  style={{ width: '100%', background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px', fontSize: 15, color: NAVY, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
                >
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
              <div style={{ marginBottom: 22 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 6 }}>Plan</label>
                <select
                  value={plan}
                  onChange={e => setPlan(e.target.value)}
                  style={{ width: '100%', background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px', fontSize: 15, color: NAVY, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }}
                >
                  {Object.entries(PLAN_LABELS).map(([val, lbl]) => (
                    <option key={val} value={val}>{lbl}</option>
                  ))}
                </select>
              </div>
              {errorMsg && (
                <p style={{ fontSize: 13, color: '#DC2626', marginBottom: 12 }}>{errorMsg}</p>
              )}
              <button
                type="submit"
                disabled={status === 'loading'}
                style={{ width: '100%', background: BLUE, color: W, border: 'none', borderRadius: 10, padding: '14px', fontSize: 15, fontWeight: 700, cursor: status === 'loading' ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: status === 'loading' ? 0.7 : 1 }}
              >
                {status === 'loading' ? 'Joining...' : (<>Join Waitlist <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>)}
              </button>
              <p style={{ fontSize: 12, color: LGRAY, textAlign: 'center' as const, marginTop: 10 }}>No spam. One email when we launch.</p>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WaitlistPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#F6F6FB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p style={{ color: '#55556A' }}>Loading...</p></div>}>
      <WaitlistForm />
    </Suspense>
  );
}
