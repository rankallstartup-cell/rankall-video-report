import { describe, it, expect } from 'vitest';
import { selectDueFixes, normaliseVerifyDays, DEFAULT_VERIFY_DAYS } from '../rescanSchedule';

// ax72: per-fix verification schedule — due selection is per fix, never
// per scan, and completed rows never fire again.
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-16T09:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

describe('normaliseVerifyDays', () => {
  it('honours offered options, defaults to 7', () => {
    expect(normaliseVerifyDays(30)).toBe(30);
    expect(normaliseVerifyDays('90')).toBe(90);
    expect(normaliseVerifyDays(undefined)).toBe(DEFAULT_VERIFY_DAYS);
    expect(normaliseVerifyDays(3)).toBe(7);
    expect(normaliseVerifyDays(-5)).toBe(7);
  });
});

describe('selectDueFixes', () => {
  it('a due 7-day row does NOT pull a 90-day fix on the same scan', () => {
    const applied = [
      { scan_id: 's1', fix_type: 'faq_schema', applied_at: iso(NOW - 8 * DAY) },
      { scan_id: 's1', fix_type: 'jsonld', applied_at: iso(NOW - 8 * DAY) },
    ];
    const schedules = [
      { id: 'r1', scan_id: 's1', fix_type: 'faq_schema', scheduled_for: iso(NOW - DAY), completed_at: null },
      { id: 'r2', scan_id: 's1', fix_type: 'jsonld', scheduled_for: iso(NOW + 82 * DAY), completed_at: null },
    ];
    expect(selectDueFixes(applied, schedules, NOW)).toEqual([
      { scanId: 's1', fixTypes: ['faq_schema'], scheduleIds: ['r1'] },
    ]);
  });

  it('completed rows never fire again', () => {
    const applied = [{ scan_id: 's1', fix_type: 'faq_schema', applied_at: iso(NOW - 40 * DAY) }];
    const schedules = [
      { id: 'r1', scan_id: 's1', fix_type: 'faq_schema', scheduled_for: iso(NOW - 30 * DAY), completed_at: iso(NOW - 30 * DAY) },
    ];
    expect(selectDueFixes(applied, schedules, NOW)).toEqual([]);
    const legacyCompleted = [{ id: 'r1', scan_id: 's1', fix_type: 'faq_schema', scheduled_for: iso(NOW - 30 * DAY), completed: true }];
    expect(selectDueFixes(applied, legacyCompleted, NOW)).toEqual([]);
  });

  it('not yet due → nothing', () => {
    const applied = [{ scan_id: 's1', fix_type: 'reviews', applied_at: iso(NOW - 2 * DAY) }];
    const schedules = [{ id: 'r1', scan_id: 's1', fix_type: 'reviews', scheduled_for: iso(NOW + 28 * DAY) }];
    expect(selectDueFixes(applied, schedules, NOW)).toEqual([]);
  });

  it('no schedule row → applied_at + 7 days', () => {
    const applied = [
      { scan_id: 's1', fix_type: 'a', applied_at: iso(NOW - 8 * DAY) },
      { scan_id: 's2', fix_type: 'b', applied_at: iso(NOW - 3 * DAY) },
    ];
    expect(selectDueFixes(applied, [], NOW)).toEqual([{ scanId: 's1', fixTypes: ['a'], scheduleIds: [], unscheduledFixTypes: ['a'] }]);
  });

  it('legacy untyped rows are matched to the fix applied at the same time', () => {
    const t1 = NOW - 10 * DAY;
    const t2 = NOW - 9 * DAY;
    const applied = [
      { scan_id: 's1', fix_type: 'faq_schema', applied_at: iso(t1) },
      { scan_id: 's1', fix_type: 'jsonld', applied_at: iso(t2) },
    ];
    const schedules = [
      // faq applied with 7 days → due; jsonld applied with 90 days → not due
      { id: 'L1', scan_id: 's1', fix_type: null, scheduled_for: iso(t1 + 7 * DAY), created_at: iso(t1 + 50) },
      { id: 'L2', scan_id: 's1', fix_type: null, scheduled_for: iso(t2 + 90 * DAY), created_at: iso(t2 + 40) },
    ];
    expect(selectDueFixes(applied, schedules, NOW)).toEqual([
      { scanId: 's1', fixTypes: ['faq_schema'], scheduleIds: ['L1'] },
    ]);
  });

  it('groups several due fixes of one scan into one rescan', () => {
    const applied = [
      { scan_id: 's1', fix_type: 'a', applied_at: iso(NOW - 31 * DAY) },
      { scan_id: 's1', fix_type: 'b', applied_at: iso(NOW - 31 * DAY) },
    ];
    const schedules = [
      { id: 'r1', scan_id: 's1', fix_type: 'a', scheduled_for: iso(NOW - DAY) },
      { id: 'r2', scan_id: 's1', fix_type: 'b', scheduled_for: iso(NOW - 2 * DAY) },
    ];
    expect(selectDueFixes(applied, schedules, NOW)).toEqual([
      { scanId: 's1', fixTypes: ['a', 'b'], scheduleIds: ['r1', 'r2'] },
    ]);
  });

  it('b877: a fallback rescan that already ran does not fire again', () => {
    const applied = [{ scan_id: 's1', fix_type: 'a', applied_at: iso(NOW - 9 * DAY) }];
    // The cron wrote this completed row after yesterday's fallback rescan.
    const ranYesterday = [{ id: 'F1', scan_id: 's1', fix_type: null, scheduled_for: iso(NOW - DAY), completed: true, created_at: iso(NOW - DAY) }];
    expect(selectDueFixes(applied, ranYesterday, NOW)).toEqual([]);
    const typedRan = [{ id: 'F2', scan_id: 's1', fix_type: 'a', scheduled_for: iso(NOW - DAY), completed: true, completed_at: iso(NOW - DAY), created_at: iso(NOW - DAY) }];
    expect(selectDueFixes(applied, typedRan, NOW)).toEqual([]);
  });

  it('b877: a completed row from before the due date does not suppress the first rescan', () => {
    const applied = [{ scan_id: 's1', fix_type: 'a', applied_at: iso(NOW - 9 * DAY) }];
    const old = [{ id: 'O1', scan_id: 's1', fix_type: null, scheduled_for: iso(NOW - 30 * DAY), completed: true, created_at: iso(NOW - 30 * DAY) }];
    expect(selectDueFixes(applied, old, NOW)).toEqual([{ scanId: 's1', fixTypes: ['a'], scheduleIds: [], unscheduledFixTypes: ['a'] }]);
  });
});
