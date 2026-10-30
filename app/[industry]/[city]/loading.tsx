// Programmatic-page loading shell (azxj): the /{industry}/{city} page runs
// a live aggregate query, so navigation can take a moment. This skeleton
// matches the page's shape (breadcrumb, H1, stat cards, FAQ-shaped blocks)
// and streams immediately instead of a blank page.

const BAR: React.CSSProperties = {
  background: '#E2E8F0',
  borderRadius: 8,
  animation: 'azxj-pulse 1.4s ease-in-out infinite',
};

export default function ProgrammaticLoading() {
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
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '32px 24px 80px' }}>
        <div style={{ ...BAR, width: 220, height: 14, marginBottom: 20 }} />
        <div style={{ ...BAR, width: '75%', height: 42, marginBottom: 12 }} />
        <div style={{ ...BAR, width: '60%', height: 18, marginBottom: 28 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 32 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ background: '#FFFFFF', border: '1.5px solid #E2E8F0', borderRadius: 14, padding: 20 }}>
              <div style={{ ...BAR, width: 70, height: 28, marginBottom: 8 }} />
              <div style={{ ...BAR, width: 110, height: 12 }} />
            </div>
          ))}
        </div>
        <div style={{ ...BAR, width: '35%', height: 22, marginBottom: 16 }} />
        <div style={{ ...BAR, width: '100%', height: 260, borderRadius: 14, marginBottom: 28 }} />
        <div style={{ ...BAR, width: '45%', height: 22, marginBottom: 16 }} />
        <div style={{ ...BAR, width: '100%', height: 180, borderRadius: 14 }} />
      </div>
    </div>
  );
}
