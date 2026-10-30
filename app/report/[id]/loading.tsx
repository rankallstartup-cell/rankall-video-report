// Report-page loading shell (azxj): /report/[id] loads a scan + its fixes
// and trust signals, so navigation can take a moment. This skeleton matches
// the report's shape (score panel, trust-signal rows, fix queue) and streams
// immediately instead of a blank page.

const BAR: React.CSSProperties = {
  background: '#E2E8F0',
  borderRadius: 8,
  animation: 'azxj-pulse 1.4s ease-in-out infinite',
};

export default function ReportLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading report"
      style={{
        fontFamily: "'Inter','Helvetica Neue',Arial,sans-serif",
        background: '#F8FAFC',
        minHeight: '100vh',
      }}
    >
      <style>{`@keyframes azxj-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }`}</style>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '32px 24px 80px' }}>
        <div style={{ ...BAR, width: 200, height: 14, marginBottom: 20 }} />
        <div style={{ ...BAR, width: '60%', height: 36, marginBottom: 12 }} />
        <div style={{ ...BAR, width: '45%', height: 16, marginBottom: 28 }} />
        <div style={{ background: '#FFFFFF', border: '1.5px solid #E2E8F0', borderRadius: 16, padding: 28, marginBottom: 28 }}>
          <div style={{ ...BAR, width: 120, height: 64, borderRadius: 12, marginBottom: 12 }} />
          <div style={{ ...BAR, width: '70%', height: 16 }} />
        </div>
        <div style={{ ...BAR, width: '30%', height: 22, marginBottom: 16 }} />
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ background: '#FFFFFF', border: '1.5px solid #E2E8F0', borderRadius: 12, padding: 20, marginBottom: 12 }}>
            <div style={{ ...BAR, width: '55%', height: 18, marginBottom: 8 }} />
            <div style={{ ...BAR, width: '85%', height: 12 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
