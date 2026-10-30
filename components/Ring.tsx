'use client';

import { useState, useEffect } from 'react';
import { GREEN, AMBER, RED, WHITE, GRAY, BORDER } from '@/lib/constants';

interface RingProps {
  score: number;
  size?: number;
  showLabel?: boolean;
}

export default function Ring({ score, size = 90, showLabel = true }: RingProps) {
  const [val, setVal] = useState(0);
  const r = size / 2 - 8;
  const circ = 2 * Math.PI * r;
  const col = val >= 70 ? GREEN : val >= 40 ? AMBER : RED;

  useEffect(() => {
    let v = 0;
    const t = setInterval(() => {
      v = Math.min(v + score / 80, score);
      setVal(Math.floor(v));
      if (v >= score) clearInterval(t);
    }, 16);
    return () => clearInterval(t);
  }, [score]);

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={BORDER}
          strokeWidth={8}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={col}
          strokeWidth={8}
          strokeDasharray={circ}
          strokeDashoffset={circ - (val / 100) * circ}
          strokeLinecap="round"
          style={{
            transition: 'stroke-dashoffset 0.05s linear',
            filter: `drop-shadow(0 0 6px ${col})`,
          }}
        />
      </svg>
      {showLabel && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: size * 0.24, fontWeight: 900, color: WHITE, lineHeight: 1, fontFamily: 'monospace' }}>
            {val}
          </span>
          <span style={{ fontSize: size * 0.12, color: GRAY }}>/ 100</span>
        </div>
      )}
    </div>
  );
}