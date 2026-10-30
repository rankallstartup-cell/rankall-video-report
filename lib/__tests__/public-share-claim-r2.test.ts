import { describe, it, expect } from 'vitest';
import { canServePublicShare } from '../reportPayload';

// Fix round 2 (item 12): ownerless (outreach / anonymous) scans remain
// shareable by link; any scan with an owner is private unless published.
describe('canServePublicShare', () => {
  it('ownerless scan is shareable', () => {
    expect(canServePublicShare(null, null)).toBe(true);
  });
  it('a scan that gains an owner (claimed) becomes private', () => {
    expect(canServePublicShare('user-1', null)).toBe(false);
    expect(canServePublicShare('user-1', false)).toBe(false);
  });
  it('owner-published scan is shareable', () => {
    expect(canServePublicShare('user-1', true)).toBe(true);
  });
});
