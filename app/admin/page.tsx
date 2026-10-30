import { redirect } from 'next/navigation';

// b33n: /admin had no index page, so even admins got the generic 404
// ("Page not found") at the admin entry point. The real admin landing
// page is /admin/dashboard (AdminShell's first nav link). Redirect there.
// Access control stays in proxy.ts (non-admins on /admin* are sent to
// /dashboard before this page ever renders) + useAdminGuard.
export default function AdminIndex() {
  redirect('/admin/dashboard');
}
