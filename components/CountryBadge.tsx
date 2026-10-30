'use client';

import { useEffect, useState } from 'react';

export default function CountryBadge({ showAlways = false }: { showAlways?: boolean }) {
  const [country, setCountry] = useState<string | null>(null);
  const [overridden, setOverridden] = useState(false);

  useEffect(() => {
    const get = (name: string) => document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1] ?? null;
    const c = get('rankall_country');
    const o = get('rankall_country_overridden');
    if (c) { setCountry(c); setOverridden(o === '1'); }
  }, []);

  function clearOverride() {
    document.cookie = 'country_override=; path=/; max-age=0';
    document.cookie = 'rankall_country_overridden=0; path=/';
    window.location.reload();
  }

  // In production: only show when actively overriding (admin feature)
  if (!country) return null;
  if (!showAlways && !overridden) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 16, left: 16, zIndex: 9999,
      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
      background: overridden ? '#1E3A5F' : '#1E293B',
      border: `1.5px solid ${overridden ? '#3B82F6' : '#334155'}`,
      borderRadius: 10, padding: '8px 12px',
      fontFamily: 'monospace', fontSize: 12, color: '#E2E8F0',
      boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
      userSelect: 'none', maxWidth: 280,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14, display: 'inline-flex' }}><svg viewBox="0 0 512 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M352 256c0 22.2-1.2 43.6-3.3 64l-185.3 0c-2.2-20.4-3.3-41.8-3.3-64s1.2-43.6 3.3-64l185.3 0c2.2 20.4 3.3 41.8 3.3 64zm28.8-64l123.1 0c5.3 20.5 8.1 41.9 8.1 64s-2.8 43.5-8.1 64l-123.1 0c2.1-20.6 3.2-42 3.2-64s-1.1-43.4-3.2-64zm112.6-32l-116.7 0c-10-63.9-29.8-117.4-55.3-151.6c78.3 20.7 142 77.5 171.9 151.6zm-149.1 0l-176.6 0c6.1-36.4 15.5-68.6 27-94.7c10.5-23.6 22.2-40.7 33.5-51.5C239.4 3.2 248.7 0 256 0s16.6 3.2 27.8 13.8c11.3 10.8 23 27.9 33.5 51.5c11.6 26 20.9 58.2 27 94.7zm-209 0L18.6 160C48.6 85.9 112.2 29.1 190.6 8.4C165.1 42.6 145.3 96.1 135.3 160zM8.1 192l123.1 0c-2.1 20.6-3.2 42-3.2 64s1.1 43.4 3.2 64L8.1 320C2.8 299.5 0 278.1 0 256s2.8-43.5 8.1-64zM194.7 446.6c-11.6-26-20.9-58.2-27-94.6l176.6 0c-6.1 36.4-15.5 68.6-27 94.6c-10.5 23.6-22.2 40.7-33.5 51.5C272.6 508.8 263.3 512 256 512s-16.6-3.2-27.8-13.8c-11.3-10.8-23-27.9-33.5-51.5zM135.3 352c10 63.9 29.8 117.4 55.3 151.6C112.2 482.9 48.6 426.1 18.6 352l116.7 0zm358.1 0c-30 74.1-93.6 130.9-171.9 151.6c25.5-34.2 45.2-87.7 55.3-151.6l116.7 0z"/></svg></span>
        <span style={{ fontWeight: 700, color: overridden ? '#60A5FA' : '#94A3B8' }}>
          Country:
        </span>
        <span style={{ fontWeight: 900, color: '#fff', letterSpacing: '0.05em' }}>{country}</span>
        {overridden && (
          <span style={{ background: '#3B82F6', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700, color: '#fff' }}>OVERRIDE</span>
        )}
      </div>
      {overridden && (
        <>
          <span style={{ fontSize: 11, color: '#FBBF24', lineHeight: 1.4 }}>
            <svg viewBox="0 0 512 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg> Country override active ({country}). This may affect currency display.
          </span>
          <button
            onClick={clearOverride}
            title="Clear country override"
            style={{ background: '#3B82F6', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: '4px 10px', fontFamily: 'inherit' }}
          >Clear override</button>
        </>
      )}
    </div>
  );
}
