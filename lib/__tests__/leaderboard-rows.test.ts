import { describe, it, expect } from 'vitest';
import { toLeaderboardRows, cityTokenFrom } from '../leaderboardRows';

describe('toLeaderboardRows (privacy)', () => {
  const src = [
    { user_id: 'u-other', user_business_name: 'Rival Dental', input: 'Rival Dental Chicago', overall_score: 71 },
    { user_id: 'u-me', user_business_name: 'Bright Smile', input: 'Bright Smile Chicago', overall_score: 52 },
    { user_id: null, user_business_name: 'Outreach Prospect', input: 'x', overall_score: null },
  ];
  it('names only the viewer and anonymises everyone else', () => {
    const rows = toLeaderboardRows(src, 'u-me');
    expect(rows.map(r => r.name)).toEqual(['Business #1', 'Bright Smile (You)', 'Business #3']);
    expect(JSON.stringify(rows)).not.toContain('Rival');
    expect(JSON.stringify(rows)).not.toContain('u-other');
    expect(rows[2].score).toBe(0);
  });
  it('a signed-out/unknown viewer sees no names at all', () => {
    expect(toLeaderboardRows(src, null).every(r => r.name.startsWith('Business #'))).toBe(true);
  });
  it('extracts the city token', () => {
    expect(cityTokenFrom('Chicago, IL')).toBe('Chicago');
    expect(cityTokenFrom('Chicago IL')).toBe('Chicago');
    expect(cityTokenFrom('')).toBe('');
  });
});
