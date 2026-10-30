import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b88u — /admin/qa-checklist: (a) the health payload already
// carried a server timestamp that was never rendered, so the
// 9/16 result was undated; (b) test descriptions hardcoded stale
// expectation numbers (a mixed "Free 3 / Business 100" caps line
// matching no single feature; a flat "35 signals") — both now
// DERIVE from PLAN_LIMITS / TRUST_SIGNAL_COUNT at render.

const qa = readFileSync(join(process.cwd(), 'app/admin/qa-checklist/QAChecklist.tsx'), 'utf8');
const wrapper = readFileSync(join(process.cwd(), 'app/admin/qa-checklist/page.tsx'), 'utf8');

describe('b88u — qa checklist honesty', () => {
  it('the health run is timestamped on the page', () => {
    expect(qa).toContain('Last checked: {new Date(health.timestamp).toLocaleString()}');
  });

  it('expectation numbers derive from the canonical sources', () => {
    expect(qa).toContain('all {TRUST_SIGNAL_COUNT} signals');
    expect(qa).toContain("getPlanLimit('business', 'local_scan')");
    expect(qa).toContain("getPlanLimit('agency', 'competitor_scan')");
    expect(qa).not.toContain('(Free 3 / Business 100 / Agency 1000 / Enterprise unlimited)');
  });

  it('the denial names the restriction', () => {
    expect(wrapper).toContain('Access denied — admin only.');
  });
});
