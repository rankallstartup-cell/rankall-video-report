// lib/rescanSchedule.ts
// ax72: per-fix verification schedule. Pure helpers shared by
// /api/fixes/apply (writes one scheduled_rescans row per applied fix, with
// its fix_type and the delay the user picked) and /api/trigger-rescans
// (selects the fixes whose own row is due, then marks those rows complete).
//
// The old logic had no fix_type on scheduled_rescans and never completed a
// row, and decided per SCAN with rows.some(...) — so once any fix's row was
// due (e.g. a 7-day one), every other applied fix on that scan (e.g. a 90-day
// one) was verified early, and the same row re-fired forever.

export const DEFAULT_VERIFY_DAYS = 7;
export const VERIFY_DAY_OPTIONS = [7, 30, 60, 90] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Delay the user picked, constrained to the offered options (default 7). */
export function normaliseVerifyDays(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && (VERIFY_DAY_OPTIONS as readonly number[]).includes(n) ? n : DEFAULT_VERIFY_DAYS;
}

export interface AppliedFixRow {
  scan_id: string;
  fix_type: string;
  applied_at: string | null;
}

export interface ScheduleRow {
  id: string;
  scan_id: string;
  fix_type?: string | null;       // null on legacy rows / before the migration
  scheduled_for: string | null;
  completed_at?: string | null;   // null until the verification rescan ran
  completed?: boolean | null;     // pre-existing boolean column
  created_at?: string | null;
}

export interface DueScan {
  scanId: string;
  fixTypes: string[];   // only these fixes are verified by this rescan
  scheduleIds: string[]; // rows to mark completed after a successful rescan
  // b877: fixes that were due with NO schedule row (rule 3). After a
  // successful rescan the cron writes a completed row for each, so the
  // fallback can't fire again the next day. Present only when non-empty.
  unscheduledFixTypes?: string[];
}

function isOpen(r: ScheduleRow): boolean {
  return !r.completed_at && r.completed !== true;
}

function ts(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Decide which applied fixes are due for verification at `nowMs`.
 *   1. A fix with its own open row (same scan_id + fix_type) is due when that
 *      row's scheduled_for has passed.
 *   2. Legacy rows without a fix_type: the open untyped row created closest
 *      to the fix's applied_at (the apply call writes both together) is that
 *      fix's row. Each legacy row is claimed by at most one fix.
 *   3. No row at all: due at applied_at + DEFAULT_VERIFY_DAYS — unless a
 *      completed untyped row was written after that date (the cron writes
 *      one after a fallback rescan, b877), which means it already ran.
 * A fix whose only rows are completed is not due (it was already verified).
 */
export function selectDueFixes(
  applied: AppliedFixRow[],
  schedules: ScheduleRow[],
  nowMs: number,
): DueScan[] {
  const byScan = new Map<string, DueScan>();
  const claimedLegacy = new Set<string>();

  for (const fix of applied) {
    if (!fix.scan_id || !fix.fix_type) continue;
    const scanRows = schedules.filter(r => r.scan_id === fix.scan_id);
    const typed = scanRows.filter(r => r.fix_type === fix.fix_type);

    let due = false;
    let unscheduled = false;
    const ids: string[] = [];

    if (typed.length > 0) {
      const open = typed.filter(isOpen);
      for (const r of open) {
        const t = ts(r.scheduled_for);
        if (t != null && t <= nowMs) { due = true; ids.push(r.id); }
      }
    } else {
      const appliedAt = ts(fix.applied_at);
      const legacy = scanRows
        .filter(r => !r.fix_type && isOpen(r) && !claimedLegacy.has(r.id))
        .map(r => ({ r, created: ts(r.created_at) }));
      const match = appliedAt != null
        ? legacy
            .filter(x => x.created != null)
            .sort((a, b) => Math.abs((a.created as number) - appliedAt) - Math.abs((b.created as number) - appliedAt))[0]
        : undefined;
      if (match) {
        claimedLegacy.add(match.r.id);
        const t = ts(match.r.scheduled_for);
        if (t != null && t <= nowMs) { due = true; ids.push(match.r.id); }
      } else if (appliedAt != null) {
        const dueAt = appliedAt + DEFAULT_VERIFY_DAYS * DAY_MS;
        const alreadyRan = scanRows.some(r => !r.fix_type && !isOpen(r) && (ts(r.created_at) ?? -Infinity) >= dueAt);
        due = !alreadyRan && dueAt <= nowMs;
        if (due) unscheduled = true;
      }
    }

    if (!due) continue;
    const entry = byScan.get(fix.scan_id) ?? { scanId: fix.scan_id, fixTypes: [], scheduleIds: [] };
    if (!entry.fixTypes.includes(fix.fix_type)) entry.fixTypes.push(fix.fix_type);
    for (const id of ids) if (!entry.scheduleIds.includes(id)) entry.scheduleIds.push(id);
    if (unscheduled) {
      entry.unscheduledFixTypes = entry.unscheduledFixTypes ?? [];
      if (!entry.unscheduledFixTypes.includes(fix.fix_type)) entry.unscheduledFixTypes.push(fix.fix_type);
    }
    byScan.set(fix.scan_id, entry);
  }

  return [...byScan.values()];
}
