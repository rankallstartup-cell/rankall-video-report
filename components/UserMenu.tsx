'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { getBrowserClient } from '@/lib/supabase';
import { normalizePlan, isAdminUser } from '@/lib/planConfig';

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const MENU_ITEMS = [
  { icon: <svg viewBox="0 0 512 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M32 32c17.7 0 32 14.3 32 32l0 336c0 8.8 7.2 16 16 16l400 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L80 480c-44.2 0-80-35.8-80-80L0 64C0 46.3 14.3 32 32 32zM160 224c17.7 0 32 14.3 32 32l0 64c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32zm128-64l0 160c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-160c0-17.7 14.3-32 32-32s32 14.3 32 32zm64 32c17.7 0 32 14.3 32 32l0 96c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-96c0-17.7 14.3-32 32-32zM480 96l0 224c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-224c0-17.7 14.3-32 32-32s32 14.3 32 32z"/></svg>, label: 'Dashboard', href: '/dashboard' },
  { icon: <svg viewBox="0 0 512 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M495.9 166.6c3.2 8.7 .5 18.4-6.4 24.6l-43.3 39.4c1.1 8.3 1.7 16.8 1.7 25.4s-.6 17.1-1.7 25.4l43.3 39.4c6.9 6.2 9.6 15.9 6.4 24.6c-4.4 11.9-9.7 23.3-15.8 34.3l-4.7 8.1c-6.6 11-14 21.4-22.1 31.2c-5.9 7.2-15.7 9.6-24.5 6.8l-55.7-17.7c-13.4 10.3-28.2 18.9-44 25.4l-12.5 57.1c-2 9.1-9 16.3-18.2 17.8c-13.8 2.3-28 3.5-42.5 3.5s-28.7-1.2-42.5-3.5c-9.2-1.5-16.2-8.7-18.2-17.8l-12.5-57.1c-15.8-6.5-30.6-15.1-44-25.4L83.1 425.9c-8.8 2.8-18.6 .3-24.5-6.8c-8.1-9.8-15.5-20.2-22.1-31.2l-4.7-8.1c-6.1-11-11.4-22.4-15.8-34.3c-3.2-8.7-.5-18.4 6.4-24.6l43.3-39.4C64.6 273.1 64 264.6 64 256s.6-17.1 1.7-25.4L22.4 191.2c-6.9-6.2-9.6-15.9-6.4-24.6c4.4-11.9 9.7-23.3 15.8-34.3l4.7-8.1c6.6-11 14-21.4 22.1-31.2c5.9-7.2 15.7-9.6 24.5-6.8l55.7 17.7c13.4-10.3 28.2-18.9 44-25.4l12.5-57.1c2-9.1 9-16.3 18.2-17.8C227.3 1.2 241.5 0 256 0s28.7 1.2 42.5 3.5c9.2 1.5 16.2 8.7 18.2 17.8l12.5 57.1c15.8 6.5 30.6 15.1 44 25.4l55.7-17.7c8.8-2.8 18.6-.3 24.5 6.8c8.1 9.8 15.5 20.2 22.1 31.2l4.7 8.1c6.1 11 11.4 22.4 15.8 34.3zM256 336a80 80 0 1 0 0-160 80 80 0 1 0 0 160z"/></svg>, label: 'Settings', href: '/settings' },
  { icon: <svg viewBox="0 0 576 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M64 32C28.7 32 0 60.7 0 96l0 32 576 0 0-32c0-35.3-28.7-64-64-64L64 32zM576 224L0 224 0 416c0 35.3 28.7 64 64 64l448 0c35.3 0 64-28.7 64-64l0-192zM112 352l64 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-64 0c-8.8 0-16-7.2-16-16s7.2-16 16-16zm112 16c0-8.8 7.2-16 16-16l128 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-128 0c-8.8 0-16-7.2-16-16z"/></svg>, label: 'Billing', href: '/dashboard/billing' },
  { icon: <svg viewBox="0 0 512 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M448 256A192 192 0 1 0 64 256a192 192 0 1 0 384 0zM0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256zm256 80a80 80 0 1 0 0-160 80 80 0 1 0 0 160zm0-224a144 144 0 1 1 0 288 144 144 0 1 1 0-288zM224 256a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"/></svg>, label: 'Referrals', href: '/referrals' },
];

export default function UserMenu({ user }: { user: any }) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const initial = user?.email?.[0]?.toUpperCase() || 'U';
  const rawPlan = user?.user_metadata?.account_type || 'free';
  const plan = normalizePlan(rawPlan);
  const planLabel = capitalize(plan) + ' Plan';

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    // b8bg: Escape closes the menu.
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // b8bg: Sign Out needed a second click — nothing showed while signOut()
  // was in flight, and a failed network call skipped the redirect. Now one
  // click shows "Signing out…", ignores repeats, and always leaves the page.
  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await getBrowserClient().auth.signOut();
    } catch {
      /* the local session is cleared either way; still leave the page */
    } finally {
      window.location.href = '/';
    }
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-label="Account menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        style={{
          width: 36, height: 36, borderRadius: '50%',
          background: '#7c3aed', color: '#fff',
          border: 'none', fontSize: 14, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0, padding: 0,
        }}
      >
        {initial}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: 44, right: 0, width: 240,
            background: '#1a1a2e', border: '1px solid #7c3aed',
            borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            zIndex: 1000, padding: '8px 0',
          }}
        >
          <div style={{ padding: '10px 16px' }}>
            <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 6, wordBreak: 'break-all' }}>
              {user?.email}
            </div>
            <span
              style={{
                display: 'inline-block', background: '#7c3aed20', color: '#a78bfa',
                padding: '2px 8px', borderRadius: 4, fontSize: 11,
              }}
            >
              {planLabel}
            </span>
          </div>

          <div style={{ height: 1, background: '#374151', margin: '8px 0' }} />

          {MENU_ITEMS.map(item => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 16px', fontSize: 14, color: '#e5e7eb',
                textDecoration: 'none',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#ffffff10'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}

          {isAdminUser(user?.email) && (
            <a
              href="/admin/dashboard"
              onClick={() => setOpen(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 16px', fontSize: 14, color: '#a78bfa',
                textDecoration: 'none', cursor: 'pointer',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#ffffff10'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span style={{ display: 'inline-flex' }}><svg viewBox="0 0 512 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M352 320c88.4 0 160-71.6 160-160c0-15.3-2.2-30.1-6.2-44.2c-3.1-10.8-16.4-13.2-24.3-5.3l-76.8 76.8c-3 3-7.1 4.7-11.3 4.7L336 192c-8.8 0-16-7.2-16-16l0-57.4c0-4.2 1.7-8.3 4.7-11.3l76.8-76.8c7.9-7.9 5.4-21.2-5.3-24.3C382.1 2.2 367.3 0 352 0C263.6 0 192 71.6 192 160c0 19.1 3.4 37.5 9.5 54.5L19.9 396.1C7.2 408.8 0 426.1 0 444.1C0 481.6 30.4 512 67.9 512c18 0 35.3-7.2 48-19.9L297.5 310.5c17 6.2 35.4 9.5 54.5 9.5zM80 408a24 24 0 1 1 0 48 24 24 0 1 1 0-48z"/></svg></span>
              <span>Admin Dashboard</span>
            </a>
          )}

          <div style={{ height: 1, background: '#374151', margin: '8px 0' }} />

          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              padding: '10px 16px', fontSize: 14, color: '#ef4444',
              cursor: signingOut ? 'default' : 'pointer',
              background: 'transparent', border: 0, fontFamily: 'inherit', textAlign: 'left',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#ffffff10'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <span style={{ display: 'inline-flex' }}><svg viewBox="0 0 512 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M377.9 105.9L500.7 228.7c7.2 7.2 11.3 17.1 11.3 27.3s-4.1 20.1-11.3 27.3L377.9 406.1c-6.4 6.4-15 9.9-24 9.9c-18.7 0-33.9-15.2-33.9-33.9l0-62.1-128 0c-17.7 0-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32l128 0 0-62.1c0-18.7 15.2-33.9 33.9-33.9c9 0 17.6 3.6 24 9.9zM160 96L96 96c-17.7 0-32 14.3-32 32l0 256c0 17.7 14.3 32 32 32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-64 0c-53 0-96-43-96-96L0 128C0 75 43 32 96 32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32z"/></svg></span>
            <span>{signingOut ? 'Signing out…' : 'Sign Out'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
