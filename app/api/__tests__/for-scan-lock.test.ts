import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// b0fm: for-scan returned every fix's full generated_content, so a
// free viewer could read locked fix content from the network response
// even though the report UI hides locked fixes.
const route = readFileSync(join(process.cwd(), 'app/api/fixes/for-scan/route.ts'), 'utf8');

describe('b0fm for-scan paywall lock', () => {
  it('resolves the viewer plan via the shared server cascade', () => {
    expect(route).toContain('resolvePlanServer');
    expect(route).toContain('isPaidPlan');
  });

  it('strips paid content from locked fixes', () => {
    expect(route).toContain('generated_content: null');
    expect(route).toContain('why_recommended: null');
    expect(route).toContain('locked: true');
  });

  it('keeps the ownership 403 for owned scans', () => {
    expect(route).toContain("status: 403");
  });
});
