// Global loading shell (azxj): streams instantly on slow navigations so the
// page never sits blank while a server component fetches. Next.js renders
// this inside the root layout's <Suspense> boundary automatically — no
// route changes needed. Route-level loading.tsx files (programmatic page,
// report) override this with page-shaped skeletons.

const BAR: React.CSSProperties = {
  background: '#E2E8F0',
  borderRadius: 8,
  animation: 'azxj-pulse 1.4s ease-in-out infinite',
};

export default function Loading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading"
      style={{
        fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif",
        background: '#F8FAFC',
        minHeight: '100vh',
      }}
    >
      <style>{`@keyframes azxj-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }`}</style>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '48px 24px 80px' }}>
        <div style={{ ...BAR, width: 180, height: 14, marginBottom: 24 }} />
        <div style={{ ...BAR, width: '70%', height: 40, marginBottom: 12 }} />
        <div style={{ ...BAR, width: '55%', height: 18, marginBottom: 32 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ background: '#FFFFFF', border: '1.5px solid #E2E8F0', borderRadius: 14, padding: 20 }}>
              <div style={{ ...BAR, width: 90, height: 28, marginBottom: 8 }} />
              <div style={{ ...BAR, width: 130, height: 12 }} />
            </div>
          ))}
        </div>
        <div style={{ ...BAR, width: '40%', height: 22, marginBottom: 16 }} />
        <div style={{ ...BAR, width: '100%', height: 220, borderRadius: 14 }} />
      </div>
    </div>
  );
}
