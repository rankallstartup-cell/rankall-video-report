// A7: ScanCard — renders a completed scan's summary (from the scan's own
// stored data, never a model-invented number). Partial scans say so:
// the score is based on the platforms that responded.
import type { ScanBlock } from '@/lib/alinaTools';

const card: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 14,
  background: '#fff',
  color: '#111827',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

export default function ScanCard({ block }: { block: ScanBlock }) {
  const s = block.scan;
  return (
    <div style={card} data-testid="scan-card">
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#6b7280' }}>SCAN RESULT</div>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{s.businessName}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 32, fontWeight: 800, lineHeight: 1 }}>{s.score}</span>
        <span style={{ fontSize: 14, color: '#6b7280' }}>/ 100</span>
      </div>
      <div style={{ fontSize: 13, color: '#374151' }}>
        Mentioned on {s.mentionedCount} of {s.respondedCount} responding platforms
        {s.respondedCount < s.totalPlatforms ? ` (of ${s.totalPlatforms} scanned)` : ''}.
      </div>
      {s.partial && (
        <div style={{ fontSize: 12, color: '#92400e', background: '#fef3c7', borderRadius: 8, padding: '6px 8px' }}>
          Partial scan — {s.missingPlatforms.length > 0
            ? `${s.missingPlatforms.join(', ')} did not respond, so the score is based on the platforms that did.`
            : 'some platforms did not respond, so the score is based on the platforms that did.'}
        </div>
      )}
      {s.topCompetitors.length > 0 && (
        <div style={{ fontSize: 13, color: '#374151' }}>
          Top competitor: {s.topCompetitors[0].name}
          {typeof s.topCompetitors[0].score === 'number' ? ` (${s.topCompetitors[0].score}/100)` : ' (score not measured)'}
        </div>
      )}
      <a href={s.reportUrl} style={{ fontSize: 13, fontWeight: 600, color: '#1d4ed8', textDecoration: 'none' }}>
        View full report →
      </a>
    </div>
  );
}
