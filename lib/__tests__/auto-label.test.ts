/**
 * Tests for Phase 1 auto-labeling (ticket b7x5): every completed scan gets
 * a data_labels row, sentiment on every answer, and a trust backstop —
 * without ever overwriting existing labels and without ever failing the scan.
 */
import { describe, it, expect } from 'vitest';
import {
  autoLabelScan,
  classifyBusinessType,
  classifyQueryType,
  extractCityState,
  confidenceFor,
} from '@/lib/autoLabel';

// ── Minimal fake Supabase client: supports exactly the chains autoLabelScan
// uses (select/eq/is/maybeSingle/insert/update + await on a builder). ──

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
  tables: Record<string, Row[]> = { rankall_scans: [], rankall_platform_results: [], data_labels: [] };
  calls: string[] = [];
  failOn: string | null = null;
  maybeThrow(table: string, op: string) {
    if (this.failOn === `${table}.${op}`) throw new Error(`fake failure: ${table}.${op}`);
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

describe('classifiers (moved verbatim from the old label-scan route)', () => {
  it('classifies business type', () => {
    expect(classifyBusinessType('dentist')).toBe('medical');
    expect(classifyBusinessType('lawyer')).toBe('legal');
    expect(classifyBusinessType('pizza')).toBe('restaurant');
    expect(classifyBusinessType('plumber')).toBe('local_service');
    expect(classifyBusinessType('saas')).toBe('saas');
    expect(classifyBusinessType('unknown thing')).toBe('other');
  });
  it('classifies query type', () => {
    expect(classifyQueryType('best dentist in Austin')).toBe('local');
    expect(classifyQueryType('how do I fix a leak')).toBe('informational');
    expect(classifyQueryType('book a dentist appointment')).toBe('transactional');
    expect(classifyQueryType('Bright Smile Dental')).toBe('navigational');
  });
  it('extracts city/state', () => {
    expect(extractCityState('Austin, TX')).toEqual({ city: 'Austin', state: 'TX' });
    expect(extractCityState('Austin TX')).toEqual({ city: 'Austin', state: 'TX' });
    expect(extractCityState('Austin')).toEqual({ city: 'Austin', state: '' });
  });
  it('computes confidence bands', () => {
    expect(confidenceFor(6, 11)).toBe('high');
    expect(confidenceFor(3, 11)).toBe('medium');
    expect(confidenceFor(0, 11)).toBe('low');
    expect(confidenceFor(0, 0)).toBe('low');
  });
});

describe('autoLabelScan', () => {
  it('writes a complete data_labels row for a completed scan', async () => {
    const db = new FakeDb();
    db.tables.rankall_scans.push(scanRow({ mentioned_count: 2 }));
    db.tables.rankall_platform_results.push(
      platformRow({ id: 'pr-1', platform: 'chatgpt', mentioned: true }),
      platformRow({ id: 'pr-2', platform: 'gemini', mentioned: true, response_text: 'Gemini lists Bright Smile Dental among top dentists.' }),
      platformRow({ id: 'pr-3', platform: 'perplexity', mentioned: false, response_text: null }),
    );
    const res = await autoLabelScan({
      scanId: 'scan-1',
      platformSentiments: [
        { platform: 'chatgpt', sentiment: 'positive' },
        { platform: 'gemini', sentiment: 'positive' },
      ],
      trustSignals: { overall: 70 },
      admin: db,
    });
    expect(res.labeled).toBe(true);
    expect(db.tables.data_labels).toHaveLength(1);
    const label = db.tables.data_labels[0];
    expect(label.scan_id).toBe('scan-1');
    expect(label.business_name).toBe('Bright Smile Dental');
    expect(label.industry).toBe('dentist');
    expect(label.intent_type).toBe('local');
    expect(label.location).toBe('Austin, TX');
    expect(label.city).toBe('Austin');
    expect(label.state).toBe('TX');
    expect(label.country).toBe('US');
    expect(label.query_type).toBe('navigational');
    expect(label.business_type).toBe('medical');
    expect(label.competitor_category).toBe('direct');
    expect(label.ai_recommendation_confidence).toBe('high'); // 2 mentioned of 3 stored rows
    expect(label.platforms_mentioned).toEqual(['chatgpt', 'gemini']);
    expect(label.trust_score).toBe(70);
    expect(label.overall_score).toBe(42);
    expect(label.labeled_by).toBe('system');
    expect(typeof label.labeled_at).toBe('string');
  });

  it('fills sentiment only where blank, never overwrites', async () => {
    const db = new FakeDb();
    db.tables.rankall_scans.push(scanRow());
    db.tables.rankall_platform_results.push(
      platformRow({ id: 'pr-1', platform: 'chatgpt', sentiment: 'positive', response_text: 'Bright Smile Dental is terrible.' }),
      platformRow({ id: 'pr-2', platform: 'gemini', sentiment: null, response_text: 'Bright Smile Dental is excellent.' }),
      platformRow({ id: 'pr-3', platform: 'perplexity', sentiment: null, response_text: null }),
    );
    const res = await autoLabelScan({
      scanId: 'scan-1',
      platformSentiments: [
        { platform: 'chatgpt', sentiment: 'negative' },
        { platform: 'gemini', sentiment: 'positive' },
      ],
      admin: db,
    });
    const rows = db.tables.rankall_platform_results;
    // Pre-existing sentiment untouched even though the passed value disagrees.
    expect(rows.find((r) => r.id === 'pr-1')!.sentiment).toBe('positive');
    // Blank + answer → filled from passed sentiment.
    expect(rows.find((r) => r.id === 'pr-2')!.sentiment).toBe('positive');
    // No answer → stays NULL (honest unknown, never invented).
    expect(rows.find((r) => r.id === 'pr-3')!.sentiment).toBeNull();
    expect(res.sentimentsUpdated).toBe(1);
  });

  it('recomputes sentiment from stored response text when the caller passes none', async () => {
    const db = new FakeDb();
    db.tables.rankall_scans.push(scanRow());
    db.tables.rankall_platform_results.push(
      platformRow({ id: 'pr-1', response_text: 'Bright Smile Dental is excellent, the best in Austin.' }),
    );
    const res = await autoLabelScan({ scanId: 'scan-1', admin: db });
    expect(db.tables.rankall_platform_results[0].sentiment).toBe('positive');
    expect(res.sentimentsUpdated).toBe(1);
  });

  it('never creates a second data_labels row for the same scan', async () => {
    const db = new FakeDb();
    db.tables.rankall_scans.push(scanRow());
    db.tables.data_labels.push({ id: 'label-1', scan_id: 'scan-1', labeled_by: 'system' });
    const res = await autoLabelScan({ scanId: 'scan-1', admin: db });
    expect(res.labeled).toBe(false);
    expect(db.tables.data_labels).toHaveLength(1);
  });

  it('labeling failure never throws and never fails the scan', async () => {
    const db = new FakeDb();
    db.tables.rankall_scans.push(scanRow());
    db.failOn = 'data_labels.insert';
    const res = await autoLabelScan({ scanId: 'scan-1', admin: db });
    // Resolves (does not reject) even though the insert threw.
    expect(res.labeled).toBe(false);
    expect(res.sentimentsUpdated).toBe(0);
  });

  it('scan with no platform responses gets honest empty labels', async () => {
    const db = new FakeDb();
    db.tables.rankall_scans.push(scanRow({ mentioned_count: 0, competitor_name: null }));
    const res = await autoLabelScan({ scanId: 'scan-1', admin: db });
    expect(res.labeled).toBe(true);
    const label = db.tables.data_labels[0];
    expect(label.platforms_mentioned).toEqual([]);
    expect(label.ai_recommendation_confidence).toBe('low');
    expect(label.competitor_category).toBe('none');
    expect(res.sentimentsUpdated).toBe(0);
  });

  it('trust backstop fills a missing trust_signals row, and never overwrites', async () => {
    const db = new FakeDb();
    db.tables.rankall_scans.push(scanRow({ trust_signals: null }));
    const res = await autoLabelScan({ scanId: 'scan-1', trustSignals: { overall: 70 }, admin: db });
    expect(res.trustBackfilled).toBe(true);
    expect(db.tables.rankall_scans[0].trust_signals).toEqual({ overall: 70 });
    expect(db.tables.rankall_scans[0].trust_score).toBe(70);

    // Second run: row already has trust signals → untouched.
    const db2 = new FakeDb();
    db2.tables.rankall_scans.push(scanRow({ trust_signals: { overall: 55 } }));
    const res2 = await autoLabelScan({ scanId: 'scan-1', trustSignals: { overall: 99 }, admin: db2 });
    expect(res2.trustBackfilled).toBe(false);
    expect(db2.tables.rankall_scans[0].trust_signals).toEqual({ overall: 55 });
  });

  it('missing scan row → no labels, no throw', async () => {
    const db = new FakeDb();
    const res = await autoLabelScan({ scanId: 'scan-missing', admin: db });
    expect(res).toEqual({ labeled: false, sentimentsUpdated: 0, trustBackfilled: false });
    expect(db.tables.data_labels).toHaveLength(0);
  });
});
