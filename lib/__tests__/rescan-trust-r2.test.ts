import { describe, it, expect } from 'vitest';
import { resolveRescanWebsite, competitorNameList } from '../rescanTrust';

// Fix round 2: weekly rescans used the Places website as if verified and
// never passed competitorNames, so trust was not like-for-like with /api/scan.
describe('resolveRescanWebsite', () => {
  it('prefers the user-supplied website stored on the scan (verified)', () => {
    expect(resolveRescanWebsite({ website_url: 'https://mine.com' }, 'https://places.com'))
      .toEqual({ websiteUrl: 'https://mine.com', websiteVerified: true });
  });
  it('falls back to the Places website, unverified', () => {
    expect(resolveRescanWebsite({}, 'https://places.com')).toEqual({ websiteUrl: 'https://places.com', websiteVerified: false });
    expect(resolveRescanWebsite({ website_url: '  ' }, 'https://places.com').websiteVerified).toBe(false);
  });
  it('no website at all', () => {
    expect(resolveRescanWebsite(null, null)).toEqual({ websiteUrl: undefined, websiteVerified: false });
  });
});

describe('competitorNameList', () => {
  it('dedupes and drops empties', () => {
    expect(competitorNameList(['Smile Dental Group', null, '', 'Smile Dental Group', undefined, 'Ace'])).toEqual(['Smile Dental Group', 'Ace']);
  });
});
