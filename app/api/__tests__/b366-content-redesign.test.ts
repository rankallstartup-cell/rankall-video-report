import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync('app/dashboard/content/page.tsx', 'utf8');

describe('b366 content studio redesign', () => {
  it('keeps the honest copy-failure state', () => {
    expect(src).toContain('setFailed(true)');
    expect(src).toContain('Copy failed — select manually');
    expect(src).not.toContain('clipboard unavailable');
  });
  it('keeps the user-scoped status update + error surfacing', () => {
    expect(src).toContain(".eq('user_id', userId)");
    expect(src).toContain("setStatusError('Could not save that status. Please try again.')");
    expect(src).toContain('statusError &&');
    // No unscoped status update that applies locally on a failed write.
    expect(src).not.toMatch(/\.update\(\{ status \}\)\.eq\('id', id\);/);
  });
  it('renders the studio sections', () => {
    expect(src).toContain('Content Studio');
    expect(src).toContain('Content Library');
    expect(src).toContain('Short-Form Best Practices');
    expect(src).toContain('Content Studio is available on Business plan and above.');
  });
  it('no fabricated content', () => {
    expect(src).not.toContain('Optimisation fix');
  });
});
