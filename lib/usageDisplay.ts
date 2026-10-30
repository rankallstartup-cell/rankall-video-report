// How /dashboard/usage draws a usage bar (b8af). An unlimited feature has
// nothing to fill, so its bar stays empty instead of showing a full green
// bar at 0 used.
export const UNLIMITED_LIMIT = 999999;

export function usageBarPercent(used: number, limit: number): number {
  if (limit >= UNLIMITED_LIMIT || limit <= 0) return 0;
  return Math.min(100, Math.round((Math.max(0, used) / limit) * 100));
}
