// b86p: THE canonical list of Rankall's social profiles — every
// surface that links to them (site footer, homepage footer,
// Organization sameAs, llms.txt) reads this one list.
//
// It is EMPTY on purpose. Verified repeatedly (Oct 2026, most
// recently Oct 20): linkedin.com/company/rankall-io, x.com/
// rankall_io, and youtube.com/@rankall-io all return 404, and
// facebook.com/rankall.io / instagram.com/rankall.io could not
// be verified to exist in any check. Publishing links to
// profiles that do not exist was the S6 failure on ~25 page
// tests. When a profile is created, add it here ONCE and the
// links return on every surface at once.
export interface SocialProfile {
  label: string;
  href: string;
}

export const SOCIAL_PROFILES: SocialProfile[] = [];

export const SOCIAL_PROFILE_URLS: string[] = SOCIAL_PROFILES.map((p) => p.href);
