// PricingCard — renders a server-computed PricingBlock (A3) inside the
// Alina widget. Ground truth only: every price comes from the tool,
// which reads lib/publicStats.ts. No price literal lives here — the
// component renders what the server computed, nothing more.
//
// Imported by components/Chatbot.tsx (a client component). This file
// imports only the block TYPE from lib/alinaTools (erased at compile
// time), so no server code enters the client bundle.
import type { PricingBlock } from '@/lib/alinaTools';

const C = {
  border: '#E2E8F0',
  navy: '#0F172A',
  blue: '#2563EB',
  green: '#059669',
  gray: '#64748B',
  surface: '#F8FAFC',
};

export default function PricingCard({ block }: { block: PricingBlock }) {
  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: '12px 14px',
        fontSize: 13,
        color: C.navy,
        lineHeight: 1.5,
      }}
    >
      <p style={{ fontSize: 12, fontWeight: 700, color: C.navy, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>
        Pricing
      </p>
      {block.tiers.map((t) => (
        <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: `1px solid ${C.border}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>
              {t.name} — ${t.monthly.toLocaleString('en-US')}/mo
            </p>
            <p style={{ fontSize: 12, color: C.gray, margin: '2px 0 0' }}>{t.blurb}</p>
          </div>
          <a
            href={t.cta.href}
            style={{
              background: C.blue, color: '#fff', borderRadius: 999,
              padding: '7px 14px', fontSize: 12, fontWeight: 700,
              textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            {t.cta.label}
          </a>
        </div>
      ))}
      <p style={{ fontSize: 12, color: C.gray, margin: '10px 0 0' }}>
        Paid plans start with a {block.trial.days}-day free trial. A card is required upfront; nothing is charged
        until the trial ends. Trial covers {block.trial.locations} business location.
      </p>
    </div>
  );
}
