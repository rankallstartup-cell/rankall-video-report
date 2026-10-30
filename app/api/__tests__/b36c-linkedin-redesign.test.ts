import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync('app/dashboard/linkedin/page.tsx', 'utf8');

describe('b36c linkedin redesign', () => {
  it('surfaces every failure instead of swallowing errors', () => {
    expect(src).toContain('leadError');
    expect(src).toContain('Could not save that change');
    expect(src).toContain('Could not generate messages');
    expect(src).toContain('Could not remove that lead');
    expect(src).toContain('Could not add that lead');
    expect(src).toContain('data.error');
    expect(src).toContain('data.connection_message');
    expect(src).not.toContain('non-fatal');
  });
  it('renders the linkedin sections', () => {
    expect(src).toContain('LinkedIn Outreach Queue');
    expect(src).toContain('Add LinkedIn Lead');
    expect(src).toContain('LinkedIn Best Practices');
  });
  it('uses the b35q card treatment', () => {
    expect(src).toContain('pagehead');
    expect(src).toContain('card dash-card');
  });
});
