// Avatar allowlist for video-report POSTs (Oct 27 showcase slice).
// Pure validation only — no pipeline, no keys, no renders.
import { describe, it, expect } from 'vitest';
import { parseVideoAvatarId, VIDEO_AVATAR_IDS, ALLOWED_VIDEO_AVATAR_IDS } from '../video/avatar';

describe('parseVideoAvatarId', () => {
  it('absent or null means the Dante default (undefined)', () => {
    expect(parseVideoAvatarId(undefined)).toBeUndefined();
    expect(parseVideoAvatarId(null)).toBeUndefined();
  });

  it('passes each listed presenter id through verbatim', () => {
    for (const id of Object.values(VIDEO_AVATAR_IDS)) {
      expect(parseVideoAvatarId(id)).toBe(id);
      expect(ALLOWED_VIDEO_AVATAR_IDS.has(id)).toBe(true);
    }
  });

  it('rejects unknown ids, non-strings, and the rejected Adrian id', () => {
    expect(() => parseVideoAvatarId('Adrian_public_2_20240312')).toThrow();
    expect(() => parseVideoAvatarId('some_other_avatar')).toThrow();
    expect(() => parseVideoAvatarId(123)).toThrow();
    expect(() => parseVideoAvatarId('')).toThrow();
  });

  it('never lists the personal digital-twin avatar', () => {
    expect(ALLOWED_VIDEO_AVATAR_IDS.has('5be53ef529314ea0a827b476cb6741a8')).toBe(false);
  });
});
