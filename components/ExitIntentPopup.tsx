'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { SCAN_TIME_LABEL } from '@/lib/publicStats';
import { hasAppShell } from '@/lib/appShell';

// V2 design tokens
const INK   = '#0A0A14';
const BLUE  = '#1B17FF';
const MUTED = '#B4B4C8';
const CARD  = '#141428';
const LINE  = 'rgba(255,255,255,0.10)';

const STORAGE_KEY = 'rankall_nudge_dismissed';

export default function ExitIntentPopup() {
  const [show, setShow]   = useState(false);
  const [query, setQuery] = useState('');
  const triggered         = useRef(false);
  const dismissTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY)) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    function trigger() {
      if (triggered.current) return;
      triggered.current = true;
      setShow(true);
      dismissTimer.current = setTimeout(() => setShow(false), 10000);
    }

    // Trigger after 45 seconds
    timeoutId = setTimeout(trigger, 45000);

    // Trigger after scrolling past 60% of the page
    function onScroll() {
      const scrolled = window.scrollY + window.innerHeight;
      const total = document.documentElement.scrollHeight;
      if (scrolled / total >= 0.6) trigger();
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      clearTimeout(timeoutId);
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  function dismiss() {
    setShow(false);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    localStorage.setItem(STORAGE_KEY, '1');
  }

  function handleScan() {
    if (!query.trim()) return;
    dismiss();
    // Scroll to top and pre-fill the search — navigate to homepage with query
    const encoded = encodeURIComponent(query.trim());
    window.location.href = `/?q=${encoded}`;
  }

  // Hidden on the fullscreen demo tour so it can't overlay the player controls.
  const pathname = usePathname();
  // Signed-in app pages (dashboard, admin) never show the visitor scan pop-up.
  if (pathname === '/demo' || pathname.startsWith('/r/') || hasAppShell(pathname)) return null;

  if (!show) return null;

  const valid = query.trim().length > 0;

  return (
    <div
      style={{
        position: 'fixed', bottom: 24, left: 24, zIndex: 600,
        width: 360, maxWidth: 'calc(100vw - 48px)',
        background: INK, border: `1px solid ${LINE}`,
        borderRadius: 20, padding: 24,
        boxShadow: '0 24px 64px rgba(10,10,20,0.45)',
        animation: 'nudgeIn 0.25s ease',
        fontFamily: "'Geist','Inter','Helvetica Neue',Arial,sans-serif",
      }}
    >
      <style>{`
        @keyframes nudgeIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{ position: 'absolute', top: 14, right: 14, width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: 'none', cursor: 'pointer', color: MUTED, fontSize: 14, lineHeight: 1, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <svg viewBox="0 0 384 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>
      </button>

      <div style={{ width: 44, height: 44, borderRadius: 12, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, marginBottom: 14, boxShadow: '0 8px 24px rgba(27,23,255,0.4)' }}><svg viewBox="0 0 512 512" width="20" height="20" fill="#fff" aria-hidden="true"><path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/></svg></div>

      <p style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: 8, paddingRight: 24, lineHeight: 1.4, letterSpacing: '-0.02em' }}>
        Curious where AI sends customers in your area?
      </p>
      <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, marginBottom: 16 }}>
        Run a free scan (it takes {SCAN_TIME_LABEL}) and see who ChatGPT recommends instead of you.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input aria-label="Enter a business or search query"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && valid && handleScan()}
          placeholder="e.g. dentist in Austin TX"
          autoFocus
          style={{
            width: '100%', boxSizing: 'border-box',
            background: CARD, border: `1px solid ${LINE}`,
            borderRadius: 12, padding: '13px 16px', fontSize: 14,
            color: '#fff', outline: 'none', fontFamily: 'inherit',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = BLUE; if (dismissTimer.current) clearTimeout(dismissTimer.current); }}
          onBlur={e => { e.currentTarget.style.borderColor = LINE; }}
        />
        <button
          onClick={handleScan}
          disabled={!valid}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: valid ? BLUE : 'rgba(255,255,255,0.08)',
            border: 'none', borderRadius: 12, padding: '13px 16px',
            fontSize: 15, fontWeight: 700, color: '#fff',
            cursor: valid ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit', letterSpacing: '-0.01em',
            opacity: valid ? 1 : 0.6,
          }}
        >
          Scan Free <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
        </button>
      </div>
    </div>
  );
}
