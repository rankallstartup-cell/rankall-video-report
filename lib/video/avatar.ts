/**
 * Presenters a video-report POST may request, by HeyGen v3 avatar_id.
 *
 * Dante is the default when avatarId is absent; Abigail, Julian, and
 * Saoirse are the distinct showcase presenters (Oct 27 distinct-avatar
 * rule, Oct 28 replacements). Anything else is rejected with a 400,
 * never silently mapped to Dante, so a caller can never ask for one
 * presenter and get another — and a rejected or personal avatar can
 * never slip through as a render. The pipeline's own resolver still
 * guards the render itself (rejected ids throw, legacy v2 id maps to
 * Dante), but this allowlist is the route's front door.
 *
 * Oct 28 correction: Albert (Albert_public_4) and Adriana
 * (Adriana_Business_Front_public) were REMOVED from this allowlist.
 * They are v2 avatar ids, not v3 looks — the v3 looks endpoint carries
 * a supported_api_engines flag, and Albert/Adriana are not in it —
 * which is why both 400'd at render time on Oct 27. Their
 * replacements are v3 look ids with avatar_iv listed, each proven by
 * a short completed v3 probe render on Oct 28 (Julian 1.88s, Saoirse
 * 2.11s): Julian Office 1 (male) and Saoirse Office 1 (female).
 */
export const VIDEO_AVATAR_IDS = {
  dante: 'ee25a2363ef941a1b5b0f7b1172e57d1',
  abigail: 'Abigail_standing_office_front',
  julian: '6b3b74cbbea34612a8c046bc12b1b4aa',
  saoirse: '1a4da041785c4f6d9271709706b721b6',
} as const;

export const ALLOWED_VIDEO_AVATAR_IDS: ReadonlySet<string> = new Set(
  Object.values(VIDEO_AVATAR_IDS),
);

/**
 * Voice paired to each presenter, so a face can never be rendered with
 * a mismatched voice. Oct 27 lesson, stated plainly: the first
 * distinct-avatar run rendered Abigail (female) with Eric (male)
 * narration, because the avatar was selectable and the voice was
 * fixed — the face check passed and the voice check did not exist.
 * The voice is a pure function of the avatar, derived in runJob and
 * in every pre-render continuation from the stored avatarId, so no
 * resume blob, retry, or continuation can ever reintroduce a mismatch.
 * Bella — Professional, Bright, Warm (premade stock, American,
 * middle-aged, informative) — is the female counterpart to Eric's
 * Smooth, Trustworthy profile.
 */
export const VIDEO_VOICE_IDS = {
  eric: 'cjVigY5qzO86Huf0OWal',
  bella: 'hpp4J3VqNfWAUOO0d1Us',
} as const;

export function voiceIdForAvatarId(avatarId: string | undefined): string {
  if (avatarId === undefined) return VIDEO_VOICE_IDS.eric;
  if (avatarId === VIDEO_AVATAR_IDS.abigail || avatarId === VIDEO_AVATAR_IDS.saoirse) {
    return VIDEO_VOICE_IDS.bella;
  }
  if (avatarId === VIDEO_AVATAR_IDS.dante || avatarId === VIDEO_AVATAR_IDS.julian) {
    return VIDEO_VOICE_IDS.eric;
  }
  throw new Error('voiceIdForAvatarId: unknown avatarId (route allowlist should have rejected it)');
}

/**
 * Validate a POST body's avatarId: absent/null means the Dante default
 * (undefined), a listed id passes through verbatim, anything else
 * throws — including non-strings, unknown ids, and rejected ids.
 */
export function parseVideoAvatarId(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || !ALLOWED_VIDEO_AVATAR_IDS.has(value)) {
    throw new Error('avatarId must be one of the allowed presenter ids');
  }
  return value;
}
