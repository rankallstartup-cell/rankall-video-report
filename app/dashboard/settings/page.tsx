'use client';

// ax8r: this was the legacy settings page — the cancel/retention flow was
// already ported to the canonical /settings page (all nav "Settings" links
// point there), so this route now redirects instead of sitting orphaned as a
// second, diverging settings page.
// b36q: Paras's paras/dashboard-v2-redesign version of this page was the old
// full settings page (fake Save that persisted nothing, hardcoded demo
// identity + demo API key, client-supplied userId cancel flow, invented 50%
// discount offer) — all rejected. Staging logic (redirect) kept as-is;
// only the interstitial render was ported to the V2 design language.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const BG = '#F8FAFC';
const W = '#FFFFFF';
const NAVY = '#0A0A14';
const BORDER = '#E2E8F0';
const BLUE = '#1B17FF';
const GRAY = '#64748B';

export default function DashboardSettingsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/settings');
  }, [router]);
  return (
    <div
      style={{
        background: BG,
        minHeight: '100vh',
        padding: '28px 24px',
        fontFamily: "'Geist',ui-sans-serif,system-ui,sans-serif",
      }}
    >
      <style>{`@keyframes b36q-spin { to { transform: rotate(360deg); } }`}</style>
      <div
        style={{
          background: W,
          border: `1.5px solid ${BORDER}`,
          borderRadius: 14,
          padding: 24,
          maxWidth: 480,
          margin: '0 auto',
          textAlign: 'center',
          boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 20,
            height: 20,
            margin: '0 auto 16px',
            borderRadius: '50%',
            border: `2px solid ${BORDER}`,
            borderTopColor: BLUE,
            animation: 'b36q-spin 0.8s linear infinite',
          }}
        />
        <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, margin: '0 0 4px', letterSpacing: '-0.5px' }}>
          Settings
        </h1>
        <p style={{ fontSize: 14, color: GRAY, margin: '0 0 16px' }}>Redirecting to Settings…</p>
        <a href="/settings" style={{ fontSize: 14, fontWeight: 600, color: BLUE, textDecoration: 'none' }}>
          If you aren&apos;t redirected, go to Settings →
        </a>
      </div>
    </div>
  );
}
