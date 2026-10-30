// A10: DraftCard — the draft content for one fix. Drafting is NOT
// applying: the card says so, and shows whether the draft is saved
// (signed-in) or on-screen only (anonymous + signup CTA).
import type { DraftBlock } from '@/lib/alinaTools';
import AlinaMessage from '@/components/AlinaMessage';

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

export default function DraftCard({ block }: { block: DraftBlock }) {
  const d = block.draft;
  return (
    <div style={card} data-testid="draft-card">
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#6b7280' }}>FIX DRAFT</div>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{d.title}</div>
      <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
        <AlinaMessage text={d.content} />
      </div>
      <div style={{ fontSize: 12, color: '#6b7280' }}>
        {d.saved
          ? 'Saved to your fix plan. This draft does not apply the fix — apply it from the report when you are ready.'
          : 'Draft shown on-screen only — not saved.'}
      </div>
      {!d.saved && d.signupUrl && (
        <a href={d.signupUrl} style={{ fontSize: 13, fontWeight: 600, color: '#1d4ed8', textDecoration: 'none' }}>
          Sign up to save this draft →
        </a>
      )}
    </div>
  );
}
