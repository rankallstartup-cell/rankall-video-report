// Routes that have their own app shell (sidebar + top bar). The marketing
// announcement bar, header and footer (components/SiteChrome.tsx) are not
// rendered there — otherwise the website menu stacks on top of the app menu.
export function hasAppShell(path: string | null | undefined): boolean {
  if (!path) return false;
  return path === '/dashboard' || path.startsWith('/dashboard/')
    || path === '/admin' || path.startsWith('/admin/');
}

// Marketing chrome is also hidden on the homepage (it renders its own copy),
// the demo tour and shared report pages.
export function hideSiteChrome(path: string | null | undefined): boolean {
  if (!path) return false;
  return path === '/' || path === '/demo' || path.startsWith('/r/') || hasAppShell(path);
}
