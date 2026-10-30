// A8: FixPlanCard — the top fix plan (read-only: Alina never applies a
// fix). Same canonical impacts + grouping as the report queue.
import type { FixPlanBlock } from '@/lib/alinaTools';

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

export default function FixPlanCard({ block }: { block: FixPlanBlock }) {
  const p = block.plan;
  return (
    <div style={card} data-testid="fix-plan-card">
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#6b7280' }}>YOUR FIX PLAN</div>
      {p.fixes.length === 0 ? (
        <div style={{ fontSize: 13, color: '#374151' }}>No pending fixes for this scan — nothing to do right now.</div>
      ) : (
        p.fixes.map((f, i) => (
          <div key={f.fixType} style={{ borderTop: i === 0 ? 'none' : '1px solid #f3f4f6', paddingTop: i === 0 ? 0 : 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>
                #{i + 1} {f.title}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#15803d', whiteSpace: 'nowrap' }}>
                {typeof f.impact === 'number' ? `+${f.impact} pts` : 'Impact not estimated'}
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              Effort: {f.effort} · {f.group === 'diy' ? 'Do it yourself' : 'Send to your web person'}
            </div>
          </div>
        ))
      )}
      {p.totalPending > p.fixes.length && (
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          +{p.totalPending - p.fixes.length} more pending fix{p.totalPending - p.fixes.length === 1 ? '' : 'es'} in your full plan.
        </div>
      )}
      <a href={p.reportUrl} style={{ fontSize: 13, fontWeight: 600, color: '#1d4ed8', textDecoration: 'none' }}>
        View full plan →
      </a>
    </div>
  );
}
