import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync('app/dashboard/enterprise/page.tsx', 'utf8');

describe('b368 enterprise redesign', () => {
  it('renders the enterprise sections with unchanged copy', () => {
    expect(src).toContain('Enterprise Dashboard');
    expect(src).toContain('Your enterprise account gives you access to custom AI visibility intelligence');
    expect(src).toContain('Your dedicated account manager');
    expect(src).toContain('Contact Support');
    expect(src).toContain('Global Intelligence');
    expect(src).toContain('Multi-Account');
  });
  it('keeps the same links', () => {
    expect(src).toContain('href="/dashboard"');
    expect(src).toContain('href="/contact"');
    expect(src).toContain('href="/dashboard/intelligence"');
    expect(src).toContain('href="/dashboard/agency"');
  });
  it('uses the b35q card treatment', () => {
    expect(src).toContain('card dash-card');
    expect(src).toContain('pagehead');
  });
});
