'use client';

// CONV-04: honest urgency surfaces. Every element is driven by REAL data —
// never fake countdowns or fake scarcity (serious-company rule).
//
// Three surfaces:
// 1. Competitor movement — from score history (competitor_score trend)
// 2. Report refresh window — from the scan's created_at
// 3. Fix-queue staleness — from pending fixes' created_at

interface HistoryPoint {
  your_score: number;
  competitor_score: number | null;
  recorded_at: string;
}

interface PendingFix {
  id: string;
  title: string;
  created_at?: string;
}

function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86400000));
}

export default function HonestUrgency({
  history,
  scanCreatedAt,
  pendingFixes,
  competitorName,
}: {
  history?: HistoryPoint[];
  scanCreatedAt?: string;
  pendingFixes?: PendingFix[];
  competitorName?: string;
}) {
  const items: Array<{ icon: string; title: string; body: string; tone: 'red' | 'amber' | 'blue' }> = [];

  // 1. Competitor movement — real score trend from history.
  if (history && history.length >= 2) {
    const first = history[0];
    const last = history[history.length - 1];
    const firstComp = first.competitor_score ?? 0;
    const lastComp = last.competitor_score ?? 0;
    const delta = lastComp - firstComp;
    if (delta > 0 && lastComp > 0) {
      items.push({
        icon: '⚠️',
        title: 'Competitor gaining',
        body: `${competitorName || 'A competitor'} improved ${delta} pts since ${new Date(first.recorded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}. Every week you wait is a week they pull ahead.`,
        tone: 'red',
      });
    }
  }

  // 2. Report refresh window — real age from scan created_at.
  if (scanCreatedAt) {
    const age = daysSince(scanCreatedAt);
    if (age >= 7) {
      items.push({
        icon: '🔄',
        title: 'Report is stale',
        body: `This report is ${age} days old. AI platforms update constantly — rescan to see your current position.`,
        tone: 'amber',
      });
    } else if (age >= 1) {
      items.push({
        icon: '📅',
        title: 'Report refresh',
        body: `This report is ${age} day${age === 1 ? '' : 's'} old. Your next verification rescan keeps it current.`,
        tone: 'blue',
      });
    }
  }

  // 3. Fix-queue staleness — real ages from pending fixes.
  if (pendingFixes && pendingFixes.length > 0) {
    const stale = pendingFixes
      .filter((f) => f.created_at)
      .map((f) => ({ ...f, age: daysSince(f.created_at as string) }))
      .filter((f) => f.age >= 14)
      .sort((a, b) => b.age - a.age);
    if (stale.length > 0) {
      const oldest = stale[0];
      items.push({
        icon: '⏳',
        title: 'Fixes going stale',
        body:
          stale.length === 1
            ? `1 fix ("${oldest.title.slice(0, 40)}${oldest.title.length > 40 ? '…' : ''}") has been waiting ${oldest.age} days. Unfixed issues compound.`
            : `${stale.length} fixes have been waiting 14+ days (oldest: ${oldest.age} days). Unfixed issues compound.`,
        tone: 'amber',
      });
    }
  }

  if (items.length === 0) return null;

  const tones = {
    red: { bg: '#FEF2F2', border: '#FECACA', title: '#DC2626' },
    amber: { bg: '#FFFBEB', border: '#FCD34D', title: '#D97706' },
    blue: { bg: '#EEF0FF', border: '#C9D4FF', title: '#1B17FF' },
  } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '20px 0' }}>
      {items.map((item) => {
        const t = tones[item.tone];
        return (
          <div key={item.title} style={{ background: t.bg, border: `1.5px solid ${t.border}`, borderRadius: 14, padding: '16px 20px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>{item.icon}</span>
            <div>
              <p style={{ fontSize: 14, fontWeight: 800, color: t.title, margin: '0 0 4px' }}>{item.title}</p>
              <p style={{ fontSize: 13, color: '#0A0A14', margin: 0, lineHeight: 1.6 }}>{item.body}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
