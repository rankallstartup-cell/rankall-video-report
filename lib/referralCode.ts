// lib/referralCode.ts
// Deterministic referral codes: the same user always gets the same code, and a
// code maps back to the first segment of the user's UUID (used for O(1) reversal
// via a uuid range query — see lib/referralTracking.resolveReferrerUserId).

export function generateReferralCode(userId: string): string {
  return userId.replace(/-/g, '').substring(0, 8).toUpperCase();
}

export function getReferralLink(userId: string, baseUrl = 'https://rankall.io'): string {
  return `${baseUrl}/?ref=${generateReferralCode(userId)}`;
}
