'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { SCAN_TIME_LABEL } from '@/lib/publicStats';
import Link from 'next/link';

// V2 design tokens
const INK   = '#0A0A14';
const BLUE  = '#1B17FF';
const MUTED = '#B4B4C8';
const CARD  = '#141428';
const LINE  = 'rgba(255,255,255,0.10)';

// b88b: dismiss persists for the session — the old in-memory-only flag
// let the popup reappear on every navigation. Session (not local) storage:
// dismissed this visit, allowed to show again on a fresh visit.
const STORAGE_KEY = 'rankall_timed_popup_dismissed';
// b88b: never show the lead-capture popup on conversion pages (the visitor
// is already converting) or account pages (the visitor is already a
// customer) — it covered footer content and clipped its own trial line
// there. '/demo' + '/r/*' were already hidden (player controls).
const HIDDEN_PREFIXES = ['/demo', '/r', '/pricing', '/signup', '/login', '/dashboard', '/settings'];

export default function TimedPopup() {
  const [show, setShow]           = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [email, setEmail]         = useState('');
  const [done, setDone]           = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { if (sessionStorage.getItem(STORAGE_KEY)) setDismissed(true); } catch { /* storage unavailable — popup behaves as before */ }
  }, []);

  useEffect(() => {
    if (dismissed) return;
    const t = setTimeout(() => setShow(true), 60000);
    return () => clearTimeout(t);
  }, [dismissed]);

  const dismiss = () => {
    setShow(false); setDismissed(true);
    if (typeof window !== 'undefined') {
      try { sessionStorage.setItem(STORAGE_KEY, '1'); } catch { /* storage unavailable — dismiss still applies this mount */ }
    }
  };
  const submit  = () => { if (!email.includes('@')) return; setDone(true); setTimeout(dismiss, 3000); };

  const pathname = usePathname();
  if (HIDDEN_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))) return null;

  if (!show) return null;

  const valid = email.includes('@');

  // b88b: bottom:96 clears the Ask Alina pill (bottom:24 + ~40px tall, top
  // edge ~64px from the viewport bottom); zIndex 400 sits below the
  // pill/panel (500) so the chat always wins if they ever meet.
  // boxSizing:border-box — without it the 28px padding ADDED to the 360px
  // width on pages without the homepage's global border-box rule, pushing
  // the box 8px past the viewport edge and clipping the trial line.
  return (
    <div style={{ position: 'fixed', bottom: 96, right: 24, zIndex: 400, width: 360, maxWidth: 'calc(100vw - 48px)', boxSizing: 'border-box', background: INK, border: `1px solid ${LINE}`, borderRadius: 20, padding: 28, boxShadow: '0 24px 64px rgba(10,10,20,0.45)', animation: 'slideInUp 0.4s ease', fontFamily: "'Geist','Inter','Helvetica Neue',Arial,sans-serif" }}>
      <button onClick={dismiss} aria-label="Dismiss" style={{ position: 'absolute', top: 14, right: 14, width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: 'none', cursor: 'pointer', color: MUTED, fontSize: 14, fontFamily: 'inherit', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg viewBox="0 0 384 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg></button>
      {!done ? (
        <>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, marginBottom: 16, boxShadow: '0 8px 24px rgba(27,23,255,0.4)' }}><svg viewBox="0 0 512 512" width="20" height="20" fill="#fff" aria-hidden="true"><path d="M448 256A192 192 0 1 0 64 256a192 192 0 1 0 384 0zM0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256zm256 80a80 80 0 1 0 0-160 80 80 0 1 0 0 160zm0-224a144 144 0 1 1 0 288 144 144 0 1 1 0-288zM224 256a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"/></svg></div>
          <p style={{ fontSize: 19, fontWeight: 700, color: '#fff', marginBottom: 8, letterSpacing: '-0.02em', lineHeight: 1.3 }}>Before you go…</p>
          <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.6, marginBottom: 20 }}>Get your free AI Visibility Score — see exactly which competitor is beating you. Takes {SCAN_TIME_LABEL}.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            <input aria-label="Email address" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && valid && submit()} placeholder="you@company.com" type="email" style={{ width: '100%', boxSizing: 'border-box', background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: '14px 16px', fontSize: 14, color: '#fff', outline: 'none', fontFamily: 'inherit' }} />
            <button onClick={submit} disabled={!valid} style={{ width: '100%', boxSizing: 'border-box', background: valid ? BLUE : 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 12, padding: '14px 16px', fontSize: 15, fontWeight: 700, color: '#fff', cursor: valid ? 'pointer' : 'not-allowed', fontFamily: 'inherit', letterSpacing: '-0.01em', opacity: valid ? 1 : 0.6 }}>Get My Free Score <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></button>
          </div>
          <p style={{ fontSize: 11, color: MUTED, textAlign: 'center', marginBottom: 12, opacity: 0.8 }}>Free · No spam · Unsubscribe any time</p>
          <Link href="/signup" onClick={dismiss} style={{ display: 'block', textAlign: 'center', fontSize: 13, color: '#fff', fontWeight: 600, textDecoration: 'none', opacity: 0.85, overflowWrap: 'anywhere', whiteSpace: 'normal' }}>Or start your 7-day trial (card required) <svg viewBox="0 0 448 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, margin: '0 auto 14px', color: '#10B981' }}><svg viewBox="0 0 448 512" width="26" height="26" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg></div>
          <p style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: 8 }}>You&apos;re in!</p>
          <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6 }}>Your free AI Visibility Report is on its way to <strong style={{ color: '#fff' }}>{email}</strong></p>
        </div>
      )}
    </div>
  );
}
