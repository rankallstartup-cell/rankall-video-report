// A10: VerificationCard — pending/done/none for a scan's applied
// fixes. Language follows the 7-day rule: verification runs about 7
// days after a fix is marked applied. Never "weekly".
import type { VerificationBlock } from '@/lib/alinaTools';

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

export default function VerificationCard({ block }: { block: VerificationBlock }) {
  const v = block.verification;
  return (
    <div style={card} data-testid="verification-card">
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#6b7280' }}>FIX VERIFICATION</div>
      {v.state === 'none' && (
        <div style={{ fontSize: 13, color: '#374151' }}>
          No fix has been marked applied for this scan yet — mark a fix applied and its verification rescan runs about 7 days after that.
        </div>
      )}
      {v.state === 'pending' && (
        <div style={{ fontSize: 13, color: '#374151' }}>
          Verification pending — the rescan runs about 7 days after the fix was marked applied
          {typeof v.dueInDays === 'number' ? (v.dueInDays === 0 ? ' (due now).' : ` (in about ${v.dueInDays} day${v.dueInDays === 1 ? '' : 's'}).`) : '.'}
        </div>
      )}
      {v.state === 'done' && (
        <div style={{ fontSize: 13, color: '#374151' }}>
          Verified — score went from {v.beforeScore ?? '—'} to {v.afterScore ?? '—'} after the fix.
        </div>
      )}
      <a href={v.reportUrl} style={{ fontSize: 13, fontWeight: 600, color: '#1d4ed8', textDecoration: 'none' }}>
        View report →
      </a>
    </div>
  );
}
