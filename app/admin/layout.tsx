import type { Metadata } from 'next';
import AdminShell from './AdminShell';

// Round 2: /admin/* must never be indexed. The sidebar is a client
// component (AdminShell), so this server layout exists to carry the
// metadata: noindex/nofollow and no inherited self-canonical. robots.ts
// also disallows /admin/. Access control stays in proxy.ts.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
