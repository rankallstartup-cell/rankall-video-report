'use client';

import { useState } from 'react';
import { PLATFORM_META } from '@/lib/platformConfig';

// Self-contained brand map so the badge renders correctly anywhere without a
// shared config import. Colors mirror each platform's brand mark.
const PLATFORM_BRAND: Record<string, { color: string; initial: string }> = {
  ChatGPT:    { color: '#10A37F', initial: 'C' },
  Gemini:     { color: '#4285F4', initial: 'G' },
  'Google AI':{ color: '#EA4335', initial: 'G' },
  Copilot:    { color: '#0078D4', initial: 'C' },
  Perplexity: { color: '#20808D', initial: 'P' },
  Grok:       { color: '#334155', initial: 'X' },
  Claude:     { color: '#CC785C', initial: 'C' },
  DeepSeek:   { color: '#4D6BFE', initial: 'D' },
  Mistral:    { color: '#FF7000', initial: 'M' },
  Kimi:       { color: '#6366F1', initial: 'K' },
  Groq:       { color: '#F55036', initial: 'G' },
  'Meta AI':  { color: '#0668E1', initial: 'M' },
};

function brandFor(platform: string) {
  return PLATFORM_BRAND[platform] ?? { color: '#64748B', initial: (platform[0] || '?').toUpperCase() };
}

export interface PlatformBadgeProps {
  platform: string;
  /** When provided, shows a mentioned / not-mentioned status pip. */
  mentioned?: boolean;
  /**
   * b8a2: whether the platform returned any response in the scan. When
   * false (and mentioned is false), the status is "No response" — a
   * platform that never answered is not "Not mentioned". Callers that
   * don't pass it keep the old two-state behaviour.
   */
  responded?: boolean;
  size?: 'sm' | 'md';
  /** Show the mentioned status pip + label. Defaults to true when `mentioned` is passed. */
  showStatus?: boolean;
  style?: React.CSSProperties;
}

// A brand-colored chip for an AI platform, optionally carrying its recommend
// status. Text color inherits so it reads on both light and dark surfaces.
export default function PlatformBadge({ platform, mentioned, responded, size = 'md', showStatus, style }: PlatformBadgeProps) {
  const brand = brandFor(platform);
  const withStatus = (showStatus ?? mentioned !== undefined) && mentioned !== undefined;
  const isMd = size === 'md';
  const mark = isMd ? 24 : 18;
  const font = isMd ? 13 : 12;
  const [showTooltip, setShowTooltip] = useState(false);
  // b8a2: three honest states — a platform that never responded is not
  // "Not mentioned".
  const noResponse = mentioned === false && responded === false;
  const statusLabel = mentioned ? 'Mentioned' : noResponse ? 'No response' : 'Not mentioned';
  const tooltipText = (<>{platform}{mentioned === undefined ? '' : mentioned ? (<> <svg viewBox="0 0 448 512" width="10" height="10" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> Recommended</>) : noResponse ? ' · No response recorded' : ' · Not recommended'}</>);

  return (
    <span
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      style={{ position: 'relative', display: 'inline-flex' }}
    >
      <style>{`
        @keyframes recommendedPulse {
          0%, 100% { box-shadow: 0 0 12px rgba(34,197,94,0.5); }
          50% { box-shadow: 0 0 20px rgba(34,197,94,0.8); }
        }
      `}</style>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: isMd ? '5px 12px 5px 6px' : '3px 9px 3px 4px',
          borderRadius: 999,
          border: '1px solid rgba(148,163,184,0.28)',
          background: 'rgba(148,163,184,0.06)',
          fontWeight: 700,
          fontSize: font,
          color: 'inherit',
          lineHeight: 1,
          whiteSpace: 'nowrap',
          animation: mentioned === true ? 'recommendedPulse 2s ease-in-out infinite' : undefined,
          ...style,
        }}
      >
      <span
        aria-hidden
        style={{
          width: mark,
          height: mark,
          borderRadius: isMd ? 7 : 6,
          background: brand.color,
          color: '#fff',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: isMd ? 12 : 10,
          fontWeight: 800,
          flexShrink: 0,
        }}
      >
        {brand.initial}
      </span>
      <span>{platform}</span>
      {PLATFORM_META[platform.toLowerCase()]?.badge && (
        <span
          style={{
            background: PLATFORM_META[platform.toLowerCase()]?.badgeColor,
            color: PLATFORM_META[platform.toLowerCase()]?.badgeTextColor,
            fontSize: 9,
            fontWeight: 700,
            padding: '1px 5px',
            borderRadius: 4,
            marginLeft: 4,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {PLATFORM_META[platform.toLowerCase()]?.badge}
        </span>
      )}
      {withStatus && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            marginLeft: 2,
            paddingLeft: 8,
            borderLeft: '1px solid rgba(148,163,184,0.28)',
            color: mentioned ? '#16a34a' : '#94a3b8',
            fontSize: font - 1,
            fontWeight: 700,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: mentioned ? '#22c55e' : '#94a3b8',
              display: 'inline-block',
            }}
          />
          {statusLabel}
        </span>
      )}
      </span>
      {showTooltip && (
        <span
          style={{
            position: 'absolute',
            bottom: '110%',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#0F172A',
            color: 'white',
            padding: '4px 8px',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            border: '1px solid #E2E8F0',
            zIndex: 100,
            pointerEvents: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          {tooltipText}
        </span>
      )}
    </span>
  );
}
