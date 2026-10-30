'use client';

// Homepage waitlist modal (azxj) — first homepage island extracted from the
// giant 'use client' app/page.tsx. The page only passes intent + entityName +
// onClose; this component owns its email/submitted state. It is loaded via
// next/dynamic with ssr:false, so its chunk (incl. INTENT_LABELS' SVG icons)
// is NOT in the homepage's initial bundle — it downloads on first open.
// Behavior is verbatim the inline modal it replaces (same fetch, same UI);
// the only change is that the duplicated Enter-key/button submit handlers
// share one submit() function.

import { useState } from 'react';
import { getBrowserClient } from '@/lib/supabase';

const W = '#FFFFFF';
const NAVY = '#0A0A14';
const BLUE = '#1B17FF';
const GREEN = '#059669';
const GRAY = '#55556A';
const LGRAY = '#94A3B8';
const BORDER = '#EDEDF4';

const INTENT_LABELS: Record<string, { icon: React.ReactNode; label: string; desc: string }> = {
    PRODUCT_PRO: { icon: <svg viewBox="0 0 448 512" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M160 112c0-35.3 28.7-64 64-64s64 28.7 64 64l0 48-128 0 0-48zm-48 48l-64 0c-26.5 0-48 21.5-48 48L0 416c0 53 43 96 96 96l256 0c53 0 96-43 96-96l0-208c0-26.5-21.5-48-48-48l-64 0 0-48C336 50.1 285.9 0 224 0S112 50.1 112 112l0 48zm24 48a24 24 0 1 1 0 48 24 24 0 1 1 0-48zm152 24a24 24 0 1 1 48 0 24 24 0 1 1 -48 0z"/></svg>, label: 'Product & App Intelligence', desc: "AI visibility for products, apps, and e-commerce brands — launching soon. We'll notify you when it's ready." },
    GLOBAL_BRAND: { icon: <svg viewBox="0 0 512 512" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M352 256c0 22.2-1.2 43.6-3.3 64l-185.3 0c-2.2-20.4-3.3-41.8-3.3-64s1.2-43.6 3.3-64l185.3 0c2.2 20.4 3.3 41.8 3.3 64zm28.8-64l123.1 0c5.3 20.5 8.1 41.9 8.1 64s-2.8 43.5-8.1 64l-123.1 0c2.1-20.6 3.2-42 3.2-64s-1.1-43.4-3.2-64zm112.6-32l-116.7 0c-10-63.9-29.8-117.4-55.3-151.6c78.3 20.7 142 77.5 171.9 151.6zm-149.1 0l-176.6 0c6.1-36.4 15.5-68.6 27-94.7c10.5-23.6 22.2-40.7 33.5-51.5C239.4 3.2 248.7 0 256 0s16.6 3.2 27.8 13.8c11.3 10.8 23 27.9 33.5 51.5c11.6 26 20.9 58.2 27 94.7zm-209 0L18.6 160C48.6 85.9 112.2 29.1 190.6 8.4C165.1 42.6 145.3 96.1 135.3 160zM8.1 192l123.1 0c-2.1 20.6-3.2 42-3.2 64s1.1 43.4 3.2 64L8.1 320C2.8 299.5 0 278.1 0 256s2.8-43.5 8.1-64zM194.7 446.6c-11.6-26-20.9-58.2-27-94.6l176.6 0c-6.1 36.4-15.5 68.6-27 94.6c-10.5 23.6-22.2 40.7-33.5 51.5C272.6 508.8 263.3 512 256 512s-16.6-3.2-27.8-13.8c-11.3-10.8-23-27.9-33.5-51.5zM135.3 352c10 63.9 29.8 117.4 55.3 151.6C112.2 482.9 48.6 426.1 18.6 352l116.7 0zm358.1 0c-30 74.1-93.6 130.9-171.9 151.6c25.5-34.2 45.2-87.7 55.3-151.6l116.7 0z"/></svg>, label: 'Global Brand Intelligence', desc: "Multi-location brand tracking and AI share of voice — launching soon. We'll notify you when it's ready." },
    GOVERNMENT: { icon: <svg viewBox="0 0 512 512" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M240.1 4.2c9.8-5.6 21.9-5.6 31.8 0l171.8 98.1L448 104l0 .9 47.9 27.4c12.6 7.2 18.8 22 15.1 36s-16.4 23.8-30.9 23.8L32 192c-14.5 0-27.2-9.8-30.9-23.8s2.5-28.8 15.1-36L64 104.9l0-.9 4.4-1.6L240.1 4.2zM64 224l64 0 0 192 40 0 0-192 64 0 0 192 48 0 0-192 64 0 0 192 40 0 0-192 64 0 0 196.3c.6 .3 1.2 .7 1.8 1.1l48 32c11.7 7.8 17 22.4 12.9 35.9S494.1 512 480 512L32 512c-14.1 0-26.5-9.2-30.6-22.7s1.1-28.1 12.9-35.9l48-32c.6-.4 1.2-.7 1.8-1.1L64 224z"/></svg>, label: 'Government & Public Service', desc: "AI visibility for public services and government organisations — launching soon. We'll notify you when it's ready." },
  };

export default function HomepageWaitlistModal({
  intent,
  entityName,
  onClose,
}: {
  intent: string;
  entityName: string;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Records the signup in waitlist_signups (same table as /waitlist). The old
  // code fired an unauthenticated call to the outreach mailer with a body it
  // rejected, then showed "You're on the list!" regardless — nothing was
  // ever saved. Now success is only shown when the row was written.
  const submit = async () => {
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) { setError('Please enter a valid email.'); return; }
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const { error: insertError } = await getBrowserClient().from('waitlist_signups').insert({
        email: clean,
        business_name: entityName?.trim() || null,
        plan_type: intent || 'general',
        created_at: new Date().toISOString(),
      });
      if (insertError) throw insertError;
      setSubmitted(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div style={{ background: W, borderRadius: 16, padding: 28, maxWidth: 480, width: '100%', boxShadow: '0 40px 80px rgba(0,0,0,0.5)', position: 'relative' }}>
      <button onClick={() => onClose()} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: LGRAY }}><svg viewBox="0 0 384 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M310.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg></button>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <span style={{ width: 48, height: 48, borderRadius: 16, background: '#F6F6FB', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{INTENT_LABELS[intent]?.icon || <svg viewBox="0 0 512 512" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M156.6 384.9L125.7 354c-8.5-8.5-11.5-20.8-7.7-32.2c3-8.9 7-20.5 11.8-33.8L24 288c-8.6 0-16.6-4.6-20.9-12.1s-4.2-16.7 .2-24.1l52.5-88.5c13-21.9 36.5-35.3 61.9-35.3l82.3 0c2.4-4 4.8-7.7 7.2-11.3C289.1-4.1 411.1-8.1 483.9 5.3c11.6 2.1 20.6 11.2 22.8 22.8c13.4 72.9 9.3 194.8-111.4 276.7c-3.5 2.4-7.3 4.8-11.3 7.2l0 82.3c0 25.4-13.4 49-35.3 61.9l-88.5 52.5c-7.4 4.4-16.6 4.5-24.1 .2s-12.1-12.2-12.1-20.9l0-107.2c-14.1 4.9-26.4 8.9-35.7 11.9c-11.2 3.6-23.4 .5-31.8-7.8zM384 168a40 40 0 1 0 0-80 40 40 0 1 0 0 80z"/></svg>}</span>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: NAVY, marginTop: 12, marginBottom: 8 }}>
          {INTENT_LABELS[intent]?.label || 'Coming Soon'}
        </h2>
        <p style={{ fontSize: 14, color: GRAY, lineHeight: 1.6 }}>
          {INTENT_LABELS[intent]?.desc || "This feature is coming soon. Join the waitlist and we'll notify you when it's ready."}
        </p>
        {entityName && (
          <div style={{ background: '#EEF0FF', border: '1px solid #C9D4FF', borderRadius: 8, padding: '12px 16px', marginTop: 12 }}>
            <p style={{ fontSize: 13, color: BLUE, fontWeight: 600, margin: 0 }}>
              We noted your interest in: <strong>{entityName}</strong>
            </p>
          </div>
        )}
      </div>
      {!submitted ? (
        <div>
          <input
            type="email"
            aria-label="Email address" placeholder="your@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={{ width: '100%', border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: '12px 16px', fontSize: 15, color: NAVY, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 12 }}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          />
          <button
            onClick={submit}
            disabled={saving}
            style={{ width: '100%', opacity: saving ? 0.7 : 1, background: BLUE, color: '#fff', border: 'none', borderRadius: 12, padding: '16px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Join Waitlist <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
          </button>
          {error && <p role="alert" style={{ textAlign: 'center', fontSize: 13, color: '#B91C1C', marginTop: 10 }}>{error}</p>}
          <p style={{ textAlign: 'center', fontSize: 12, color: LGRAY, marginTop: 12 }}>No spam. One email when we launch.</p>
        </div>
      ) : (
        <div style={{ textAlign: 'center', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 12, padding: 24 }}>
          <p style={{ fontSize: 16, color: GREEN, display:'flex' }}><svg viewBox="0 0 512 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg></p>
          <p style={{ fontSize: 16, fontWeight: 700, color: GREEN, margin: 0 }}>You're on the list!</p>
          <p style={{ fontSize: 13, color: GRAY, marginTop: 6 }}>We'll email you at <strong>{email}</strong> when {INTENT_LABELS[intent]?.label} launches.</p>
        </div>
      )}
    </div>
  </div>
  );
}
