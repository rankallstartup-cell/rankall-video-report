'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Logo from '@/components/Logo';

const BG     = '#F8FAFC';
const W      = '#FFFFFF';
const NAVY   = '#0F172A';
const BORDER = '#E2E8F0';
const BLUE   = '#2563EB';
const GRAY   = '#64748B';
const SIDEBAR = '#F1F5F9';

const NAV = [
  { label: 'My Score',          href: '/dashboard/client',          icon: <svg viewBox="0 0 512 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M448 96l0 128-160 0 0-128 160 0zm0 192l0 128-160 0 0-128 160 0zM224 224L64 224 64 96l160 0 0 128zM64 288l160 0 0 128L64 416l0-128zM64 32C28.7 32 0 60.7 0 96L0 416c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-320c0-35.3-28.7-64-64-64L64 32z"/></svg> },
  { label: 'My Platforms',      href: '/dashboard/client/platforms', icon: <svg viewBox="0 0 512 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zm0-352a96 96 0 1 1 0 192 96 96 0 1 1 0-192z"/></svg> },
  { label: 'My Fixes',          href: '/dashboard/client/fixes',     icon: <svg viewBox="0 0 448 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M349.4 44.6c5.9-13.7 1.5-29.7-10.6-38.5s-28.6-8-39.9 1.8l-256 224c-10 8.8-13.6 22.9-8.9 35.3S50.7 288 64 288l111.5 0L98.6 467.4c-5.9 13.7-1.5 29.7 10.6 38.5s28.6 8 39.9-1.8l256-224c10-8.8 13.6-22.9 8.9-35.3s-16.6-20.7-30-20.7l-111.5 0L349.4 44.6z"/></svg> },
  { label: 'My Reports',        href: '/dashboard/client/reports',   icon: <svg viewBox="0 0 448 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M64 32C28.7 32 0 60.7 0 96L0 416c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-320c0-35.3-28.7-64-64-64L64 32zM200 344l0-64-64 0c-13.3 0-24-10.7-24-24s10.7-24 24-24l64 0 0-64c0-13.3 10.7-24 24-24s24 10.7 24 24l0 64 64 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-64 0 0 64c0 13.3-10.7 24-24 24s-24-10.7-24-24z"/></svg> },
  { label: 'Contact My Agency', href: '/dashboard/client/contact',   icon: <svg viewBox="0 0 512 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M48 64C21.5 64 0 85.5 0 112c0 15.1 7.1 29.3 19.2 38.4L236.8 313.6c11.4 8.5 27 8.5 38.4 0L492.8 150.4c12.1-9.1 19.2-23.3 19.2-38.4c0-26.5-21.5-48-48-48L48 64zM0 176L0 384c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-208L294.4 339.2c-22.8 17.1-54 17.1-76.8 0L0 176z"/></svg> },
];

export default function ClientDashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const path = usePathname();

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: BG, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Sidebar */}
      <div style={{
        width: collapsed ? 60 : 220,
        flexShrink: 0,
        background: SIDEBAR,
        borderRight: `1px solid ${BORDER}`,
        height: '100vh',
        position: 'sticky',
        top: 0,
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s',
        overflow: 'hidden',
      }}>
        {/* Logo row */}
        <div style={{ padding: '16px 12px 0', flexShrink: 0 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            paddingBottom: 16,
            borderBottom: `1px solid ${BORDER}`,
            marginBottom: 16,
          }}>
            {!collapsed && (
              <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Logo variant="dark" height={22} />
            </Link>
            )}
            <button
              onClick={() => setCollapsed(c => !c)}
              style={{
                background: 'none',
                border: `1.5px solid ${BORDER}`,
                borderRadius: 7,
                width: 28, height: 28,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: GRAY, fontSize: 12, flexShrink: 0,
              }}
            >
              {collapsed ? <svg viewBox="0 0 256 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M246.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-128-128c-9.2-9.2-22.9-11.9-34.9-6.9s-19.8 16.6-19.8 29.6l0 256c0 12.9 7.8 24.6 19.8 29.6s25.7 2.2 34.9-6.9l128-128z"/></svg> : <svg viewBox="0 0 256 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M9.4 278.6c-12.5-12.5-12.5-32.8 0-45.3l128-128c9.2-9.2 22.9-11.9 34.9-6.9s19.8 16.6 19.8 29.6l0 256c0 12.9-7.8 24.6-19.8 29.6s-25.7 2.2-34.9-6.9l-128-128z"/></svg>}
            </button>
          </div>

          {/* Nav items */}
          <nav>
            {NAV.map(item => {
              const active = path === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: collapsed ? '11px 0' : '11px 14px',
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    borderRadius: 10,
                    textDecoration: 'none',
                    background: active ? '#EFF6FF' : 'transparent',
                    border: active ? '1.5px solid #BFDBFE' : '1.5px solid transparent',
                    marginBottom: 4,
                    transition: 'all 0.15s',
                    color: active ? BLUE : GRAY,
                  }}
                >
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
                  {!collapsed && (
                    <span style={{ fontSize: 13, fontWeight: active ? 700 : 600 }}>{item.label}</span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </div>
    </div>
  );
}
