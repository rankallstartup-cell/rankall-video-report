import Link from 'next/link';

// b87g: unknown industry/city combos (including legacy variants
// like /dentist/dallas-tx, which is not a published slug — the
// canonical URL is /dentist/dallas) hit notFound() in the page.
// This gives that 404 a message and exits instead of the bare
// framework page.
export default function IndustryCityNotFound() {
  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: '0 0 8px' }}>
          That page doesn&apos;t exist.
        </p>
        <p style={{ fontSize: 14, color: '#64748B', margin: '0 0 20px', lineHeight: 1.6 }}>
          The industry or city in this web address is not one Rankall tracks. Browse the cities and industries we do track, or run a free scan for your own business.
        </p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
          <Link href="/cities" style={{ color: '#2563EB', fontWeight: 700, fontSize: 14 }}>Browse cities</Link>
          <Link href="/industries" style={{ color: '#2563EB', fontWeight: 700, fontSize: 14 }}>Browse industries</Link>
          <Link href="/" style={{ color: '#2563EB', fontWeight: 700, fontSize: 14 }}>Back to home</Link>
        </div>
      </div>
    </div>
  );
}
