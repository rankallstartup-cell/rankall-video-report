// RankAll logo for Satori / next/og share images (mark + wordmark).
// Satori can't load /rankall-logo-white.png without a network fetch, so the
// mark is the same vector as public/rankall-mark.svg, drawn inline.
export function OgLogo({ size = 44, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <svg width={Math.round(size * 320 / 300)} height={size} viewBox="0 0 320 300">
        <g transform="translate(-280,-795)" fill="#1B17FF">
          <rect x="357.8" y="805" width="96" height="280" rx="48" transform="rotate(34.5 405.8 945)" />
          <circle cx="524.4" cy="999.5" r="49.5" />
        </g>
      </svg>
      <div style={{ display: 'flex', marginLeft: Math.round(size * 0.25), fontSize: Math.round(size * 0.72), fontWeight: 500, color, letterSpacing: -1 }}>RankAll</div>
    </div>
  );
}
