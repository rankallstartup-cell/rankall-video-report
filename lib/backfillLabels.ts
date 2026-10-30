/**
 * Phase 1 backfill (ticket b7x6, labeling program umbrella b7x4).
 *
 * Labels EXISTING data: scans created before auto-labeling (PR #58) went
 * live, plus any scan whose label/sentiment/trust rows are incomplete.
 *
 * For every scan it fills, in order:
 *   (a) a data_labels row, if the scan has none;
 *   (b) sentiment on platform answers whose sentiment is blank;
 *   (c) trust_signals, if the scan has none — recomputed the same way the
 *       weekly rescan does (stored enrichment + stored scan results, via
 *       detectTrustSignals). Backfilled trust therefore reflects the
 *       website as of the backfill run date, not the original scan date.
 *
 * Guarantees (same as PR #58's autoLabelScan, which does the actual writes):
 * - SINGLE implementation: every write goes through autoLabelScan. This
 *   file only enumerates work and drives it. There is no second copy of
 *   the labeling logic to drift.
 * - NEVER overwrites: an existing data_labels row, an already-set
 *   sentiment, or existing trust_signals are never touched — only blanks
 *   are filled.
 * - IDEMPOTENT: re-running after a successful run is a no-op (0 filled).
 * - FAIL-OPEN per scan: one bad scan is logged in `failures` and the
 *   batch continues. A failed scan never stops the batch.
 * - DRY-RUN: with dryRun=true, only reads happen. Counts report exactly
 *   what a real run would attempt — the sentiment count is a true
 *   prediction (same determinability check as the writer), not an
 *   upper bound over all blank rows.
 * - NEVER invents: no response text → sentiment stays NULL.
 *
 * Trust recompute is injected (default: none) so tests don't need the
 * server-only trust fetcher. The CLI script supplies the real one.
 * Set skipTrust to label + sentiment only.
 */
import { autoLabelScan } from '@/lib/autoLabel';
import { detectSentiment } from '@/lib/analyser-ml';

// ── Minimal structural DB shape (same style as autoLabel's AutoLabelDb). ──

type QueryResult<T> = { data: T | null; error: unknown };
interface BackfillQueryBuilder<T = any> {
  eq(column: string, value: unknown): BackfillQueryBuilder<T>;
  is(column: string, value: null): BackfillQueryBuilder<T>;
  range(from: number, to: number): Promise<QueryResult<T[]>>;
  then<TResult1 = QueryResult<T[]>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
}
export interface BackfillDb {
  from(table: string): {
    select(columns: string): BackfillQueryBuilder;
  };
}

export interface StoredScanRow {
  id: string;
  input: string | null;
  industry: string | null;
  location: string | null;
  country_code: string | null;
  competitor_name: string | null;
  citation_sources: unknown;
  enrichment: Record<string, any> | null;
  trust_signals: unknown;
}

/** Recompute trust for one stored scan. Injected by the caller (the CLI
 *  script supplies detectTrustSignals). Return null to skip the trust
 *  backstop for this scan — label + sentiment still proceed. */
export type RecomputeTrust = (scan: StoredScanRow) => Promise<unknown | null>;

export interface BackfillOptions {
  /** When true, only reads happen; counts report what a real run would do. */
  dryRun?: boolean;
  /** When true, trust_signals are never recomputed (labels + sentiment only). */
  skipTrust?: boolean;
  /** Process at most this many candidate scans (for cautious rollouts). */
  limit?: number;
  /** Restrict the run to these scan ids (single-scan verification). */
  scanIds?: string[];
  /** Trust recompute implementation. Required unless skipTrust is true. */
  recomputeTrust?: RecomputeTrust;
  /** Progress callback (scan index, total candidates, scan id). */
  onProgress?: (done: number, total: number, scanId: string) => void;
  /** Injected for tests. */
  admin?: unknown;
}

export interface BackfillFailure {
  scanId: string;
  step: 'label' | 'trust';
  message: string;
}

export interface BackfillResult {
  dryRun: boolean;
  scansConsidered: number;
  scansProcessed: number;
  labelsCreated: number;
  sentimentsUpdated: number;
  trustBackfilled: number;
  failures: BackfillFailure[];
}

const PAGE_SIZE = 1000;
const SCAN_COLUMNS =
  'id, input, industry, location, country_code, competitor_name, citation_sources, enrichment, trust_signals';

async function fetchAll<T>(db: BackfillDb, table: string, columns: string, isNull?: string): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  for (;;) {
    let q = db.from(table).select(columns);
    if (isNull) q = q.is(isNull, null);
    const { data, error } = await q.range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    out.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return out;
}

export async function backfillLabels(opts: BackfillOptions): Promise<BackfillResult> {
  const dryRun = opts.dryRun ?? false;
  const skipTrust = opts.skipTrust ?? false;
  const db = opts.admin as unknown as BackfillDb;
  const empty: BackfillResult = {
    dryRun,
    scansConsidered: 0,
    scansProcessed: 0,
    labelsCreated: 0,
    sentimentsUpdated: 0,
    trustBackfilled: 0,
    failures: [],
  };
  if (!db) return empty;

  // ── Phase 0: enumerate from reads only. ──
  const scans = await fetchAll<StoredScanRow>(db, 'rankall_scans', SCAN_COLUMNS);
  const labeledRows = await fetchAll<{ scan_id: string }>(db, 'data_labels', 'scan_id');
  const labeledIds = new Set(labeledRows.map((r) => r.scan_id));
  const nullSentimentRows = await fetchAll<{ scan_id: string; response_text: string | null }>(
    db,
    'rankall_platform_results',
    'scan_id, response_text',
    'sentiment',
  );
  // Fillable sentiment per scan: the writer fills a blank row only when
  // detectSentiment finds the business named in the answer. Rows whose
  // answer never names the business stay NULL (honest unknown) — they
  // must NOT keep the scan a "candidate" forever, or every later run
  // would report work remaining when there is none.
  const scansById = new Map(scans.map((s) => [s.id, s]));
  const fillableSentimentByScan = new Map<string, number>();
  for (const r of nullSentimentRows) {
    if (!r.response_text) continue;
    const input = scansById.get(r.scan_id)?.input;
    if (detectSentiment(r.response_text, typeof input === 'string' ? input : '') == null) continue;
    fillableSentimentByScan.set(r.scan_id, (fillableSentimentByScan.get(r.scan_id) ?? 0) + 1);
  }

  const candidates = scans.filter((s) => {
    if (opts.scanIds && !opts.scanIds.includes(s.id)) return false;
    const needsLabel = !labeledIds.has(s.id);
    const needsSentiment = (fillableSentimentByScan.get(s.id) ?? 0) > 0;
    const needsTrust = !skipTrust && s.trust_signals == null;
    return needsLabel || needsSentiment || needsTrust;
  });
  empty.scansConsidered = candidates.length;
  const limited = typeof opts.limit === 'number' && opts.limit >= 0 ? candidates.slice(0, opts.limit) : candidates;

  if (dryRun) {
    // Counts only — no writes, no trust recompute (which fetches live).
    // Sentiment is a TRUE prediction: fillable counts computed above with
    // the same check the writer applies.
    const limitedIds = new Set(limited.map((s) => s.id));
    let labels = 0;
    let trust = 0;
    let sentiments = 0;
    for (const s of limited) {
      if (!labeledIds.has(s.id)) labels += 1;
      if (!skipTrust && s.trust_signals == null) trust += 1;
    }
    for (const id of limitedIds) sentiments += fillableSentimentByScan.get(id) ?? 0;
    return { ...empty, scansProcessed: limited.length, labelsCreated: labels, sentimentsUpdated: sentiments, trustBackfilled: trust };
  }

  // ── Phase 1: per-scan work, fail-open. Every write goes through
  // autoLabelScan — the same code that labels new scans. ──
  let done = 0;
  for (const scan of limited) {
    try {
      let trustSignals: unknown = null;
      let trustAttempted = false;
      if (!skipTrust && scan.trust_signals == null) {
        trustAttempted = true;
        if (opts.recomputeTrust) {
          try {
            trustSignals = await opts.recomputeTrust(scan);
          } catch (err) {
            // Trust recompute failed (e.g. website fetch) — log it and
            // still label + fill sentiment for this scan.
            empty.failures.push({
              scanId: scan.id,
              step: 'trust',
              message: err instanceof Error ? err.message : String(err),
            });
            trustSignals = null;
          }
        }
      }
      const res = await autoLabelScan({
        scanId: scan.id,
        trustSignals: (trustSignals ?? undefined) as { overall?: unknown } | undefined,
        admin: opts.admin,
      });
      if (res.labeled) empty.labelsCreated += 1;
      // autoLabelScan is fail-open: it swallows an insert failure and
      // returns labeled=false. The enumeration already told us this scan
      // NEEDED a label, so labeled=false here means the insert failed —
      // surface it instead of silently reporting success.
      else if (!labeledIds.has(scan.id)) {
        empty.failures.push({
          scanId: scan.id,
          step: 'label',
          message: res.labelError ?? 'data_labels insert failed (see server logs)',
        });
      }
      empty.sentimentsUpdated += res.sentimentsUpdated;
      if (trustAttempted && res.trustBackfilled) empty.trustBackfilled += 1;
      empty.scansProcessed += 1;
    } catch (err) {
      empty.failures.push({
        scanId: scan.id,
        step: 'label',
        message: err instanceof Error ? err.message : String(err),
      });
    }
    done += 1;
    opts.onProgress?.(done, limited.length, scan.id);
  }
  return empty;
}
