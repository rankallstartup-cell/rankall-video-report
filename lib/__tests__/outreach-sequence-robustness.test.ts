import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAX_STALE_TOUCH_AGE_DAYS,
  CLAIM_STALE_AFTER_MS,
  selectionWindow,
  isRetryableScheduledFor,
  day1VariantForIndex,
  withVariantSubject,
  summarizeDay1Variants,
  sequenceColumnsSupported,
  tryClaimSequenceRow,
  touchForDay,
} from '../outreachSequences';

// Outreach #7: retry stale touches + A/B test Day-1 subjects.

// --- Minimal in-memory fake of the supabase chain used by the lib helpers ---
// Supports: from().select().limit() (probe) and
// from().update().eq().eq()[.lt()].select() (claim).
type Row = Record<string, any>;

class FakeQuery {
  private updatePatch: Row | null = null;
  private filters: Array<(r: Row) => boolean> = [];
  constructor(private table: Row[], private sb: FakeSb) {}

  select(_cols?: string): this {
    if (this.updatePatch) {
      // select-after-update: execute the update now; .then() resolves it.
      return this;
    }
    return this;
  }
  limit(_n: number): Promise<{ data: Row[] | null; error: { message: string } | null }> {
    if (this.sb.probeError) return Promise.resolve({ data: null, error: { message: this.sb.probeError } });
    return Promise.resolve({ data: this.table.slice(0, 1), error: null });
  }
  eq(k: string, v: unknown): this {
    this.filters.push(r => r[k] === v);
    return this;
  }
  lt(k: string, v: string): this {
    this.filters.push(r => typeof r[k] === 'string' && r[k] < v);
    return this;
  }
  update(patch: Row): this {
    this.updatePatch = patch;
    return this;
  }
  then(resolve: (v: { data: Row[] | null; error: { message: string } | null }) => void, reject: (e: unknown) => void) {
    try {
      if (!this.updatePatch) { resolve({ data: [], error: null }); return; }
      if (this.sb.updateError) { resolve({ data: null, error: { message: this.sb.updateError } }); return; }
      const matched = this.table.filter(r => this.filters.every(f => f(r)));
      for (const r of matched) Object.assign(r, this.updatePatch);
      resolve({ data: matched, error: null });
    } catch (e) { reject(e); }
  }
}

class FakeSb {
  probeError: string | null = null;
  updateError: string | null = null;
  constructor(public rows: Row[]) {}
  from(_table: string): FakeQuery {
    return new FakeQuery(this.rows, this);
  }
}

const asSb = (f: FakeSb) => f as unknown as Parameters<typeof tryClaimSequenceRow>[0];

describe('outreach #7: retry window', () => {
  const now = Date.parse('2026-10-17T12:00:00.000Z');
  it('uses a 7-day max stale age', () => {
    expect(MAX_STALE_TOUCH_AGE_DAYS).toBe(7);
  });
  it('selectionWindow spans [now - 7d, now]', () => {
    const w = selectionWindow(now);
    expect(w.toIso).toBe(new Date(now).toISOString());
    expect(w.fromIso).toBe(new Date(now - 7 * 24 * 3600 * 1000).toISOString());
  });
  it('in-window row is retryable', () => {
    expect(isRetryableScheduledFor(new Date(now - 3 * 24 * 3600 * 1000).toISOString(), now)).toBe(true);
  });
  it('row exactly at the 7-day boundary IS retryable (inclusive)', () => {
    expect(isRetryableScheduledFor(new Date(now - 7 * 24 * 3600 * 1000).toISOString(), now)).toBe(true);
  });
  it('row 1ms past the 7-day boundary is NOT retryable', () => {
    expect(isRetryableScheduledFor(new Date(now - 7 * 24 * 3600 * 1000 - 1).toISOString(), now)).toBe(false);
  });
  it('8-day-old row is NOT retryable', () => {
    expect(isRetryableScheduledFor(new Date(now - 8 * 24 * 3600 * 1000).toISOString(), now)).toBe(false);
  });
  it('future-scheduled row is NOT retryable', () => {
    expect(isRetryableScheduledFor(new Date(now + 3600 * 1000).toISOString(), now)).toBe(false);
  });
  it('invalid timestamp is NOT retryable', () => {
    expect(isRetryableScheduledFor('not-a-date', now)).toBe(false);
  });
});

describe('outreach #7: Day-1 A/B variants', () => {
  it('alternates A, B, A, B across Day-1 sends', () => {
    expect([0, 1, 2, 3, 100, 101].map(day1VariantForIndex)).toEqual(['A', 'B', 'A', 'B', 'A', 'B']);
  });
  it('variant B subject is honest — no fake Re:, no false urgency', () => {
    const day1B = withVariantSubject(touchForDay(1)!, 'B');
    expect(day1B.subject).not.toMatch(/^\s*re:/i);
    expect(day1B.subject).not.toMatch(/urgent|act now|last chance|expires/i);
    expect(day1B.subject).toContain('{{business_name}}');
  });
  it('variant A keeps the existing Day-1 subject (control)', () => {
    const day1A = withVariantSubject(touchForDay(1)!, 'A');
    expect(day1A.subject).toBe('I scanned {{business_name}} on ChatGPT — found something');
  });
  it('never changes subjects for touches other than Day-1', () => {
    for (const day of [3, 5, 8, 14]) {
      const t = touchForDay(day)!;
      expect(withVariantSubject(t, 'B').subject).toBe(t.subject);
      expect(withVariantSubject(t, 'A').subject).toBe(t.subject);
    }
  });
  it('null/unknown variant leaves the subject unchanged', () => {
    const t = touchForDay(1)!;
    expect(withVariantSubject(t, null).subject).toBe(t.subject);
    expect(withVariantSubject(t, 'Z').subject).toBe(t.subject);
  });
});

describe('outreach #7: variant reporting', () => {
  it('attributes open/click by variant', () => {
    const stats = summarizeDay1Variants([
      { variant: 'A', opened_at: 'x', clicked_at: null },
      { variant: 'A', opened_at: null, clicked_at: null },
      { variant: 'B', opened_at: 'x', clicked_at: 'y' },
      { variant: null, opened_at: null, clicked_at: null },
    ]);
    expect(stats.A).toEqual({ sent: 2, opened: 1, clicked: 0, openRate: 0.5, clickRate: 0 });
    expect(stats.B).toEqual({ sent: 1, opened: 1, clicked: 1, openRate: 1, clickRate: 1 });
    expect(stats.unassigned.sent).toBe(1);
  });
  it('empty input yields no buckets', () => {
    expect(summarizeDay1Variants([])).toEqual({});
  });
});

describe('outreach #7: atomic claim', () => {
  const nowIso = '2026-10-17T12:00:00.000Z';
  const oldClaim = new Date(Date.parse(nowIso) - CLAIM_STALE_AFTER_MS - 1000).toISOString();
  const freshClaim = new Date(Date.parse(nowIso) - 1000).toISOString();

  it('claims a pending row exactly once (second claim loses)', async () => {
    const sb = new FakeSb([{ id: 'r1', status: 'pending', sequence_day: 1 }]);
    const first = await tryClaimSequenceRow(asSb(sb), 'r1', {
      expectedStatus: 'pending',
      patch: { status: 'sending', claimed_at: nowIso, variant: 'A' },
    });
    expect(first).toBe(true);
    expect(sb.rows[0].status).toBe('sending');
    expect(sb.rows[0].claimed_at).toBe(nowIso);
    expect(sb.rows[0].variant).toBe('A');
    const second = await tryClaimSequenceRow(asSb(sb), 'r1', {
      expectedStatus: 'pending',
      patch: { status: 'sending', claimed_at: nowIso },
    });
    expect(second).toBe(false);
  });

  it('reclaims a stale sending claim, but not a fresh one', async () => {
    const stale = new FakeSb([{ id: 'r2', status: 'sending', claimed_at: oldClaim }]);
    const reclaimed = await tryClaimSequenceRow(asSb(stale), 'r2', {
      expectedStatus: 'sending',
      claimedBeforeIso: new Date(Date.parse(nowIso) - CLAIM_STALE_AFTER_MS).toISOString(),
      patch: { status: 'sending', claimed_at: nowIso },
    });
    expect(reclaimed).toBe(true);
    expect(stale.rows[0].claimed_at).toBe(nowIso);

    const fresh = new FakeSb([{ id: 'r3', status: 'sending', claimed_at: freshClaim }]);
    const notReclaimed = await tryClaimSequenceRow(asSb(fresh), 'r3', {
      expectedStatus: 'sending',
      claimedBeforeIso: new Date(Date.parse(nowIso) - CLAIM_STALE_AFTER_MS).toISOString(),
      patch: { status: 'sending', claimed_at: nowIso },
    });
    expect(notReclaimed).toBe(false);
    expect(fresh.rows[0].claimed_at).toBe(freshClaim);
  });

  it('claim on a nonexistent row fails', async () => {
    const sb = new FakeSb([]);
    await expect(tryClaimSequenceRow(asSb(sb), 'nope', {
      expectedStatus: 'pending',
      patch: { status: 'sending', claimed_at: nowIso },
    })).resolves.toBe(false);
  });

  it('claim error (e.g. DB failure) fails safe — caller skips the row', async () => {
    const sb = new FakeSb([{ id: 'r4', status: 'pending' }]);
    sb.updateError = 'connection reset';
    await expect(tryClaimSequenceRow(asSb(sb), 'r4', {
      expectedStatus: 'pending',
      patch: { status: 'sending', claimed_at: nowIso },
    })).resolves.toBe(false);
    expect(sb.rows[0].status).toBe('pending');
  });
});

describe('outreach #7: migration-graceful degradation', () => {
  it('missing variant column => columns not supported (legacy mode)', async () => {
    const sb = new FakeSb([]);
    sb.probeError = 'column "variant" does not exist';
    await expect(sequenceColumnsSupported(asSb(sb))).resolves.toBe(false);
  });
  it('unrelated probe error => assume supported (surface real problems)', async () => {
    const sb = new FakeSb([]);
    sb.probeError = 'network down';
    await expect(sequenceColumnsSupported(asSb(sb))).resolves.toBe(true);
  });
  it('probe ok => supported', async () => {
    const sb = new FakeSb([]);
    await expect(sequenceColumnsSupported(asSb(sb))).resolves.toBe(true);
  });
});

describe('outreach #7: route + migration wiring (source-level)', () => {
  const repoRoot = process.cwd();
  const routeSrc = readFileSync(join(repoRoot, 'app/api/cron/outreach-sequence/route.ts'), 'utf8');
  const optimizeSrc = readFileSync(join(repoRoot, 'app/api/cron/outreach-optimize/route.ts'), 'utf8');
  const migrationSrc = readFileSync(join(repoRoot, 'supabase/migrations/20261017_outreach_sequence_variant.sql'), 'utf8');

  it('cron uses the 7-day selection window, not the old 24h window', () => {
    expect(routeSrc).toContain('selectionWindow(nowMs)');
    expect(routeSrc).not.toContain("gte('scheduled_for', dayAgoIso)");
    expect(routeSrc).not.toContain('dayAgoIso');
  });
  it('cron claims rows atomically and sends with an idempotency key', () => {
    expect(routeSrc).toContain('tryClaimSequenceRow');
    expect(routeSrc).toContain('Idempotency-Key');
    expect(routeSrc).toContain('outreach-seq-${row.id}');
  });
  it('cron degrades safely when the migration has not run', () => {
    expect(routeSrc).toContain('sequenceColumnsSupported');
    expect(routeSrc).toContain('legacy mode');
  });
  it('cron records the variant on the sent row and the sent event', () => {
    expect(routeSrc).toContain('variant: variantToStore');
    expect(routeSrc).toContain('sequence_log_id: row.id');
  });
  it('optimize reports open/click by variant', () => {
    expect(optimizeSrc).toContain('summarizeDay1Variants');
    expect(optimizeSrc).toContain('day1Variants');
  });
  it('migration adds variant + claimed_at, idempotently', () => {
    expect(migrationSrc).toContain('ADD COLUMN IF NOT EXISTS variant');
    expect(migrationSrc).toContain('ADD COLUMN IF NOT EXISTS claimed_at');
  });
});
