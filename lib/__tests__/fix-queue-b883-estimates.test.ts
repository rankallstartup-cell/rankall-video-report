import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixTypeEstimate, buildFixEvidence } from '@/lib/fixIntelligence';

// b883 (fix-engine journey) — the queue cards contradicted
// themselves and omitted confidence: the FAQ card header said
// "45 min" (the generated row's stored value) while its own
// steps said "Estimated time: 20-30 minutes" (the evidence
// map), and no card showed a per-fix confidence even though the
// report cards do. The evidence map is now the single source
// for the card's confidence/difficulty/time.

describe('b883 — fixTypeEstimate single-sources the card', () => {
  it('matches the evidence the steps and tool detail use', () => {
    expect(fixTypeEstimate('faq_schema')).toEqual({ confidence: 85, difficulty: 'Easy', timeToImplement: '20-30 minutes' });
    expect(fixTypeEstimate('jsonld')).toEqual({ confidence: 88, difficulty: 'Easy', timeToImplement: '15-20 minutes' });
  });

  it('unknown fix types get NO estimate (never the generic fallback)', () => {
    expect(fixTypeEstimate('some_unknown_type')).toBeNull();
    expect(fixTypeEstimate(null)).toBeNull();
    expect(buildFixEvidence({ fixType: 'some_unknown_type' }).known).toBe(false);
    expect(buildFixEvidence({ fixType: 'faq_schema' }).known).toBe(true);
  });

  it('the queue cards render the derived estimate', () => {
    const page = readFileSync(join(process.cwd(), 'app/dashboard/fix/page.tsx'), 'utf8');
    expect(page).toContain('fixTypeEstimate(fix.fix_type)');
    expect(page).toContain('fixTypeEstimate(signalFix.fix_type)');
    expect(page).toContain('`${est.confidence}% confidence`');
  });
});
