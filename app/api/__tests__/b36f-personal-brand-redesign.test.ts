import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync('app/dashboard/personal-brand/page.tsx', 'utf8');

describe('b36f personal brand redesign', () => {
  it('adds no new peer feature', () => {
    expect(src).not.toContain('PeerIntelligence');
    expect(src).not.toContain('PeerProfile');
    expect(src).not.toContain('personal-peer');
    expect(src).not.toContain('Find Real Competitors');
  });
  it('keeps the failure hardening', () => {
    expect(src).toContain('fixErrors');
    expect(src).toContain('timelineFixError');
    expect(src).toContain('copyError');
    expect(src).toContain('Could not generate this fix');
    expect(src).toContain('Copy failed');
    expect(src).toContain('data.error');
    expect(src).toContain('generated_content');
    expect(src).not.toContain('catch { }');
  });
  it('keeps the identity-confirm gate', () => {
    expect(src).toContain('identity');
  });
  it('renders the personal brand sections', () => {
    expect(src).toContain('Personal');
    expect(src).toContain('LinkedIn');
  });
  it('uses the b35q card treatment', () => {
    expect(src).toContain('pagehead');
    expect(src).toContain('card dash-card');
  });
});
