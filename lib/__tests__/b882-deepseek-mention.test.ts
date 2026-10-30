import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectBusinessMention } from '@/lib/analyser-ml';

// b882 — the Royal Lane report's entire score (2/100) rested on
// DeepSeek "Partly mentioned": the stored response (real staging
// data, scan e724e9f9) never names the business. The stored
// mentioned=true flag predates the b879 detector fix. This pins
// the CURRENT detector's verdict on that exact response.

const response = readFileSync(join(process.cwd(), 'lib/__tests__/deepseek-e724e9f9.txt'), 'utf8');

describe('b882 — current detector on the stored DeepSeek response', () => {
  it('the response really does not name the business', () => {
    expect(response.toLowerCase()).not.toContain('royal lane');
  });

  it('the fixed detector does not credit a mention', () => {
    expect(detectBusinessMention(response, 'Royal Lane Dental Center', 'Dallas')).toBe(false);
    expect(detectBusinessMention(response, 'Royal Lane Dental Center - Best Dentist in Dallas', 'Dallas')).toBe(false);
  });
});

import { readFileSync as readSrc } from 'node:fs';

describe('b882 — report math reads honestly', () => {
  const page = readSrc(join(process.cwd(), 'app/report/[id]/page.tsx'), 'utf8');

  it('the score equation shows the division AND the rounding', () => {
    expect(page).toContain('responding weight = {(weightedPoints / respondingWeight).toFixed(1)}%, rounded to');
    expect(page).not.toContain('= {weightedPoints.toFixed(1)} pts ÷ {respondingWeight.toFixed(2)} responding weight</li>');
  });

  it('the trust snapshot states its formula when it reconciles', () => {
    expect(page).toContain('passing × 1 + {partial} partial × ½) ÷ {total} signals');
    expect(page).toContain('from this scan&apos;s stored signal report');
  });
});
