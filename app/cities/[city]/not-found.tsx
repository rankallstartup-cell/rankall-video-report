import Link from 'next/link';

// b895: unknown city slugs hit notFound() in the [city] page, and
// with no segment not-found the visitor got the bare framework
// 404 — no message, no way forward. This gives the failure a
// name and two exits.
export default function CityNotFound() {
  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: '0 0 8px' }}>
          We don&apos;t track that city yet.
        </p>
        <p style={{ fontSize: 14, color: '#64748B', margin: '0 0 20px', lineHeight: 1.6 }}>
          The city in this web address is not one of the cities Rankall tracks. Browse the full list, or run a free scan for your own business.
        </p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
          <Link href="/cities" style={{ color: '#2563EB', fontWeight: 700, fontSize: 14 }}>Browse all cities</Link>
          <Link href="/" style={{ color: '#2563EB', fontWeight: 700, fontSize: 14 }}>Back to home</Link>
        </div>
      </div>
    </div>
  );
}
