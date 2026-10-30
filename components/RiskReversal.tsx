'use client';

// CONV-03: shared risk-reversal messaging. Used at EVERY call-to-action
// (report page, pricing page, trial start) with IDENTICAL wording.
// If the offer changes, change it here once — never per-page.

const ITEMS = [
  { icon: '✓', text: '$0 today' },
  { icon: '✓', text: '7-day free trial — card required, nothing charged until it ends' },
  { icon: '✓', text: '14-day money-back guarantee' },
  { icon: '✓', text: 'Cancel anytime in a few clicks' },
  { icon: '✓', text: 'You keep your report forever, even if you cancel' },
];

export default function RiskReversal({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p style={{ fontSize: 12, color: '#55556A', textAlign: 'center', margin: '12px 0 0', lineHeight: 1.6 }}>
        $0 today · 7-day free trial · 14-day money-back · Cancel anytime · Keep your report forever
      </p>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '16px 0' }}>
      {ITEMS.map((item) => (
        <div key={item.text} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 20, height: 20, borderRadius: '50%', background: '#ECFDF5',
              border: '1px solid #A7F3D0', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#059669',
              flexShrink: 0,
            }}
          >
            {item.icon}
          </span>
          <span style={{ fontSize: 13, color: '#0A0A14', fontWeight: 500 }}>{item.text}</span>
        </div>
      ))}
    </div>
  );
}
