// ── Supabase-backed video-job store ─────────────────────────────────────
// Why this exists: video-report jobs used to live in the API route's
// module memory, so a job accepted on one Vercel instance (202) vanished
// from later polls routed to other instances (proven Oct 26: first poll
// "processing", then 7 consecutive 404 "Job not found"). Job state must
// survive instance routing, so it lives in Supabase (table `video_jobs`,
// migration supabase/migrations/20261027034157_video_jobs.sql) instead.
//
// Selection rule (never silent): when the Supabase env vars are present
// (always true on the preview), ALL reads/writes go through Supabase.
// When they are absent (local `next dev` only), the old module-Map
// behavior stays — and the code says loudly that it is local-only. The
// preview path NEVER falls back to memory: if the Supabase store is
// unavailable (migration not run yet, keys wrong, Supabase down), every
// operation throws StoreUnavailable and the route answers an explicit,
// honest 503 'job_store_unavailable'. A visible error beats invisible
// job loss.
//
// Shape note: StoredJob deliberately mirrors the API route's JobRecord
// field-for-field (structural typing, no import — the route keeps its
// own JobRecord so its source-asserted fields stay put). The GET contract
// is unchanged: processing/complete/failed, failedStage, videoUrl, error,
// plus the fields the record always had. Resume context (slice 3's render
// progress) rides in the same row as jsonb, so a resume on ANY instance
// can rebuild the poller — a resume that only works on the creating
// instance would not fix the bug.
//
// Writes: save() upserts job columns ONLY (never resume_context);
// saveResume() upserts resume_context ONLY. PostgREST upsert updates only
// the columns present in the payload, so the two never clobber each other.
import { getSupabaseAdmin } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  PipelineCosts,
  PipelineStageResult,
  RenderStartedContext,
  PipelineCheckpoints,
} from './pipeline';

export type JobStatus = 'processing' | 'complete' | 'failed';

export interface StoredJobResult {
  videoUrl: string | null;
  heygenVideoId: string;
  avatarId: string;
  scriptSource: string;
  costs: PipelineCosts;
  warnings: string[];
  stages: PipelineStageResult[];
  totalLatencyMs: number;
}

/** Mirrors the route's JobRecord exactly (see shape note above). */
export interface StoredJob {
  jobId: string;
  status: JobStatus;
  createdAt: string;
  scanId?: string;
  businessName?: string;
  result?: StoredJobResult;
  error?: string;
  failedStage?: string;
}

/** Slice 3's render progress, persisted so any instance can resume it. */
export interface StoredRenderProgress extends RenderStartedContext {
  /** Last time any wait loop checked this render (ms epoch). */
  lastCheckAt: number;
  /** True while a wait loop is attached to this render right now. */
  waiterActive: boolean;
  /** When the current waiter attached (ms epoch); stale actives are dead. */
  waiterActiveSince: number;
}

/**
 * Per-stage checkpoints (checkpointed-pipeline slice, Oct 26): the durable
 * record of what the pipeline already finished, so a later invocation
 * re-enters AFTER the last checkpoint instead of redoing work. Lives in
 * the same video_jobs row's resume_context jsonb — no schema change.
 * Shape (from ./pipeline): input + one fragment per finished stage.
 * Reuse rule: a stage with a checkpoint is NEVER redone. Script text and
 * the director report are plain JSON, so they reuse exactly. Narration
 * reuses ONLY when an audio asset reference exists (v3 asset_id): the
 * audio bytes themselves died with the old instance and are never stored
 * in the row. A narration fragment without an assetId is a record, not a
 * reuse token — a resumed run re-narrates that stage (documented v2
 * limitation; v2 has no asset upload and sunsets Oct 31, and the preview
 * runs v3).
 */
export type { PipelineCheckpoints } from './pipeline';

/**
 * The progress blob stored in resume_context. It is EITHER a render
 * progress (slice 3's flat shape, render fields present once stage 5
 * starts) OR a checkpoints-only blob (a job that has not reached render
 * yet) OR both. Every field is optional because a job's blob grows as
 * the pipeline advances: creation writes only checkpoints.input, stage
 * checkpoints accumulate, render fields arrive at stage 5. Callers must
 * guard for absence — a missing field means 'not reached yet', never an
 * error. (Rows written by the 943cedb9 slice have the flat render shape
 * with no checkpoints field; they read back unchanged.)
 */
export interface JobProgress extends Partial<StoredRenderProgress> {
  checkpoints?: PipelineCheckpoints;
  /** Last time any stage checkpoint was written (ms epoch). */
  lastCheckpointAt?: number;
  /** True while a pipeline continuation is attached right now. */
  continuationActive?: boolean;
  /** When the current continuation attached (ms epoch); stale = dead. */
  continuationSince?: number;
  /**
   * Spark script attempts spent so far (Day 7 bounded cross-invocation
   * retries). Absent = 0. Persisted by the route when the script stage
   * throws SparkRetryPending; read back as the pipeline's sparkAttempts.
   */
  sparkAttempts?: number;
}

/** The store cannot be used at all (migration not run, keys wrong, down). */
export class StoreUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreUnavailable';
  }
}

export interface JobStore {
  create(job: StoredJob): Promise<void>;
  /** Null when no such job exists (route answers 404, not 503). */
  get(jobId: string): Promise<{ job: StoredJob; resume: JobProgress | null } | null>;
  /** Upserts job columns only; never touches resume_context. */
  save(job: StoredJob): Promise<void>;
  /** Upserts resume_context only; null clears it (terminal jobs).
   *
   * Postgres upsert gotcha (proven Oct 26, Vercel logs): an upsert
   * validates NOT NULL on the PROPOSED row even when the row already
   * exists, so this minimal payload fails if any NOT NULL column it
   * omits has no DEFAULT. video_jobs.status was exactly that case
   * until migration 20261027044800_video_jobs_status_default.sql added
   * DEFAULT 'processing'. NEVER "fix" a constraint error by adding job
   * columns here — that would break the save()/saveResume() column
   * separation; fix the schema default instead. */
  saveResume(jobId: string, progress: JobProgress | null): Promise<void>;
  /** Newest first, job records only (resume never serialized). */
  list(): Promise<StoredJob[]>;
}

const TABLE = 'video_jobs';

interface VideoJobRow {
  job_id: string;
  scan_id: string | null;
  business_name: string | null;
  status: string;
  video_url: string | null;
  heygen_video_id: string | null;
  avatar_id: string | null;
  script_source: string | null;
  error: string | null;
  failed_stage: string | null;
  stages: unknown;
  costs: unknown;
  warnings: unknown;
  total_latency_ms: number | null;
  resume_context: unknown;
  created_at: string;
  updated_at: string;
}

const ZERO_COSTS: PipelineCosts = {
  heygenWalletBeforeUsd: null,
  heygenWalletAfterUsd: null,
  heygenSpentUsd: null,
  elevenlabsCharacters: 0,
  projectedTotalUsd: null,
  budgetWarnUsd: 2,
  overBudget: false,
};

function rowToJob(row: VideoJobRow): StoredJob {
  const job: StoredJob = {
    jobId: row.job_id,
    status: row.status as JobStatus,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
  };
  if (row.scan_id) job.scanId = row.scan_id;
  if (row.business_name) job.businessName = row.business_name;
  if (row.status === 'complete') {
    job.result = {
      videoUrl: row.video_url ?? null,
      heygenVideoId: row.heygen_video_id ?? '',
      avatarId: row.avatar_id ?? '',
      scriptSource: row.script_source ?? '',
      costs: (row.costs as PipelineCosts | null) ?? ZERO_COSTS,
      warnings: Array.isArray(row.warnings) ? (row.warnings as string[]) : [],
      stages: Array.isArray(row.stages) ? (row.stages as PipelineStageResult[]) : [],
      totalLatencyMs: row.total_latency_ms ?? 0,
    };
  }
  if (row.error) job.error = row.error;
  if (row.failed_stage) job.failedStage = row.failed_stage;
  return job;
}

function rowToResume(row: VideoJobRow): JobProgress | null {
  const ctx = row.resume_context as Record<string, unknown> | null;
  if (!ctx || typeof ctx !== 'object') return null;
  // Any object blob is a progress blob: render-present rows (slice 3)
  // carry renderId at top level; pre-render rows carry only checkpoints.
  // Absent fields mean 'not reached yet' — callers guard for them.
  return ctx as unknown as JobProgress;
}

/** Job columns for create/save. Never includes resume_context. */
function jobColumns(job: StoredJob): Record<string, unknown> {
  const row: Record<string, unknown> = {
    job_id: job.jobId,
    status: job.status,
    created_at: job.createdAt,
    updated_at: new Date().toISOString(),
  };
  if (job.scanId !== undefined) row.scan_id = job.scanId;
  if (job.businessName !== undefined) row.business_name = job.businessName;
  if (job.result) {
    row.video_url = job.result.videoUrl;
    row.heygen_video_id = job.result.heygenVideoId;
    row.avatar_id = job.result.avatarId;
    row.script_source = job.result.scriptSource;
    row.stages = job.result.stages;
    row.costs = job.result.costs;
    row.warnings = job.result.warnings;
    row.total_latency_ms = job.result.totalLatencyMs;
  }
  if (job.error !== undefined) row.error = job.error;
  if (job.failedStage !== undefined) row.failed_stage = job.failedStage;
  return row;
}

interface PostgrestErrorLike {
  code?: string;
  message: string;
}

/**
 * Maps a PostgREST failure to either StoreUnavailable (the store cannot
 * be used: table missing because the migration has not run, schema-cache
 * mismatch, or unreachable) or a plain Error (a real failure in the
 * request itself, e.g. a constraint the code violated).
 */
function toStoreError(op: string, error: PostgrestErrorLike): Error {
  const code = error.code ?? '';
  const msg = error.message ?? '';
  if (
    code === 'PGRST205' ||
    code === '42P01' ||
    code === 'PGRST204' ||
    /could not find the table|relation .* does not exist|schema cache/i.test(msg)
  ) {
    return new StoreUnavailable(
      `video_jobs ${op}: store unavailable (migration not run?): ${msg}`,
    );
  }
  return new Error(`video_jobs ${op} failed: ${msg}`);
}

export function createSupabaseJobStore(client: SupabaseClient): JobStore {
  async function query<T>(
    op: string,
    fn: () => PromiseLike<{ data: T | null; error: PostgrestErrorLike | null }>,
  ): Promise<T | null> {
    let res: { data: T | null; error: PostgrestErrorLike | null };
    try {
      res = await fn();
    } catch (err) {
      // Thrown (not returned) failures are transport failures: unreachable.
      throw new StoreUnavailable(
        `video_jobs ${op} unreachable: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (res.error) throw toStoreError(op, res.error);
    return res.data;
  }

  return {
    async create(job: StoredJob): Promise<void> {
      await query('create', () =>
        client
          .from(TABLE)
          .upsert({ ...jobColumns(job), resume_context: null }, { onConflict: 'job_id' }),
      );
    },
    async get(jobId: string) {
      const row = await query<VideoJobRow>('get', () =>
        client.from(TABLE).select('*').eq('job_id', jobId).maybeSingle(),
      );
      if (!row) return null;
      return { job: rowToJob(row), resume: rowToResume(row) };
    },
    async save(job: StoredJob): Promise<void> {
      await query('save', () =>
        client.from(TABLE).upsert(jobColumns(job), { onConflict: 'job_id' }),
      );
    },
    async saveResume(jobId: string, progress: StoredRenderProgress | null): Promise<void> {
      await query('saveResume', () =>
        client.from(TABLE).upsert(
          {
            job_id: jobId,
            resume_context: progress,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'job_id' },
        ),
      );
    },
    async list(): Promise<StoredJob[]> {
      const rows = await query<VideoJobRow[]>('list', () =>
        client.from(TABLE).select('*').order('created_at', { ascending: false }),
      );
      return (rows ?? []).map(rowToJob);
    },
  };
}

/** Local-only store: same interface over module Maps (never the preview path). */
export function createMemoryJobStore(): JobStore {
  const jobs = new Map<string, StoredJob>();
  const resumes = new Map<string, JobProgress>();
  return {
    async create(job: StoredJob): Promise<void> {
      jobs.set(job.jobId, { ...job });
      resumes.delete(job.jobId);
    },
    async get(jobId: string) {
      const job = jobs.get(jobId);
      if (!job) return null;
      return { job: { ...job }, resume: resumes.get(jobId) ?? null };
    },
    async save(job: StoredJob): Promise<void> {
      jobs.set(job.jobId, { ...job });
    },
    async saveResume(jobId: string, progress: StoredRenderProgress | null): Promise<void> {
      if (progress) resumes.set(jobId, { ...progress });
      else resumes.delete(jobId);
    },
    async list(): Promise<StoredJob[]> {
      return [...jobs.values()]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((r) => ({ ...r }));
    },
  };
}

export function isSupabaseJobStoreConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

let cachedStore: JobStore | null = null;

/**
 * The store for this process. Supabase when the env vars are present
 * (always on the preview); otherwise the local-only memory store, with a
 * loud warning. Cached per module instance (env does not change at
 * runtime); tests construct stores directly instead of using this.
 */
export function getJobStore(): JobStore {
  if (!cachedStore) {
    if (isSupabaseJobStoreConfigured()) {
      cachedStore = createSupabaseJobStore(getSupabaseAdmin());
    } else {
      console.warn(
        '[hackathon/video-report] Supabase env absent — video jobs use ' +
          'LOCAL-ONLY in-memory storage. Never the preview path.',
      );
      cachedStore = createMemoryJobStore();
    }
  }
  return cachedStore;
}
