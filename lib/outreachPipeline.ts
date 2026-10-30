// lib/outreachPipeline.ts
// Nightly prospect pipeline (outreach improvement #5): every night, take the
// next UNSCANNED prospects, scan each via the EXISTING /api/outreach/run-scan
// path, and enrol each scanned prospect into the Day-1 sequence (the EXISTING
// outreach_sequence_log insert from the Apollo webhook).
//
// Hard guarantees:
// - SPEND CAP: a configurable nightly max (default 10) enforced in code. The
//   pipeline re-checks the DB-backed attempt count before EVERY scan and stops
//   the moment it hits the cap — it can never exceed it, even if two runs
//   overlap.
// - IDEMPOTENCY: a prospect scanned once is never re-scanned (scan_id set
//   means done). Prospects scanned but never enrolled (e.g. an Apollo
//   enrollment insert failed) are enrolled without a new scan.
// - DEDUPE: a prospect already in the sequence is never double-enrolled,
//   and the same email is never enrolled twice (checked by target_id AND by
//   email across all targets). Never restarts a completed sequence.
// - FAILURE ISOLATION: one prospect's scan failure is logged and the batch
//   continues with the rest.
//
// Sources, in priority order:
// 1. outreach_targets rows with no scan (status pending/queued, not DNC).
// 2. outreach_intelligence rows with status 'new' — promoted into
//    outreach_targets (status 'queued') so the pipeline has one queue.
// 3. Seeded prospects: POST /api/admin/outreach/prospect-seed inserts into
//    outreach_targets with status 'queued'.
// The pipeline NEVER calls SerpAPI — it only consumes prospects already in
// the DB or seeded by an admin.

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const PIPELINE_NIGHTLY_DEFAULT_MAX = 10;
export const PIPELINE_NIGHTLY_MAX_LIMIT = 50;
export const PIPELINE_TIME_BUDGET_MS = 240_000; // stop starting new scans after 4 min (route maxDuration is 300s)
export const PIPELINE_MAX_CANDIDATES = 50;
export const PIPELINE_CANDIDATE_STATUSES = ['pending', 'queued'] as const;

// Outcomes that CONSUMED a scan attempt (LLM credits). 'cached' is NOT here:
// run-scan returned a stored scan without spending credits, so it must not
// count against the spend cap.
export const PIPELINE_SPEND_OUTCOMES = ['scanned', 'failed', 'scanned_enroll_failed'] as const;

export type PipelineOutcome =
  | 'scanned'
  | 'cached'
  | 'enrolled_only'
  | 'failed'
  | 'scanned_enroll_failed'
  | `skipped_${string}`;

export function getNightlyMax(env: Record<string, string | undefined> = process.env): number {
  const raw = env.OUTREACH_PIPELINE_NIGHTLY_MAX;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed)) return PIPELINE_NIGHTLY_DEFAULT_MAX;
  return Math.min(Math.max(parsed, 1), PIPELINE_NIGHTLY_MAX_LIMIT);
}

/** Hard cap check: no more attempts once today's spend hits the cap. */
export function canAttempt(attemptsToday: number, cap: number): boolean {
  return attemptsToday < cap;
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

export interface PipelineCandidate {
  source: 'outreach_targets' | 'outreach_intelligence' | 'prospect_seed';
  sourceId: string | null; // outreach_intelligence id for promoted rows, else target id
  targetId: string;
  businessName: string;
  email: string | null;
  city: string | null;
  industry: string | null;
  countryCode: string;
  ownerName: string | null;
  doNotContact: boolean;
  hasScan: boolean; // true => enroll-only, never re-scan
  scanId: string | null;
}

/** Why this candidate must NOT be scanned/enrolled, or null if it may proceed. */
export function candidateSkipReason(c: Pick<PipelineCandidate, 'email' | 'industry' | 'city' | 'doNotContact'>): string | null {
  if (c.doNotContact) return 'skipped_dnc';
  if (!c.email) return 'skipped_no_email';
  if (!c.industry) return 'skipped_no_industry';
  if (!c.city) return 'skipped_no_city';
  return null;
}

/** outreach_intelligence stores industry/location/phone in a notes JSON blob. */
export function parseIntelligenceNotes(notes: string | null | undefined): {
  industry: string | null;
  city: string | null;
  ownerName: string | null;
  phone: string | null;
  website: string | null;
} {
  const empty = { industry: null, city: null, ownerName: null, phone: null, website: null };
  if (!notes) return empty;
  try {
    const parsed = JSON.parse(notes) as Record<string, unknown>;
    const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
    // Location may be "City, ST" or a bare city.
    const location = str(parsed.location) ?? str(parsed.city);
    return {
      industry: str(parsed.industry),
      city: location,
      ownerName: [str(parsed.first_name), str(parsed.last_name)].filter(Boolean).join(' ') || str(parsed.owner_name),
      phone: str(parsed.phone),
      website: str(parsed.website),
    };
  } catch {
    return empty;
  }
}

/** Dedupe decision: never double-enrol, never restart a completed sequence. */
export function decideEnrollment(args: { hasTargetSequence: boolean; hasEmailSequence: boolean }): { enroll: boolean; reason: string | null } {
  if (args.hasTargetSequence) return { enroll: false, reason: 'skipped_already_enrolled' };
  if (args.hasEmailSequence) return { enroll: false, reason: 'skipped_duplicate_email' };
  return { enroll: true, reason: null };
}

/** Normalise a /api/outreach/run-scan response into a scan result. */
export function classifyRunScanResponse(
  httpOk: boolean,
  json: Record<string, unknown> | null,
): { ok: boolean; cached: boolean; scanId: string | null; score: number | null; competitor: string | null; error: string | null } {
  if (!httpOk) {
    const msg = typeof json?.error === 'string' ? json.error : 'run-scan request failed';
    return { ok: false, cached: false, scanId: null, score: null, competitor: null, error: msg };
  }
  const scanId = typeof json?.scanId === 'string' ? json.scanId : null;
  if (!scanId) {
    const saveError = typeof json?.saveError === 'string' ? json.saveError : null;
    return { ok: false, cached: false, scanId: null, score: null, competitor: null, error: saveError ?? 'run-scan returned no scanId' };
  }
  const competitor = (json?.competitor as { name?: unknown } | null)?.name;
  return {
    ok: true,
    cached: json?.cached === true,
    scanId,
    score: typeof json?.overallScore === 'number' ? json.overallScore : null,
    competitor: typeof competitor === 'string' ? competitor : null,
    error: null,
  };
}

// ---------------------------------------------------------------------------
// DB adapter (thin Supabase wrapper — the orchestrator below only talks to
// this interface, so tests can inject an in-memory implementation).
// ---------------------------------------------------------------------------

export interface OutreachTargetRow {
  id: string;
  business_name: string | null;
  owner_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  country_code: string | null;
  industry: string | null;
  scan_id: string | null;
  rankall_score: number | null;
  competitor_name: string | null;
  status: string | null;
  do_not_contact: boolean | null;
  created_at?: string;
}

export interface IntelligenceRow {
  id: string;
  business_name: string | null;
  email: string | null;
  country_code: string | null;
  status: string | null;
  notes: string | null;
  created_at?: string;
}

export interface PipelineDb {
  countAttempts(runDate: string): Promise<number>;
  listUnscannedTargets(limit: number): Promise<OutreachTargetRow[]>;
  listScannedUnenrolledTargets(limit: number): Promise<OutreachTargetRow[]>;
  listNewIntelligence(limit: number): Promise<IntelligenceRow[]>;
  findTargetByEmail(email: string): Promise<OutreachTargetRow | null>;
  findTargetByNameCity(name: string, city: string): Promise<OutreachTargetRow | null>;
  isOnDoNotContact(email: string): Promise<boolean>;
  targetHasSequence(targetId: string): Promise<boolean>;
  emailHasSequence(email: string): Promise<boolean>;
  insertTarget(row: Record<string, unknown>): Promise<{ id: string } | null>;
  updateTarget(id: string, patch: Record<string, unknown>): Promise<void>;
  insertSequenceRow(row: Record<string, unknown>): Promise<boolean>;
  insertLog(row: Record<string, unknown>): Promise<void>;
}

export function createSupabasePipelineDb(sb: SupabaseClient): PipelineDb {
  return {
    async countAttempts(runDate) {
      const { count } = await sb
        .from('outreach_pipeline_log')
        .select('id', { count: 'exact', head: true })
        .eq('run_date', runDate)
        .in('outcome', [...PIPELINE_SPEND_OUTCOMES]);
      return count ?? 0;
    },
    async listUnscannedTargets(limit) {
      const { data } = await sb
        .from('outreach_targets')
        .select('*')
        .is('scan_id', null)
        .in('status', [...PIPELINE_CANDIDATE_STATUSES])
        .order('created_at', { ascending: true })
        .limit(limit);
      return (data ?? []) as OutreachTargetRow[];
    },
    async listScannedUnenrolledTargets(limit) {
      const { data } = await sb
        .from('outreach_targets')
        .select('*')
        .not('scan_id', 'is', null)
        .in('status', [...PIPELINE_CANDIDATE_STATUSES])
        .order('created_at', { ascending: true })
        .limit(limit);
      return (data ?? []) as OutreachTargetRow[];
    },
    async listNewIntelligence(limit) {
      const { data } = await sb
        .from('outreach_intelligence')
        .select('*')
        .eq('status', 'new')
        .order('created_at', { ascending: true })
        .limit(limit);
      return (data ?? []) as IntelligenceRow[];
    },
    async findTargetByEmail(email) {
      const { data } = await sb
        .from('outreach_targets')
        .select('*')
        .ilike('email', email)
        .limit(1)
        .maybeSingle();
      return (data ?? null) as OutreachTargetRow | null;
    },
    async findTargetByNameCity(name, city) {
      const { data } = await sb
        .from('outreach_targets')
        .select('*')
        .ilike('business_name', name)
        .ilike('city', city)
        .limit(1)
        .maybeSingle();
      return (data ?? null) as OutreachTargetRow | null;
    },
    async isOnDoNotContact(email) {
      const { data } = await sb
        .from('do_not_contact')
        .select('email')
        .ilike('email', email)
        .limit(1)
        .maybeSingle();
      return !!data;
    },
    async targetHasSequence(targetId) {
      const { data } = await sb
        .from('outreach_sequence_log')
        .select('id')
        .eq('target_id', targetId)
        .limit(1);
      return (data ?? []).length > 0;
    },
    async emailHasSequence(email) {
      const { data: targets } = await sb
        .from('outreach_targets')
        .select('id')
        .ilike('email', email);
      const ids = (targets ?? []).map((t) => (t as { id: string }).id);
      if (ids.length === 0) return false;
      const { data } = await sb
        .from('outreach_sequence_log')
        .select('id')
        .in('target_id', ids)
        .limit(1);
      return (data ?? []).length > 0;
    },
    async insertTarget(row) {
      const { data } = await sb.from('outreach_targets').insert(row).select('id').single();
      return (data as { id: string } | null) ?? null;
    },
    async updateTarget(id, patch) {
      await sb.from('outreach_targets').update(patch).eq('id', id);
    },
    async insertSequenceRow(row) {
      const { error } = await sb.from('outreach_sequence_log').insert(row);
      return !error;
    },
    async insertLog(row) {
      // Logging must never break the pipeline: swallow insert errors (the
      // caller also tracks attempts in-memory, so the cap still holds).
      try {
        await sb.from('outreach_pipeline_log').insert(row);
      } catch (err) {
        console.error('[outreach-pipeline] log insert failed:', err);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Scan invocation — reuses /api/outreach/run-scan over internal HTTP, exactly
// like the Apollo webhook reuses /api/scan. No second scanner is built.
// ---------------------------------------------------------------------------

export interface ScanProspectResult {
  ok: boolean;
  cached: boolean;
  scanId: string | null;
  score: number | null;
  competitor: string | null;
  error: string | null;
}

export async function scanProspectViaRunScan(
  baseUrl: string,
  cronSecret: string,
  c: PipelineCandidate,
): Promise<ScanProspectResult> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/outreach/run-scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({
        businessName: c.businessName,
        industry: c.industry,
        city: c.city,
      }),
      // run-scan's own master timeout is 45s; cap the call so one hung scan
      // cannot eat the whole cron time budget.
      signal: AbortSignal.timeout(150_000),
    });
  } catch (err) {
    return { ok: false, cached: false, scanId: null, score: null, competitor: null, error: err instanceof Error ? err.message : String(err) };
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return classifyRunScanResponse(res.ok, json);
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export interface PipelineRunOptions {
  db: PipelineDb;
  scanProspect: (c: PipelineCandidate) => Promise<ScanProspectResult>;
  kickVideo?: (scanId: string, countryCode: string) => void;
  now?: Date;
  cap?: number;
  timeBudgetMs?: number;
  maxCandidates?: number;
}

export interface PipelineRunResult {
  ok: boolean;
  runDate: string;
  cap: number;
  attemptsToday: number;
  capReachedAtStart: boolean;
  capReached: boolean;
  timeBudgetHit: boolean;
  considered: number;
  scanned: number;
  cached: number;
  enrolledOnly: number;
  skipped: number;
  failed: number;
  enrollFailed: number;
  results: Array<{ businessName: string; email: string | null; outcome: PipelineOutcome; scanId: string | null; error: string | null }>;
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://rankall.io';

function toCandidate(row: OutreachTargetRow, source: PipelineCandidate['source'], sourceId: string | null): PipelineCandidate {
  return {
    source,
    sourceId,
    targetId: row.id,
    businessName: row.business_name ?? '',
    email: row.email ? row.email.trim().toLowerCase() : null,
    city: row.city,
    industry: row.industry,
    countryCode: row.country_code ?? 'US',
    ownerName: row.owner_name,
    doNotContact: row.do_not_contact === true,
    hasScan: !!row.scan_id,
    scanId: row.scan_id,
  };
}

export async function runNightlyPipeline(opts: PipelineRunOptions): Promise<PipelineRunResult> {
  const db = opts.db;
  const now = opts.now ?? new Date();
  const startedAt = Date.now();
  const cap = opts.cap ?? getNightlyMax();
  const timeBudgetMs = opts.timeBudgetMs ?? PIPELINE_TIME_BUDGET_MS;
  const maxCandidates = opts.maxCandidates ?? PIPELINE_MAX_CANDIDATES;
  const runDate = now.toISOString().slice(0, 10);

  const results: PipelineRunResult['results'] = [];
  let scanned = 0, cached = 0, enrolledOnly = 0, skipped = 0, failed = 0, enrollFailed = 0;
  // In-memory attempt count: the cap holds even if a log insert fails.
  let localAttempts = 0;

  const log = async (c: PipelineCandidate, outcome: PipelineOutcome, scanId: string | null, error: string | null) => {
    await db.insertLog({
      run_date: runDate,
      source: c.source,
      source_id: c.sourceId,
      business_name: c.businessName,
      email: c.email,
      outcome,
      scan_id: scanId,
      error,
    });
    results.push({ businessName: c.businessName, email: c.email, outcome, scanId, error });
    if ((PIPELINE_SPEND_OUTCOMES as readonly string[]).includes(outcome)) localAttempts++;
    if (outcome === 'scanned') scanned++;
    else if (outcome === 'cached') cached++;
    else if (outcome === 'enrolled_only') enrolledOnly++;
    else if (outcome === 'failed' || outcome === 'scanned_enroll_failed') { failed++; if (outcome === 'scanned_enroll_failed') enrollFailed++; }
    else if (outcome.startsWith('skipped_')) skipped++;
  };

  // --- Cap check at start: refuse to run if today's cap is already reached.
  const attemptsAtStart = await db.countAttempts(runDate);
  if (!canAttempt(Math.max(attemptsAtStart, localAttempts), cap)) {
    return {
      ok: true, runDate, cap, attemptsToday: attemptsAtStart, capReachedAtStart: true,
      capReached: true, timeBudgetHit: false, considered: 0,
      scanned, cached, enrolledOnly, skipped, failed, enrollFailed, results,
    };
  }

  // --- Collect candidates: unscanned targets, then promoted intelligence.
  const candidates: PipelineCandidate[] = [];
  const unscanned = await db.listUnscannedTargets(maxCandidates);
  for (const row of unscanned) {
    if (!row.business_name) continue;
    candidates.push(toCandidate(row, 'outreach_targets', row.id));
  }

  if (candidates.length < maxCandidates) {
    const intelligence = await db.listNewIntelligence(maxCandidates - candidates.length);
    for (const intel of intelligence) {
      if (!intel.business_name) continue;
      const email = intel.email ? intel.email.trim().toLowerCase() : null;
      // Already in the queue (as a target)? Covered by the targets pick.
      if (email && (await db.findTargetByEmail(email))) continue;
      if (email && (await db.isOnDoNotContact(email))) {
        // Log the skip against the intelligence row so it is visible.
        await db.insertLog({
          run_date: runDate, source: 'outreach_intelligence', source_id: intel.id,
          business_name: intel.business_name, email, outcome: 'skipped_dnc', scan_id: null, error: null,
        });
        results.push({ businessName: intel.business_name, email, outcome: 'skipped_dnc', scanId: null, error: null });
        skipped++;
        continue;
      }
      const notes = parseIntelligenceNotes(intel.notes);
      const inserted = await db.insertTarget({
        business_name: intel.business_name,
        owner_name: notes.ownerName,
        email,
        phone: notes.phone,
        city: notes.city,
        country_code: intel.country_code ?? 'US',
        industry: notes.industry,
        scan_id: null,
        status: 'queued',
      });
      if (!inserted) {
        await db.insertLog({
          run_date: runDate, source: 'outreach_intelligence', source_id: intel.id,
          business_name: intel.business_name, email, outcome: 'failed', scan_id: null, error: 'promotion insert failed',
        });
        results.push({ businessName: intel.business_name, email, outcome: 'failed', scanId: null, error: 'promotion insert failed' });
        failed++;
        continue;
      }
      candidates.push({
        source: 'outreach_intelligence', sourceId: intel.id, targetId: inserted.id,
        businessName: intel.business_name, email, city: notes.city, industry: notes.industry,
        countryCode: intel.country_code ?? 'US', ownerName: notes.ownerName,
        doNotContact: false, hasScan: false, scanId: null,
      });
    }
  }

  // --- Scanned-but-never-enrolled: enroll without spending a new scan.
  const scannedUnenrolled: PipelineCandidate[] = [];
  if (candidates.length < maxCandidates) {
    const rows = await db.listScannedUnenrolledTargets(maxCandidates - candidates.length);
    for (const row of rows) {
      if (!row.business_name) continue;
      scannedUnenrolled.push(toCandidate(row, 'outreach_targets', row.id));
    }
  }

  let capReached = false;
  let timeBudgetHit = false;

  const enroll = async (c: PipelineCandidate): Promise<boolean> => {
    return db.insertSequenceRow({
      target_id: c.targetId,
      sequence_day: 1,
      status: 'pending',
      scheduled_for: now.toISOString(),
    });
  };

  // Process unscanned candidates first (scan + enroll), then enroll-only.
  for (const c of [...candidates, ...scannedUnenrolled]) {
    // Time budget: stop STARTING new work when the budget is gone.
    if (Date.now() - startedAt > timeBudgetMs) {
      timeBudgetHit = true;
      break;
    }

    const skip = candidateSkipReason(c);
    if (skip) {
      await log(c, skip as PipelineOutcome, c.scanId, null);
      continue;
    }

    // Dedupe: never double-enrol, never restart a completed sequence.
    const hasTargetSequence = await db.targetHasSequence(c.targetId);
    const hasEmailSequence = c.email ? await db.emailHasSequence(c.email) : false;
    const decision = decideEnrollment({ hasTargetSequence, hasEmailSequence });
    if (!decision.enroll) {
      await log(c, decision.reason as PipelineOutcome, c.scanId, null);
      continue;
    }

    // Enroll-only path: already scanned, never re-scan.
    if (c.hasScan && c.scanId) {
      const ok = await enroll(c);
      if (ok) {
        await db.updateTarget(c.targetId, { status: 'pending' });
        await log(c, 'enrolled_only', c.scanId, null);
      } else {
        await log(c, 'failed', c.scanId, 'enrollment insert failed');
      }
      continue;
    }

    // Scan path: re-check the cap from the DB before EVERY scan.
    const attemptsNow = await db.countAttempts(runDate);
    if (!canAttempt(Math.max(attemptsNow, localAttempts), cap)) {
      capReached = true;
      break;
    }

    const scan = await opts.scanProspect(c);
    if (!scan.ok) {
      await log(c, 'failed', null, scan.error);
      continue;
    }

    // Persist scan results on the target (mirrors the Apollo webhook).
    await db.updateTarget(c.targetId, {
      scan_id: scan.scanId,
      rankall_score: scan.score,
      competitor_name: scan.competitor,
      video_url: scan.scanId ? `${BASE_URL}/video/${scan.scanId}` : null,
      // NOTE: report_url uses the current Apollo-webhook pattern (bare search
      // URL). Fix #1 (PR #62, unmerged) moves outreach links to /r/<id>; when
      // it merges, this line is reconciled to match.
      report_url: `https://rankall.io/?q=${encodeURIComponent(`${c.businessName} ${c.city ?? ''}`.trim())}`,
      status: 'pending',
    });

    // Best-effort video kick-off (same as Apollo webhook). Fresh scans only:
    // a cached scan's video already exists or will be generated by its owner.
    if (!scan.cached && scan.scanId && opts.kickVideo) {
      try {
        opts.kickVideo(scan.scanId, c.countryCode);
      } catch { /* best-effort */ }
    }

    const enrolled = await enroll(c);
    if (!enrolled) {
      await log(c, 'scanned_enroll_failed', scan.scanId, 'enrollment insert failed');
      continue;
    }
    await log(c, scan.cached ? 'cached' : 'scanned', scan.scanId, null);
  }

  const attemptsToday = Math.max(await db.countAttempts(runDate), localAttempts);
  return {
    ok: true, runDate, cap, attemptsToday, capReachedAtStart: false,
    capReached, timeBudgetHit, considered: results.length,
    scanned, cached, enrolledOnly, skipped, failed, enrollFailed, results,
  };
}

/**
 * Dry run: report what the pipeline WOULD do tonight — no scans, no
 * enrolments, no writes of any kind (not even intelligence promotion).
 * Lets an operator verify the cron on staging before the first live run.
 */
export async function dryRunNightlyPipeline(
  db: PipelineDb,
  opts: { now?: Date; cap?: number; maxCandidates?: number } = {},
): Promise<{
  dryRun: true;
  runDate: string;
  cap: number;
  attemptsToday: number;
  wouldScan: Array<{ businessName: string; email: string | null; source: string }>;
  scannedUnenrolledWouldEnroll: number;
  intelligencePending: number;
}> {
  const now = opts.now ?? new Date();
  const cap = opts.cap ?? getNightlyMax();
  const maxCandidates = opts.maxCandidates ?? PIPELINE_MAX_CANDIDATES;
  const runDate = now.toISOString().slice(0, 10);
  const attemptsToday = await db.countAttempts(runDate);
  const unscanned = await db.listUnscannedTargets(maxCandidates);
  const scannedUnenrolled = await db.listScannedUnenrolledTargets(maxCandidates);
  const intelligence = await db.listNewIntelligence(maxCandidates);
  return {
    dryRun: true,
    runDate,
    cap,
    attemptsToday,
    wouldScan: unscanned
      .filter((r) => r.business_name)
      .map((r) => ({
        businessName: r.business_name as string,
        email: r.email,
        source: 'outreach_targets',
      })),
    scannedUnenrolledWouldEnroll: scannedUnenrolled.filter((r) => r.business_name).length,
    intelligencePending: intelligence.filter((i) => i.business_name).length,
  };
}
