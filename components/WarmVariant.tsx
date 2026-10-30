'use client';
import { useState, useEffect } from 'react';

// CONV-06: warm-channel report variants. Reads the rk_src cookie (set by
// PostHogProvider from UTM params) and shows a co-branded header for
// warm traffic — influencer or agency-referred. Cold traffic sees nothing.

type Variant = { kind: 'influencer' | 'agency'; label: string } | null;

function readVariant(): Variant {
  try {
    const match = document.cookie.split('; ').find((c) => c.startsWith('rk_src='));
    if (!match) return null;
    const p = JSON.parse(decodeURIComponent(match.split('=')[1])) as Record<string, unknown>;
    const us = typeof p.us === 'string' ? p.us.toLowerCase() : '';
    if (p.ref === true || us.includes('influencer') || us.includes('affiliate')) {
      // utm_source may carry the influencer handle (e.g. influencer-john)
      const handle = typeof p.us === 'string' && p.us.includes('-') ? p.us.split('-').slice(1).join('-') : null;
      return { kind: 'influencer', label: handle || 'a Rankall partner' };
    }
    if (us.includes('agency')) {
      return { kind: 'agency', label: 'your agency' };
    }
    return null;
  } catch {
    return null;
  }
}

export default function WarmVariant() {
  const [variant, setVariant] = useState<Variant>(null);

  useEffect(() => {
    setVariant(readVariant());
  }, []);

  if (!variant) return null;

  if (variant.kind === 'influencer') {
    return (
      <div style={{ background: '#FFF7ED', border: '1.5px solid #FDBA74', borderRadius: 14, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 24 }}>🤝</span>
        <div>
          <p style={{ fontSize: 14, fontWeight: 800, color: '#9A3412', margin: '0 0 4px' }}>
            Referred by {variant.label}
          </p>
          <p style={{ fontSize: 13, color: '#0A0A14', margin: 0, lineHeight: 1.5 }}>
            They thought you should see how AI sees your business. This report is free — no signup needed to view it.
          </p>
        </div>
      </div>
    );
  }

  // agency
  return (
    <div style={{ background: '#EEF0FF', border: '1.5px solid #C9D4FF', borderRadius: 14, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 24 }}>🏢</span>
      <div>
        <p style={{ fontSize: 14, fontWeight: 800, color: '#1B17FF', margin: '0 0 4px' }}>
          Sent by {variant.label}
        </p>
        <p style={{ fontSize: 13, color: '#0A0A14', margin: 0, lineHeight: 1.5 }}>
          Your agency already knows about these issues — ask them about the fast-track fix plan. Or start your free trial and fix them yourself.
        </p>
      </div>
    </div>
  );
}
