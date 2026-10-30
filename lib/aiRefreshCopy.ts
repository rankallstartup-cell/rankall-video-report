// Honest "when will AI notice?" copy for fix timelines (report + trust
// dashboard). We cannot observe or control when ChatGPT, Gemini,
// Perplexity etc. re-crawl a site or refresh their data, so fix timelines
// must not promise "indexed by AI within 24–72 hours" / "14–30 days".
// What Rankall CAN promise: it re-checks with a rescan after the user marks
// the fix applied (lib/rescanSchedule DEFAULT_VERIFY_DAYS). Client-safe.
import { DEFAULT_VERIFY_DAYS } from './rescanSchedule';

export const AI_REFRESH_NOTE =
  `AI platforms refresh on their own schedules — Rankall verifies the change when it rescans (${DEFAULT_VERIFY_DAYS} days after you mark it applied by default)`;

/** Timeline line: an optional non-AI fact (e.g. a third party's own step) + the honest AI note. */
export function aiTimeline(prefix?: string): string {
  return prefix ? `${prefix} ${AI_REFRESH_NOTE}` : AI_REFRESH_NOTE;
}
