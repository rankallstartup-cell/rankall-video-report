'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase';
import { isAdminUser } from '@/lib/planConfig';

// Admin sidebar shown on ALL /admin/* pages. Renders ONLY when the signed-in
// email is on the hardcoded ADMIN_EMAILS allowlist (via isAdminUser) AND we are
// under /admin/* (guaranteed by this layout's location). The real security
// boundary is proxy.ts middleware, which redirects non-admins off /admin/*
// before any page renders — this is defense-in-depth + navigation only.
const ADMIN_LINKS = [
  { label: 'Admin Dashboard', href: '/admin/dashboard', icon: '📊' },
  { label: 'Launch Readiness', href: '/admin/launch-readiness', icon: '🚀' },
  { label: 'QA Checklist', href: '/admin/qa-checklist', icon: '✅' },
  { label: 'Plan Switcher', href: '/admin/plan-switcher', icon: '🔄' },
  { label: 'Outreach Log', href: '/admin/outreach-log', icon: '📧' },
  { label: 'Outreach Intelligence', href: '/admin/outreach-intelligence', icon: '📈' },
  { label: 'Data Quality', href: '/admin/data-quality', icon: '🧹' },
  { label: 'Scan Accuracy', href: '/admin/scan-accuracy', icon: '🎯' },
  { label: 'Demo Video', href: '/admin/demo', icon: '🎬' },
  { label: 'Product Tour', href: '/admin/tour', icon: '🧭' },
  { label: 'Gold Labels', href: '/admin/gold-labels', icon: '🏷️' },
  { label: 'Conversion', href: '/admin/conversion', icon: '💰' },
  { label: 'Founder Outreach', href: '/admin/founder-outreach', icon: '📣' },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [email, setEmail] = useState<string>('');
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    getBrowserClient().auth.getSession().then(({ data }) => {
      setEmail(data.session?.user?.email ?? '');
      setChecked(true);
    });
  }, []);

  const showAdminNav = isAdminUser(email) && (pathname?.startsWith('/admin') ?? false);

  // Until we know, or for non-admins, render the page bare (middleware handles
  // the redirect for non-admins; we never leak the admin nav to them).
  if (!checked || !showAdminNav) {
    return <>{children}</>;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F6F6FB' }}>
      <aside style={{ width: 240, flexShrink: 0, background: '#FFFFFF', borderRight: '1px solid #E7E7F0', padding: '24px 14px' }}>
        <Link href="/dashboard" style={{ display: 'block', fontSize: 12, color: '#55556A', textDecoration: 'none', marginBottom: 6 }}>← Back to app</Link>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#1B17FF', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '14px 8px 12px' }}>Admin</div>
        {ADMIN_LINKS.map((l) => {
          const active = pathname === l.href || (pathname?.startsWith(l.href + '/') ?? false);
          return (
            <Link
              key={l.href}
              href={l.href}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginBottom: 3,
                borderRadius: 8, fontSize: 13, fontWeight: active ? 700 : 600, textDecoration: 'none',
                color: active ? '#1B17FF' : '#55556A',
                background: active ? '#ECEBFF' : 'transparent',
                border: active ? '1px solid #C9C6FF' : '1px solid transparent',
              }}
            >
              <span style={{ fontSize: 16 }}>{l.icon}</span>
              <span>{l.label}</span>
            </Link>
          );
        })}
      </aside>
      <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
    </div>
  );
}
