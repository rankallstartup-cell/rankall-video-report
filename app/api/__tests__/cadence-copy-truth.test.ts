import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Item 11: score history updates when a scan/rescan runs and fixes are
// verified by a rescan — nothing monitors daily or weekly.
describe('cadence copy matches reality', () => {
  const milestone = readFileSync(join(process.cwd(), 'app/api/milestone-email/route.ts'), 'utf8');
  const report = readFileSync(join(process.cwd(), 'app/report/[id]/page.tsx'), 'utf8');
  it('milestone email makes no daily-monitoring / multiplier claims', () => {
    for (const bad of ['monitored every day', 'every day.', '3× more likely', '2–3x', '3–4x', 'Only ~8%', 'every 3–7 days', 'top tier']) {
      expect(milestone).not.toContain(bad);
    }
    expect(milestone).toContain('Your score history updates whenever a scan or rescan runs');
  });
  it('report makes no weekly-history promise', () => {
    expect(report).not.toContain('Weekly Score History');
    expect(report).not.toContain('Track your progress weekly');
    expect(report).toContain('Your score history updates whenever a scan or rescan runs');
  });
});
