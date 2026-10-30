/**
 * Tests for Phase 1 backfill (ticket b7x6): labels EXISTING scans + answers
 * by driving PR #58's autoLabelScan — never overwriting, dry-run safe,
 * re-run is a no-op, per-scan failures never stop the batch.
 */
import { describe, it, expect } from 'vitest';
import { backfillLabels } from '@/lib/backfillLabels';

// ── Fake Supabase client: supports the chains backfillLabels + autoLabelScan
// use (select/eq/is/range/maybeSingle/insert/update + awaiting a builder). ──

type Row = Record<string, any>;

class FakeBuilder {
  private filters: Array<(r: Row) => boolean> = [];
  private pendingUpdate: Row | null = null;
  constructor(
    private db: FakeDb,
    private table: string,
    private op: 'select' | 'insert' | 'update',
    private insertRow?: Row,
  ) {}

  select(_cols: string) {
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  is(col: string, val: null) {
    this.filters.push((r) => (val === null ? r[col] == null : r[col] === val));
    return this;
  }
  async range(from: number, to: number) {
    this.db.maybeThrow(this.table, 'select');
    const rows = this.apply().slice(from, to + 1);
    return { data: rows, error: null };
  }
  insert(row: Row) {
    this.db.maybeThrow(this.table, 'insert', row);
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
  tables: Record<string, Row[]> = { rankall_scans: [], rankall_platform_results: [], data_labels: [] };
  calls: string[] = [];
  failInsertScanIds = new Set<string>();
  maybeThrow(table: string, _op: string, row?: Row) {
    if (table === 'data_labels' && row && this.failInsertScanIds.has(row.scan_id)) {
      throw new Error(`fake failure: insert for ${row.scan_id}`);
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
        const b = new FakeBuilder(db, table, 'update');
        return b.update(row);
      },
    };
  }
}

function scanRow(overrides: Row = {}): Row {
  return {
    id: 'scan-1',
    input: 'Bright Smile Dental',
    industry: 'dentist',
    intent_type: 'local',
    location: 'Austin, TX',
    country_code: 'US',
    overall_score: 42,
    trust_score: 70,
    mentioned_count: 6,
    competitor_name: 'Rival Dental',
    user_business_name: 'Bright Smile Dental',
    citation_sources: [],
    enrichment: { reddit: null },
    trust_signals: { overall: 70 },
    ...overrides,
  };
}

function platformRow(overrides: Row = {}): Row {
  return {
    id: `pr-${Math.random().toString(36).slice(2, 8)}`,
    scan_id: 'scan-1',
    platform: 'chatgpt',
    response_text: 'Bright Smile Dental is excellent, the best dentist in Austin.',
    sentiment: null,
    mentioned: true,
    ...overrides,
  };
}

const fakeTrust = async (_scan: Row) => ({ overall: 88 });

describe('backfillLabels', () => {
  it('fills missing labels for unlabeled scans only — never a second row', async () => {
    const db = new FakeDb();
    db.tables.rankall_scans.push(scanRow({ id: 'scan-1' }), scanRow({ id: 'scan-2', input: 'Second Dental' }));
    db.tables.data_labels.push({ id: 'label-1', scan_id: 'scan-1', labeled_by: 'system' });
    db.tables.rankall_platform_results.push(
      platformRow({ id: 'pr-1', scan_id: 'scan-1', sentiment: 'positive' }),
      platformRow({ id: 'pr-2', scan_id: 'scan-2', sentiment: 'positive' }),
    );
    const res = await backfillLabels({ admin: db, recomputeTrust: fakeTrust });
    expect(res.labelsCreated).toBe(1);
    expect(db.tables.data_labels).toHaveLength(2);
    expect(db.tables.data_labels.map((r) => r.scan_id).sort()).toEqual(['scan-1', 'scan-2']);
    expect(res.failures).toEqual([]);
  });

  it('dry-run changes nothing but reports exact counts', async () => {
    const db = new FakeDb();
    db.tables.rankall_scans.push(
      scanRow({ id: 'scan-1', trust_signals: null }),
      scanRow({ id: 'scan-2' }),
    );
    db.tables.rankall_platform_results.push(
      platformRow({ id: 'pr-1', scan_id: 'scan-1', sentiment: null }),
      platformRow({ id: 'pr-2', scan_id: 'scan-1', sentiment: null, platform: 'gemini' }),
      platformRow({ id: 'pr-3', scan_id: 'scan-2', sentiment: 'positive' }),
      // Blank + answer that never names the business → dry-run must NOT
      // count it (the writer leaves it NULL as honest unknown).
      platformRow({ id: 'pr-4', scan_id: 'scan-1', sentiment: null, platform: 'perplexity', response_text: 'Generic dental advice with no business named.' }),
    );
    const res = await backfillLabels({ admin: db, dryRun: true, recomputeTrust: fakeTrust });
    expect(res.dryRun).toBe(true);
    expect(res.labelsCreated).toBe(2); // both scans unlabeled
    expect(res.sentimentsUpdated).toBe(2); // only the two rows that name the business
    expect(res.trustBackfilled).toBe(1); // only scan-1 lacks trust
    expect(db.calls).toEqual([]); // no writes of any kind
    expect(db.tables.data_labels).toHaveLength(0);
  });

  it('a scan with only unfillable blanks is not a candidate', async () => {
    const db = new FakeDb();
    db.tables.rankall_scans.push(scanRow({ id: 'scan-1' }));
    db.tables.data_labels.push({ id: 'label-1', scan_id: 'scan-1', labeled_by: 'system' });
    db.tables.rankall_platform_results.push(
      platformRow({ id: 'pr-1', sentiment: null, response_text: 'Generic dental advice with no business named.' }),
      platformRow({ id: 'pr-2', sentiment: null, response_text: null }),
    );
    // The two blank rows can never be filled (no business named / no
    // answer), so the scan must not show up as remaining work.
    const dry = await backfillLabels({ admin: db, dryRun: true, recomputeTrust: fakeTrust });
    expect(dry.scansConsidered).toBe(0);
    expect(dry.sentimentsUpdated).toBe(0);
    const real = await backfillLabels({ admin: db, recomputeTrust: fakeTrust });
    expect(real.scansConsidered).toBe(0);
    expect(real.scansProcessed).toBe(0);
    expect(db.calls).toEqual([]);
  });

  it('re-run is a no-op after the first run', async () => {
    const db = new FakeDb();
    db.tables.rankall_scans.push(scanRow({ id: 'scan-1', trust_signals: null }));
    db.tables.rankall_platform_results.push(platformRow({ id: 'pr-1', scan_id: 'scan-1' }));
    const first = await backfillLabels({ admin: db, recomputeTrust: fakeTrust });
    expect(first.labelsCreated).toBe(1);
    expect(first.sentimentsUpdated).toBe(1);
    expect(first.trustBackfilled).toBe(1);
    const second = await backfillLabels({ admin: db, recomputeTrust: fakeTrust });
    expect(second.scansConsidered).toBe(0);
    expect(second.labelsCreated).toBe(0);
    expect(second.sentimentsUpdated).toBe(0);
    expect(second.trustBackfilled).toBe(0);
    expect(second.failures).toEqual([]);
    expect(db.tables.data_labels).toHaveLength(1);
  });

  it('fills sentiment only where blank, never overwrites, never invents', async () => {
    const db = new FakeDb();
    db.tables.rankall_scans.push(scanRow({ id: 'scan-1' }));
    db.tables.data_labels.push({ id: 'label-1', scan_id: 'scan-1', labeled_by: 'system' });
    db.tables.rankall_platform_results.push(
      platformRow({ id: 'pr-1', sentiment: 'positive', response_text: 'Bright Smile Dental is terrible.' }),
      platformRow({ id: 'pr-2', sentiment: null, response_text: 'Bright Smile Dental is excellent.' }),
      platformRow({ id: 'pr-3', sentiment: null, response_text: null }),
    );
    const res = await backfillLabels({ admin: db, recomputeTrust: fakeTrust });
    const rows = db.tables.rankall_platform_results;
    expect(rows.find((r) => r.id === 'pr-1')!.sentiment).toBe('positive');
    expect(rows.find((r) => r.id === 'pr-2')!.sentiment).toBe('positive');
    expect(rows.find((r) => r.id === 'pr-3')!.sentiment).toBeNull();
    expect(res.sentimentsUpdated).toBe(1);
    expect(res.labelsCreated).toBe(0); // label already existed
  });

  it('recomputes trust only for scans lacking it; a failed recompute still labels', async () => {
    const db = new FakeDb();
    db.tables.rankall_scans.push(
      scanRow({ id: 'scan-1', trust_signals: null }),
      scanRow({ id: 'scan-2', trust_signals: { overall: 55 } }),
    );
    const seen: string[] = [];
    const recompute = async (scan: Row) => {
      seen.push(scan.id);
      if (scan.id === 'scan-1') throw new Error('website fetch failed');
      return { overall: 88 };
    };
    const res = await backfillLabels({ admin: db, recomputeTrust: recompute });
    // Only the scan lacking trust was recomputed (scan-2 never passed).
    expect(seen).toEqual(['scan-1']);
    // Label + sentiment still happened for scan-1 despite the trust failure.
    expect(res.labelsCreated).toBe(2);
    expect(res.trustBackfilled).toBe(0);
    expect(res.failures).toHaveLength(1);
    expect(res.failures[0]).toMatchObject({ scanId: 'scan-1', step: 'trust' });
    expect(db.tables.rankall_scans.find((r) => r.id === 'scan-1')!.trust_signals).toBeNull();
    expect(db.tables.rankall_scans.find((r) => r.id === 'scan-2')!.trust_signals).toEqual({ overall: 55 });
  });

  it('skipTrust never recomputes and never backfills trust', async () => {
    const db = new FakeDb();
    db.tables.rankall_scans.push(scanRow({ id: 'scan-1', trust_signals: null }));
    let called = 0;
    const recompute = async (_scan: Row) => {
      called += 1;
      return { overall: 88 };
    };
    const res = await backfillLabels({ admin: db, skipTrust: true, recomputeTrust: recompute });
    expect(called).toBe(0);
    expect(res.trustBackfilled).toBe(0);
    expect(res.labelsCreated).toBe(1);
    expect(db.tables.rankall_scans[0].trust_signals).toBeNull();
  });

  it('one bad scan does not stop the batch', async () => {
    const db = new FakeDb();
    db.tables.rankall_scans.push(
      scanRow({ id: 'scan-bad' }),
      scanRow({ id: 'scan-good', input: 'Good Dental' }),
    );
    db.failInsertScanIds.add('scan-bad');
    const res = await backfillLabels({ admin: db, recomputeTrust: fakeTrust });
    expect(res.failures).toHaveLength(1);
    expect(res.failures[0]).toMatchObject({ scanId: 'scan-bad', step: 'label' });
    expect(res.labelsCreated).toBe(1);
    expect(db.tables.data_labels.map((r) => r.scan_id)).toEqual(['scan-good']);
  });

  it('scanIds restricts the run to one scan', async () => {
    const db = new FakeDb();
    db.tables.rankall_scans.push(scanRow({ id: 'scan-1' }), scanRow({ id: 'scan-2', input: 'Second Dental' }));
    const res = await backfillLabels({ admin: db, scanIds: ['scan-2'], recomputeTrust: fakeTrust });
    expect(res.labelsCreated).toBe(1);
    expect(db.tables.data_labels.map((r) => r.scan_id)).toEqual(['scan-2']);
  });
});
