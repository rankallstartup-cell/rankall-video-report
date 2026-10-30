import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalFixImpact, computePredictedScoreLift } from '../../../lib/fixIntelligence';
import { projectScore } from '../../../lib/projection';

// Item 8: the fix page "Score impact" shrank the impact by remaining headroom
// (score 80 + knowledge_panel → +5) while the queue showed +23.
describe('fix page score impact = queue impact', () => {
  it('headroom-capped lift differs from the canonical impact at high scores', () => {
    const signals = { overallScore: 80, platformsMentioned: 6 };
    expect(computePredictedScoreLift(['knowledge_panel'], signals)).toBe(5);
    expect(canonicalFixImpact('knowledge_panel')).toBe(23);
    expect(projectScore(80, 23)).toBe(85);
  });
  it('the page shows the canonical impact, with the capped score separately', () => {
    const src = readFileSync(join(process.cwd(), 'app/dashboard/fix/page.tsx'), 'utf8');
    expect(src).not.toContain("v: `+${computePredictedScoreLift([TOOL_TO_FIX_TYPE[activeTool] ?? activeTool], signals)} pts`");
    expect(src).toContain('const impact = canonicalFixImpact(TOOL_TO_FIX_TYPE[activeTool] ?? activeTool);');
    expect(src).toContain("'Projected score (capped)'");
  });
});
