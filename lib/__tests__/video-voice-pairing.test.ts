import { describe, expect, it } from 'vitest';
import {
  VIDEO_AVATAR_IDS,
  VIDEO_VOICE_IDS,
  voiceIdForAvatarId,
} from '../video/avatar';

describe('voiceIdForAvatarId (Oct 27 voice-pairing fix, Oct 28 replacements)', () => {
  it('pairs Abigail and Saoirse with Bella (female)', () => {
    expect(voiceIdForAvatarId(VIDEO_AVATAR_IDS.abigail)).toBe(VIDEO_VOICE_IDS.bella);
    expect(voiceIdForAvatarId(VIDEO_AVATAR_IDS.saoirse)).toBe(VIDEO_VOICE_IDS.bella);
  });
  it('pairs Dante and Julian with Eric (male)', () => {
    expect(voiceIdForAvatarId(VIDEO_AVATAR_IDS.dante)).toBe(VIDEO_VOICE_IDS.eric);
    expect(voiceIdForAvatarId(VIDEO_AVATAR_IDS.julian)).toBe(VIDEO_VOICE_IDS.eric);
  });
  it('defaults to Eric when no avatar is requested (Dante default)', () => {
    expect(voiceIdForAvatarId(undefined)).toBe(VIDEO_VOICE_IDS.eric);
  });
  it('throws on an unknown avatar id instead of silently mismatching', () => {
    expect(() => voiceIdForAvatarId('Adrian_public_2_20240312')).toThrow();
  });
  it('throws on the removed Oct 27 legacy ids (Albert, Adriana are v2 ids, not v3 looks)', () => {
    expect(() => voiceIdForAvatarId('Albert_public_4')).toThrow();
    expect(() => voiceIdForAvatarId('Adriana_Business_Front_public')).toThrow();
  });
});
