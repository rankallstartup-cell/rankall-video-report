// Demo booking link (ticket 11). The Cal.com URL used to be hardcoded; if
// that calendar is renamed or removed the link is dead. It now comes from
// NEXT_PUBLIC_DEMO_BOOKING_URL (inlined at build). When unset or not a
// valid https URL, callers render NO calendar link and the demo-request
// form (which posts to /api/contact) is the booking path — never a dead link.
export function parseDemoBookingUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export const DEMO_BOOKING_URL: string | null = parseDemoBookingUrl(process.env.NEXT_PUBLIC_DEMO_BOOKING_URL);
