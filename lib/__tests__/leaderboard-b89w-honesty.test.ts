import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { latestPerBusiness, toLeaderboardRows, trustedLeaderboardName } from '../leaderboardRows';

// b89w — /dashboard/leaderboard: (1) rows were named + keyed by the
// raw stored user_business_name, so the b87d-poisoned name ("Brite
// Smiles Dentistry" stored on scans of "Bright Smile Dental Dallas
// TX") became its own (You) row; (2) any short/failed result rendered
// a hardcoded SAMPLE_ROWS table; (3) logged-out visitors got the
// shell + sample rows; (4) the subtitle promised "only your own row"
// while the account held three.

const page = readFileSync(join(process.cwd(), 'app/dashboard/leaderboard/page.tsx'), 'utf8');
const route = readFileSync(join(process.cwd(), 'app/api/dashboard/leaderboard/route.ts'), 'utf8');

describe('b89w — trusted names, one row per real business', () => {
  it('the guard falls back to the scanned input when the stored name fails validation', () => {
    const poisoned = {
      user_id: 'u1',
      input: 'Bright Smile Dental Dallas TX',
      user_business_name: 'Brite Smiles Dentistry',
      location: 'Dallas, TX',
      overall_score: 1,
      enrichment: { google: { name: 'Brite Smiles Dentistry', address: '4900 Long Prairie Rd #300, Flower Mound, TX 75028' } } as never,
    };
    expect(trustedLeaderboardName(poisoned)).toBe('Bright Smile Dental Dallas TX');
  });

  it('scans of one business under two stored names dedupe to the latest scan', () => {
    const rows = [
      { user_id: 'u1', input: 'Bright Smile Dental Dallas TX', user_business_name: 'Bright Smile Dental', location: 'Dallas, TX', overall_score: 4, created_at: '2026-10-15T03:41:00Z', enrichment: null },
      { user_id: 'u1', input: 'Bright Smile Dental Dallas TX', user_business_name: 'Brite Smiles Dentistry', location: 'Dallas, TX', overall_score: 1, created_at: '2026-10-15T04:19:00Z', enrichment: { google: { name: 'Brite Smiles Dentistry', address: '4900 Long Prairie Rd #300, Flower Mound, TX 75028' } } as never },
    ];
    const out = latestPerBusiness(rows);
    expect(out).toHaveLength(1);
    expect(out[0].overall_score).toBe(1);
    const named = toLeaderboardRows(out, 'u1');
    expect(named[0].name).toBe('Bright Smile Dental Dallas TX (You)');
    expect(named[0].date).toBe('2026-10-15T04:19:00Z');
  });

  it('the route selects what the guard needs (location + enrichment)', () => {
    expect(route).toContain('location, enrichment');
  });
});

describe('b89w — no invented rows, real gates', () => {
  it('the page has no sample rows', () => {
    expect(page).not.toContain('SAMPLE_ROWS');
    expect(page).not.toContain('Sample business');
    expect(page).not.toContain('Top performer (sample)');
  });

  it('short/failed results are honest states, and 403 is the plan gate', () => {
    expect(page).toContain("res.status === 403");
    expect(page).toContain('Not enough data yet for {industry}');
    expect(page).toContain('Couldn&apos;t load the leaderboard.');
    expect(page).toContain('No businesses ranked yet for this filter');
  });

  it('logged-out visitors get a sign-in gate', () => {
    expect(page).toContain('Sign in to view the Leaderboard.');
    expect(page).toContain('/login?next=/dashboard/leaderboard');
  });

  it('the subtitle matches reality: your businesses (plural) are named', () => {
    expect(page).toContain('Only your own businesses are named');
    expect(page).not.toContain('only your own row is named');
    expect(page).toContain('Latest scan ·');
  });
});
