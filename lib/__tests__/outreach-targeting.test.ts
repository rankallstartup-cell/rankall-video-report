import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  normalizeBusinessName,
  normalizeCity,
  namesMatch,
  citiesMatch,
  wasEmailedRecently,
  qualityScoreFor,
  rankTargetsByQuality,
  isLikelyChain,
  distinctAddressCounts,
} from '@/lib/outreachTargeting';

// In-memory fake Supabase client: supports the select/eq/gte/in chain
// used by wasEmailedRecently. Tables are plain row arrays.
type Row = Record<string, unknown>;

class FakeQuery {
  private rows: Row[];
  constructor(rows: Row[]) { this.rows = [...rows]; }
  select(_cols: string) { return this; }
  eq(col: string, val: unknown) { this.rows = this.rows.filter(r => r[col] === val); return this; }
  gte(col: string, val: string) { this.rows = this.rows.filter(r => String(r[col] ?? '') >= val); return this; }
  in(col: string, vals: unknown[]) { this.rows = this.rows.filter(r => vals.includes(r[col])); return this; }
  then(resolve: (v: { data: Row[]; error: null }) => unknown, reject?: (e: unknown) => unknown) {
    return Promise.resolve({ data: this.rows, error: null }).then(resolve as never, reject);
  }
}

class ThrowingQuery {
  select(_c: string) { return this; }
  eq(_c: string, _v: unknown) { return this; }
  gte(_c: string, _v: string) { return this; }
  in(_c: string, _v: unknown[]) { return this; }
  then(_resolve: unknown, reject?: (e: unknown) => unknown) {
    return Promise.reject(new Error('db down')).then(undefined, reject);
  }
}

function fakeClient(tables: Record<string, Row[]>, failing = false): SupabaseClient {
  return {
    from: (table: string) => (failing ? new ThrowingQuery() : new FakeQuery(tables[table] ?? [])),
  } as unknown as SupabaseClient;
}

const NOW = new Date('2026-10-17T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 3600 * 1000).toISOString();

describe('outreach targeting #9 — name/city normalization', () => {
  it("tolerant name match: \"Joe's Pizza\" == \"Joes Pizza\"", () => {
    expect(normalizeBusinessName("Joe's Pizza")).toBe('joes pizza');
    expect(normalizeBusinessName('Joes Pizza')).toBe('joes pizza');
    expect(namesMatch("Joe's Pizza", 'Joes Pizza')).toBe(true);
  });
  it('strips legal suffixes', () => {
    expect(namesMatch("Joe's Pizza LLC", "Joe's Pizza")).toBe(true);
    expect(namesMatch('Acme Inc', 'Acme')).toBe(true);
  });
  it('does NOT over-match similar-but-different names', () => {
    expect(namesMatch("Joe's Pizza", "Joe's Pizza & Grill")).toBe(false);
    expect(namesMatch("Joe's Pizza", "Joey's Pizza")).toBe(false);
  });
  it('strips diacritics', () => {
    expect(namesMatch('Café Luna', 'Cafe Luna')).toBe(true);
  });
  it('empty names never match', () => {
    expect(namesMatch('', 'Acme')).toBe(false);
    expect(namesMatch('LLC', 'LLC')).toBe(false);
  });
  it('city: "Austin, TX" == "Austin", different cities independent', () => {
    expect(normalizeCity('Austin, TX')).toBe('austin');
    expect(citiesMatch('Austin, TX', 'Austin')).toBe(true);
    expect(citiesMatch('Austin', 'Dallas')).toBe(false);
    expect(citiesMatch('', 'Austin')).toBe(false);
  });
});

describe('outreach targeting #9 — 90-day re-mail check', () => {
  it('89-day-old dashboard send blocks; 91-day-old does not', async () => {
    const sb89 = fakeClient({ outreach_log: [{ business_name: "Joe's Pizza", city: 'Austin', status: 'sent', sent_at: daysAgo(89) }], outreach_sequence_log: [], outreach_targets: [] });
    const r89 = await wasEmailedRecently(sb89, "Joe's Pizza", 'Austin', { now: NOW });
    expect(r89.blocked).toBe(true);
    expect(r89.reason).toBe('recently_emailed');
    expect(r89.source).toBe('dashboard');

    const sb91 = fakeClient({ outreach_log: [{ business_name: "Joe's Pizza", city: 'Austin', status: 'sent', sent_at: daysAgo(91) }], outreach_sequence_log: [], outreach_targets: [] });
    const r91 = await wasEmailedRecently(sb91, "Joe's Pizza", 'Austin', { now: NOW });
    expect(r91.blocked).toBe(false);
  });

  it("same name in a different city is independent", async () => {
    const sb = fakeClient({ outreach_log: [{ business_name: "Joe's Pizza", city: 'Dallas', status: 'sent', sent_at: daysAgo(10) }], outreach_sequence_log: [], outreach_targets: [] });
    const r = await wasEmailedRecently(sb, "Joe's Pizza", 'Austin', { now: NOW });
    expect(r.blocked).toBe(false);
  });

  it('tolerant name match blocks across spellings ("Joes Pizza" log vs "Joe\'s Pizza" query)', async () => {
    const sb = fakeClient({ outreach_log: [{ business_name: 'Joes Pizza', city: 'Austin', status: 'sent', sent_at: daysAgo(5) }], outreach_sequence_log: [], outreach_targets: [] });
    const r = await wasEmailedRecently(sb, "Joe's Pizza", 'Austin', { now: NOW });
    expect(r.blocked).toBe(true);
  });

  it('scanned-only (enrolled, never sent) is NOT blocked', async () => {
    const sb = fakeClient({
      outreach_log: [],
      outreach_sequence_log: [],
      outreach_targets: [{ id: 't1', business_name: "Joe's Pizza", city: 'Austin', status: 'pending' }],
    });
    const r = await wasEmailedRecently(sb, "Joe's Pizza", 'Austin', { now: NOW });
    expect(r.blocked).toBe(false);
  });

  it('non-sent log rows (verification skips) do NOT block', async () => {
    const sb = fakeClient({ outreach_log: [{ business_name: "Joe's Pizza", city: 'Austin', status: 'skipped_catch_all', sent_at: daysAgo(2) }], outreach_sequence_log: [], outreach_targets: [] });
    const r = await wasEmailedRecently(sb, "Joe's Pizza", 'Austin', { now: NOW });
    expect(r.blocked).toBe(false);
  });

  it('sequence send within window blocks with source=sequence', async () => {
    const sb = fakeClient({
      outreach_log: [],
      outreach_sequence_log: [{ target_id: 't1', status: 'sent', sent_at: daysAgo(3) }],
      outreach_targets: [{ id: 't1', business_name: "Joe's Pizza", city: 'Austin, TX', status: 'contacted' }],
    });
    const r = await wasEmailedRecently(sb, "Joe's Pizza", 'Austin', { now: NOW });
    expect(r.blocked).toBe(true);
    expect(r.source).toBe('sequence');
  });

  it('history lookup failure fails OPEN (send proceeds)', async () => {
    const sb = fakeClient({}, true);
    const r = await wasEmailedRecently(sb, "Joe's Pizza", 'Austin', { now: NOW });
    expect(r.blocked).toBe(false);
    expect(r.lookupFailed).toBe(true);
  });

  it('no-city fallback: exact email match blocks', async () => {
    const sb = fakeClient({
      outreach_log: [{ business_name: 'Other Name', city: 'Elsewhere', email: 'owner@joes.example', status: 'sent', sent_at: daysAgo(4) }],
      outreach_sequence_log: [],
      outreach_targets: [],
    });
    const r = await wasEmailedRecently(sb, "Joe's Pizza", '', { now: NOW, email: 'owner@joes.example' });
    expect(r.blocked).toBe(true);
    expect(r.source).toBe('dashboard');
  });
});

describe('outreach targeting #9 — quality ranking', () => {
  it('website + reviews rank first; website-less rank last but stay', () => {
    const targets = [
      { businessName: 'NoSite', hasWebsite: false, rating: null, reviewCount: null },
      { businessName: 'SiteOnly', hasWebsite: true, rating: null, reviewCount: null },
      { businessName: 'Full', hasWebsite: true, rating: 4.8, reviewCount: 120 },
      { businessName: 'ReviewsOnly', hasWebsite: false, rating: 4.5, reviewCount: 30 },
    ];
    expect(qualityScoreFor(targets[0])).toBe(0);
    expect(qualityScoreFor(targets[1])).toBe(1);
    expect(qualityScoreFor(targets[2])).toBe(2);
    const ranked = rankTargetsByQuality(targets);
    expect(ranked.map(t => t.businessName)).toEqual(['Full', 'SiteOnly', 'ReviewsOnly', 'NoSite']);
    expect(ranked).toHaveLength(4); // nobody dropped
  });
  it('stable order within equal scores', () => {
    const targets = [
      { businessName: 'A', hasWebsite: true, rating: null, reviewCount: null },
      { businessName: 'B', hasWebsite: true, rating: null, reviewCount: null },
    ];
    expect(rankTargetsByQuality(targets).map(t => t.businessName)).toEqual(['A', 'B']);
  });
});

describe('outreach targeting #9 — chain filter', () => {
  it('multi-location name (2+ distinct addresses) is a likely chain', () => {
    const counts = distinctAddressCounts([
      { businessName: 'Metro Dental', address: '1 Main St, Austin' },
      { businessName: 'Metro Dental', address: '500 Oak Ave, Austin' },
      { businessName: 'Solo Dental', address: '9 Elm St, Austin' },
    ]);
    expect(counts.get('metro dental')).toBe(2);
    expect(isLikelyChain('metro dental', 2)).toBe(true);
    expect(isLikelyChain('solo dental', 1)).toBe(false);
  });
  it('known franchise exact name is a likely chain', () => {
    expect(isLikelyChain('mcdonalds', 1)).toBe(true);
    expect(isLikelyChain('starbucks', 1)).toBe(true);
  });
  it('does NOT flag lookalikes: "Subway Tile Store" is not the Subway chain', () => {
    expect(isLikelyChain('subway tile store', 1)).toBe(false);
    expect(isLikelyChain('mcdonalds plumbing', 1)).toBe(false);
  });
});
