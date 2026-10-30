import Link from 'next/link';

// b893: unknown business slugs hit notFound() in the [slug] page,
// and with no segment not-found the visitor got the bare framework
// 404 — no message, no way forward.
export default function BusinessNotFound() {
  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: '0 0 8px' }}>
          That business profile doesn&apos;t exist.
        </p>
        <p style={{ fontSize: 14, color: '#64748B', margin: '0 0 20px', lineHeight: 1.6 }}>
          The business in this web address has not been scanned yet, or the address is wrong. See which businesses AI recommends, or run a free scan for your own.
        </p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
          <Link href="/leaderboard" style={{ color: '#2563EB', fontWeight: 700, fontSize: 14 }}>Public leaderboard</Link>
          <Link href="/" style={{ color: '#2563EB', fontWeight: 700, fontSize: 14 }}>Back to home</Link>
        </div>
      </div>
    </div>
  );
}
