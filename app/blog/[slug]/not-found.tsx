import Link from 'next/link';

// b890: unknown post slugs hit notFound() in the [slug] page, and
// with no segment not-found the visitor got the bare framework
// 404 — no message, no way forward in the content.
export default function BlogPostNotFound() {
  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', margin: '0 0 8px' }}>
          Post not found.
        </p>
        <p style={{ fontSize: 14, color: '#64748B', margin: '0 0 20px', lineHeight: 1.6 }}>
          The article in this web address doesn&apos;t exist or has moved. Browse the latest AI visibility research instead.
        </p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
          <Link href="/blog" style={{ color: '#2563EB', fontWeight: 700, fontSize: 14 }}>Back to Blog</Link>
          <Link href="/" style={{ color: '#2563EB', fontWeight: 700, fontSize: 14 }}>Back to home</Link>
        </div>
      </div>
    </div>
  );
}
