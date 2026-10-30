import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync('app/dashboard/client/reports/page.tsx', 'utf8');

describe('b363 client reports redesign', () => {
  it('loads from the server endpoint, never direct Supabase', () => {
    expect(src).toContain("fetch('/api/client-portal/overview')");
    expect(src).not.toContain('getBrowserClient');
    expect(src).not.toContain('supabase');
    expect(src).not.toContain(".from('scans')");
    expect(src).not.toContain(".from('agency_clients')");
  });
  it('keeps the date guard — dateless rows say Date unknown, never Invalid Date', () => {
    expect(src).toContain("s.created_at ? new Date(s.created_at).toLocaleDateString");
    expect(src).toContain("'Date unknown'");
    expect(src).not.toContain('Invalid Date');
  });
  it('keeps the endpoint error strings', () => {
    expect(src).toContain("data.error ?? 'Failed to load your reports.'");
    expect(src).toContain('Failed to load your reports. Please try again.');
    expect(src).not.toContain('Not signed in.');
    expect(src).not.toContain('No client account found.');
  });
  it('error state renders the page header + card (not a bare line)', () => {
    expect(src.match(/My Reports/g)?.length).toBeGreaterThanOrEqual(2);
    expect(src).toContain('card dash-card');
  });
  it('renders the report rows with links to /report/<id>', () => {
    expect(src).toContain('AI Visibility Report');
    expect(src).toContain('/report/${s.id}');
    expect(src).toContain('No reports yet. Your agency will publish your first report shortly.');
  });
});
