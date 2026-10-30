/**
 * Tests for Outreach fix #2 (ticket b970): dashboard sends enroll into the
 * follow-up sequence — the dashboard send counts as Day 1, so Day 3 is
 * scheduled next. Hard rules under test:
 * - never double-enroll a prospect already in the sequence
 * - never restart an Apollo Day-1 recipient at Day 1
 * - DNC / unsubscribed prospects are never enrolled
 * - enrollment failure never fails the send (returns skipped, never throws)
 */
import { describe, it, expect } from 'vitest';
import {
  decideEnrollment,
  enrollDashboardSend,
  type SequenceRow,
} from '@/lib/enrollDashboardSend';

// ── Fake Supabase client: supports the chains enrollDashboardSend uses
// (select/eq/maybeSingle/insert/update + awaiting a builder). ──

type Row = Record<string, any>;

class FakeBuilder {
  private filters: Array<(r: Row) => boolean> = [];
  private pendingUpdate: Row | null = null;
  constructor(
    private db: FakeDb,
    private table: string,
    private op: 'select' | 'insert' | 'update',
  ) {}

  select(_cols: string) {
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  insert(row: Row) {
    this.db.maybeThrow(this.table, 'insert');
    const stored = { ...row, id: row.id ?? `id-${this.db.tables[this.table].length + 1}` };
    this.db.tables[this.table].push(stored);
    this.db.calls.push(`${this.table}.insert`);
    return Promise.resolve({ data: stored, error: null });
  }
  update(row: Row) {
    this.pendingUpdate = row;
    return this;
  }
  async maybeSingle() {
    this.db.maybeThrow(this.table, 'select');
    const rows = this.apply();
    return { data: rows[0] ?? null, error: null };
  }
  async then(onF: any, onR?: any) {
    try {
      const result = await this.run();
      return onF ? onF(result) : result;
    } catch (e) {
      if (onR) return onR(e);
      throw e;
    }
  }
  private apply(): Row[] {
    return this.db.tables[this.table].filter((r) => this.filters.every((f) => f(r)));
  }
  private async run() {
    if (this.op === 'select') {
      this.db.maybeThrow(this.table, 'select');
      return { data: this.apply(), error: null };
    }
    if (this.op === 'update') {
      this.db.maybeThrow(this.table, 'update');
      const rows = this.apply();
      for (const r of rows) Object.assign(r, this.pendingUpdate);
      this.db.calls.push(`${this.table}.update:${rows.length}`);
      return { data: rows, error: null };
    }
    return { data: null, error: null };
  }
}

class FakeDb {
  tables: Record<string, Row[]> = {
    outreach_targets: [],
    outreach_sequence_log: [],
    outreach_unsubscribes: [],
  };
  calls: string[] = [];
  failOn: { table: string; op: string } | null = null;
  maybeThrow(table: string, op: string) {
    if (this.failOn && this.failOn.table === table && this.failOn.op === op) {
      throw new Error(`fake db failure: ${table}.${op}`);
    }
  }
  from(table: string) {
    const db = this;
    return {
      select(_cols: string) {
        return new FakeBuilder(db, table, 'select');
      },
      insert(row: Row) {
        return new FakeBuilder(db, table, 'insert').insert(row);
      },
      update(row: Row) {
        return new FakeBuilder(db, table, 'update').update(row);
      },
    };
  }
}

const NOW = new Date('2026-10-17T12:00:00.000Z');
const DAY3_ISO = '2026-10-19T12:00:00.000Z';
const ALLOW = async () => ({ allowed: true as const });
const BLOCK_DNC = async () => ({ allowed: false as const, reason: 'On do-not-contact list: test' });

const PROSPECT = {
  email: 'Owner@ExampleDental.com',
  businessName: 'Example Dental',
  firstName: 'Dana',
  industry: 'dentist',
  city: 'Austin',
  scanId: 'scan-1',
  overallScore: 42,
  competitorName: 'Rival Dental',
};

function seqRows(db: FakeDb) {
  return db.tables.outreach_sequence_log;
}

describe('decideEnrollment (pure)', () => {
  it('fresh prospect (no rows) → enroll', () => {
    expect(decideEnrollment([], 'pending')).toEqual({ action: 'enroll', reason: 'fresh' });
  });
  it('pending Day 1 → supersede (dashboard send replaces it)', () => {
    expect(
      decideEnrollment([{ id: 'r1', sequence_day: 1, status: 'pending' }], 'pending'),
    ).toEqual({
      action: 'supersede_day1',
      reason: 'pending_day1_superseded_by_dashboard_send',
    });
  });
  it('pending Day 3 → skip (already scheduled, no duplicate)', () => {
    expect(
      decideEnrollment([{ id: 'r1', sequence_day: 3, status: 'pending' }], 'contacted'),
    ).toEqual({ action: 'skip', reason: 'pending_day_3_already_scheduled' });
  });
  it('Day 1 sent + Day 3 pending → skip (do not touch the running sequence)', () => {
    const rows: SequenceRow[] = [
      { id: 'r1', sequence_day: 1, status: 'sent' },
      { id: 'r2', sequence_day: 3, status: 'pending' },
    ];
    expect(decideEnrollment(rows, 'contacted').action).toBe('skip');
  });
  it('Day 1 sent, no pending → skip (never restart a sequence that ran)', () => {
    expect(
      decideEnrollment([{ id: 'r1', sequence_day: 1, status: 'sent' }], 'contacted'),
    ).toEqual({ action: 'skip', reason: 'sequence_already_sent' });
  });
  it('stopped sequence → skip', () => {
    expect(
      decideEnrollment([{ id: 'r1', sequence_day: 1, status: 'stopped' }], 'stopped'),
    ).toEqual({ action: 'skip', reason: 'target_status_stopped' });
  });
  it('only skipped/error rows → enroll (sequence never sent a touch)', () => {
    const rows: SequenceRow[] = [
      { id: 'r1', sequence_day: 1, status: 'skipped' },
      { id: 'r2', sequence_day: 1, status: 'error' },
    ];
    expect(decideEnrollment(rows, 'pending')).toEqual({ action: 'enroll', reason: 'fresh' });
  });
  it('replied / converted / unsubscribed target → skip even with no rows', () => {
    for (const s of ['replied', 'converted', 'unsubscribed']) {
      expect(decideEnrollment([], s).action).toBe('skip');
    }
  });
});

describe('enrollDashboardSend', () => {
  it('fresh prospect → target row created + Day 3 scheduled (+2 days)', async () => {
    const db = new FakeDb();
    const out = await enrollDashboardSend(PROSPECT, { sb: db as any, checkAllowed: ALLOW, now: NOW });
    expect(out).toEqual({ outcome: 'enrolled', targetId: 'id-1', sequenceDay: 3 });
    expect(db.tables.outreach_targets).toHaveLength(1);
    expect(db.tables.outreach_targets[0]).toMatchObject({
      email: 'owner@exampledental.com',
      business_name: 'Example Dental',
      status: 'pending',
    });
    expect(seqRows(db)).toHaveLength(1);
    expect(seqRows(db)[0]).toMatchObject({
      target_id: 'id-1',
      sequence_day: 3,
      status: 'pending',
      scheduled_for: DAY3_ISO,
    });
  });

  it('already-enrolled prospect (pending Day 3) is NOT double-enrolled', async () => {
    const db = new FakeDb();
    db.tables.outreach_targets.push({ id: 't1', email: 'owner@exampledental.com', status: 'contacted' });
    seqRows(db).push({ id: 'r1', target_id: 't1', sequence_day: 1, status: 'sent' });
    seqRows(db).push({ id: 'r2', target_id: 't1', sequence_day: 3, status: 'pending', scheduled_for: DAY3_ISO });
    const out = await enrollDashboardSend(PROSPECT, { sb: db as any, checkAllowed: ALLOW, now: NOW });
    expect(out.outcome).toBe('already_in_sequence');
    expect(seqRows(db)).toHaveLength(2); // no duplicate Day-3 row
  });

  it('Apollo Day-1 recipient with Day 1 still pending → Day 1 superseded, Day 3 scheduled (no duplicate Day 1)', async () => {
    const db = new FakeDb();
    db.tables.outreach_targets.push({ id: 't1', email: 'owner@exampledental.com', status: 'pending' });
    seqRows(db).push({ id: 'r1', target_id: 't1', sequence_day: 1, status: 'pending', scheduled_for: '2026-10-17T12:00:00.000Z' });
    const out = await enrollDashboardSend(PROSPECT, { sb: db as any, checkAllowed: ALLOW, now: NOW });
    expect(out).toEqual({ outcome: 'superseded_day1', targetId: 't1', sequenceDay: 3 });
    const day1 = seqRows(db).find((r) => r.sequence_day === 1)!;
    expect(day1.status).toBe('skipped');
    expect(day1.error).toBe('superseded_by_dashboard_send');
    const day3 = seqRows(db).filter((r) => r.sequence_day === 3);
    expect(day3).toHaveLength(1);
    expect(day3[0]).toMatchObject({ status: 'pending', scheduled_for: DAY3_ISO });
  });

  it('Apollo Day-1 recipient whose Day 1 already SENT → sequence left alone (never restarted at Day 1)', async () => {
    const db = new FakeDb();
    db.tables.outreach_targets.push({ id: 't1', email: 'owner@exampledental.com', status: 'contacted' });
    seqRows(db).push({ id: 'r1', target_id: 't1', sequence_day: 1, status: 'sent' });
    seqRows(db).push({ id: 'r2', target_id: 't1', sequence_day: 3, status: 'pending', scheduled_for: DAY3_ISO });
    const out = await enrollDashboardSend(PROSPECT, { sb: db as any, checkAllowed: ALLOW, now: NOW });
    expect(out.outcome).toBe('already_in_sequence');
    expect(seqRows(db)).toHaveLength(2);
    expect(seqRows(db).filter((r) => r.sequence_day === 1)).toHaveLength(1); // no second Day 1
  });

  it('DNC prospect is NOT enrolled (guard block)', async () => {
    const db = new FakeDb();
    const out = await enrollDashboardSend(PROSPECT, { sb: db as any, checkAllowed: BLOCK_DNC, now: NOW });
    expect(out).toEqual({ outcome: 'skipped', reason: 'guard_blocked: On do-not-contact list: test' });
    expect(db.tables.outreach_targets).toHaveLength(0);
    expect(seqRows(db)).toHaveLength(0);
  });

  it('unsubscribed prospect is NOT enrolled', async () => {
    const db = new FakeDb();
    db.tables.outreach_unsubscribes.push({ email: 'owner@exampledental.com' });
    const out = await enrollDashboardSend(PROSPECT, { sb: db as any, checkAllowed: ALLOW, now: NOW });
    expect(out).toEqual({ outcome: 'skipped', reason: 'unsubscribed' });
    expect(seqRows(db)).toHaveLength(0);
  });

  it('enrollment DB failure does not throw — returns skipped (send stands)', async () => {
    const db = new FakeDb();
    db.failOn = { table: 'outreach_sequence_log', op: 'insert' };
    const out = await enrollDashboardSend(PROSPECT, { sb: db as any, checkAllowed: ALLOW, now: NOW });
    expect(out.outcome).toBe('skipped');
    expect((out as { reason: string }).reason).toContain('enrollment_error');
  });

  it('existing blocked target is unblocked to pending and enrolled', async () => {
    const db = new FakeDb();
    db.tables.outreach_targets.push({ id: 't1', email: 'owner@exampledental.com', status: 'blocked' });
    const out = await enrollDashboardSend(PROSPECT, { sb: db as any, checkAllowed: ALLOW, now: NOW });
    expect(out.outcome).toBe('enrolled');
    expect(db.tables.outreach_targets[0].status).toBe('pending');
  });
});
