import { NextRequest, NextResponse, after } from 'next/server';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getSupabaseAdmin } from '@/lib/supabase';
import { isScanId } from '@/lib/reportPayload';
import {
  sanitizeScanInput, runVideoPipeline, PipelineError, SparkRetryPending,
  pollRenderUntilDone, RenderPending, createHeygenRenderPoller,
  getHeygenWalletBalance, isHeygenFetchEnabled,
  type PlatformFinding, type PipelineResult, type PipelineCheckpoints,
  type ResumeStages, type ScanVideoInput,
} from '@/lib/video';
import {
  getJobStore, StoreUnavailable,
  type JobProgress,
} from '@/lib/video/jobStore';
import { parseVideoAvatarId, voiceIdForAvatarId } from '@/lib/video/avatar';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Hackathon video-report pipeline route — Meta Global AI Developer Hackathon.
// POST /api/hackathon/video-report
//   Body: { scanId: string } (loads aggregates from the DB) or
//         { scanJson: object } (direct aggregates, CLI parity + demos).
//   Optional avatarId: one of the allowed presenter ids in
//   lib/video/avatar.ts (absent = Dante default). An unknown or rejected
//   id is a 400 before any job is created, so no spend can follow it.
//   Runs the Days 2–3 pipeline ASYNCHRONOUSLY: POST returns 202 with a
//   jobId immediately (a full run takes minutes — Spark + TTS + HeyGen
//   render cannot fit in one request), and GET ?jobId= reports status.
//   Gated by HACKATHON_VIDEO_REPORT_ENABLED=1 — 404s when the flag is off.
//
// Job state lives in Supabase (table `video_jobs`, see
// lib/video/jobStore.ts and supabase/migrations/20261027034157_video_jobs.sql),
// NOT in module memory: the old per-instance Map lost jobs when Vercel
// routed polls to a different instance (proven Oct 26: first poll
// "processing", then 7 consecutive 404 "Job not found"). listVideoJobs()
// exposes the durable store to the jobs dashboard
// (app/hackathon/video-report/jobs) and the jobs API
// (app/api/hackathon/video-report/jobs). If the store is unavailable
// (migration not run yet, keys wrong, Supabase down), POST/GET answer an
// explicit 503 'job_store_unavailable' instead of accepting jobs that
// cannot be tracked — a visible error beats invisible job loss. Local
// `next dev` without Supabase env keeps the old Map behavior, local-only,
// with a loud warning; the preview path never uses it.
//
// Job survival (slice 3, now durable; checkpointed-pipeline slice, Oct 26):
// POST schedules the pipeline with Next.js after(), so the invocation
// survives the 202 response instead of freezing the moment it is sent
// (the old floating promise). after() still runs inside the route's
// maxDuration (60s here), so one invocation cannot cover a ~8-minute
// render OR the early stages: every stage checkpoints into the
// video_jobs row's resume_context (script text, director report,
// narration audio-asset reference, renderId), and a later delivery-page
// poll (GET ?jobId=) re-enters the pipeline at the NEXT stage after the
// last checkpoint — script/director/narration outputs are reused
// verbatim, a renderId is only re-polled, a narration assetId creates
// the video without re-narration. A render whose waiter went quiet gets
// a fresh bounded wait loop for the same renderId; a pre-render job
// whose worker died gets a fresh continuation invocation. GET never
// serializes resume_context — the job record it returns keeps exactly the
// fields it always had (jobId, status, createdAt, scanId, businessName,
// result, error, failedStage).
//
// Stall watchdog: a processing job with no checkpoint progress for over
// 10 minutes and no live waiter/render is failed honestly with its last
// incomplete stage — no zombie 'processing' jobs. A live render is never
// watchdog-failed (HeyGen is checked first).
//
// Honest limits, still true after this slice: (1) claims are soft
// (best-effort read-modify-write, not atomic) — two polls can both
// schedule a continuation in the same window, but stage re-entry is
// idempotent so the duplicate is cost-free (worst case it re-checks
// render status; see continueJob's race note). (2) The wallet-balance
// spend figure on resume stays null on Vercel (balance check is
// exec-based). (3) Narration reuses only with a v3 audio assetId; v2
// pollers (local CLI only, sunsets Oct 31) re-narrate on resume.
//
// Privacy: platform response_text never enters the pipeline — the DB path
// never selects it, and the scanJson path passes through
// sanitizeScanInput(), which strips it even when present.

const NO_STORE = { 'Cache-Control': 'private, no-store' };

function flagOn(): boolean {
  return process.env.HACKATHON_VIDEO_REPORT_ENABLED === '1';
}

interface ScanRow {
  id: string;
  user_business_name?: string | null;
  input?: string | null;
  industry?: string | null;
  location?: string | null;
  overall_score?: number | null;
  competitor_name?: string | null;
  mentioned_count?: number | null;
}

interface PlatformRow {
  platform: string;
  score: number;
  mentioned: boolean;
  sentiment?: 'positive' | 'neutral' | 'negative';
  /** Real column name is rank_position (there is NO `rank` column). */
  rank_position?: number | null;
}

type JobStatus = 'processing' | 'complete' | 'failed';

export interface JobRecord {
  jobId: string;
  status: JobStatus;
  createdAt: string;
  /** Scan this job renders (scanId path only; scanJson jobs have none). */
  scanId?: string;
  /** Display label from the sanitized scan input (never invented). */
  businessName?: string;
  result?: {
    videoUrl: string | null;
    heygenVideoId: string;
    avatarId: string;
    scriptSource: string;
    costs: PipelineResult['costs'];
    warnings: string[];
    stages: PipelineResult['stages'];
    totalLatencyMs: number;
  };
  error?: string;
  failedStage?: string;
}

/** Jobs dashboard + jobs API read path: newest first, from the durable store. */
export async function listVideoJobs(): Promise<JobRecord[]> {
  return getJobStore().list();
}

// ── Render survival bookkeeping (internal only — never serialized) ─────
// Kept in the video_jobs row's resume_context (see lib/video/jobStore.ts),
// NOT in a module Map: a resume stored only on the creating instance
// would not fix the bug. A job's render progress lives there from the
// moment stage 5 starts (onRenderStarted) until the job completes/fails,
// and GET ?jobId= returns exactly the JobRecord fields it always has.
type RenderProgress = JobProgress;

/**
 * One bounded render-wait loop fits inside the route's maxDuration (60s)
 * with headroom for finalization. The delivery page polls every 15s, so
 * a 45s loop + 90s resume quiet window means a stalled render resumes
 * within ~2 minutes of its waiter going quiet, without resume storms.
 */
const RENDER_WAIT_BUDGET_MS = 45_000;
const RENDER_RESUME_STALE_MS = 90_000;
const RENDER_POLL_INTERVAL_MS = 15_000;

/**
 * Stall watchdog: a processing job with no checkpoint progress for this
 * long is dead, not slow. 10 minutes exceeds a genuine HeyGen render
 * (~8 min) and every early stage by orders of magnitude (Spark/TTS take
 * seconds), so a job past this line with no live waiter and no live
 * render is failed honestly instead of left 'processing' forever.
 */
const STALL_MS = 10 * 60 * 1000;
/**
 * Claim staleness: one invocation lives at most maxDuration (60s), so a
 * waiter/continuation claim older than this is certainly dead (its
 * invocation is gone) and the next poll may take over.
 */
const CLAIM_STALE_MS = 120_000;

/** Pipeline stage names, in order (open-weights-review is instant/skipped). */
export type PipelineStageName = 'script' | 'director' | 'narration' | 'heygen-avatar';

/**
 * First stage with no reusable checkpoint: script (none), director (no
 * director fragment), narration (no fragment, or a fragment with no
 * assetId — a record, not a reuse token), else heygen-avatar (render
 * never started). Never null: a job always has a next stage.
 */
export function firstMissingStage(checkpoints?: PipelineCheckpoints): PipelineStageName {
  if (!checkpoints?.script) return 'script';
  if (!checkpoints?.director) return 'director';
  if (!checkpoints?.narration?.assetId) return 'narration';
  return 'heygen-avatar';
}

/**
 * True while some invocation is plausibly still working this job: a
 * waiter/continuation claim made recently, or a render check made
 * recently. Anything older is a dead invocation's leftover, not life.
 */
export function isClaimLive(progress: JobProgress, now: number): boolean {
  const waiterLive =
    progress.waiterActive === true &&
    now - (progress.waiterActiveSince ?? 0) < CLAIM_STALE_MS;
  const continuationLive =
    progress.continuationActive === true &&
    now - (progress.continuationSince ?? 0) < CLAIM_STALE_MS;
  const recentCheck = now - (progress.lastCheckAt ?? 0) < RENDER_RESUME_STALE_MS;
  return waiterLive || continuationLive || recentCheck;
}

/** Latest activity timestamp for a job (creation counts as activity). */
export function lastActivityAt(progress: JobProgress | null, createdAt: string): number {
  const created = new Date(createdAt).getTime() || 0;
  return Math.max(
    created,
    progress?.lastCheckpointAt ?? 0,
    progress?.lastCheckAt ?? 0,
    progress?.waiterActiveSince ?? 0,
    progress?.continuationSince ?? 0,
  );
}

/**
 * Stall assessment (pure): stalled when no checkpoint progress for over
 * STALL_MS and no live claim. The caller still checks HeyGen before
 * failing a job with a renderId — a live render is never watchdog-failed.
 */
export function assessStall(
  progress: JobProgress | null,
  createdAt: string,
  now: number,
): { stalled: boolean; failedStage?: PipelineStageName } {
  const baseline = progress?.lastCheckpointAt ?? (new Date(createdAt).getTime() || 0);
  if (now - baseline <= STALL_MS) return { stalled: false };
  if (progress && isClaimLive(progress, now)) return { stalled: false };
  return { stalled: true, failedStage: firstMissingStage(progress?.checkpoints) };
}

/** Plain-English stall errors, one per last-incomplete stage. */
export function stallErrorFor(stage: PipelineStageName): string {
  switch (stage) {
    case 'script':
      return 'The video job stalled before the script finished and did not resume.';
    case 'director':
      return 'The video job stalled during director review and did not resume.';
    case 'narration':
      return 'The video job stalled during narration and did not resume.';
    case 'heygen-avatar':
      return 'The video job stalled before the render started and did not resume.';
  }
}

/**
 * Build the pipeline's resume input from a stored progress blob. Only
 * reusable stages are passed: narration only with an assetId (see the
 * reuse rule in lib/video/jobStore.ts), render only with a renderId.
 */
export function buildResumeStages(progress: JobProgress | null): ResumeStages {
  const stages: ResumeStages = {};
  const cp = progress?.checkpoints;
  if (cp?.script) stages.script = cp.script;
  if (cp?.director) stages.director = cp.director;
  const n = cp?.narration;
  if (n?.assetId) {
    stages.narration = {
      assetId: n.assetId,
      characters: n.characters,
      voiceId: n.voiceId,
      voiceName: n.voiceName,
      warnings: n.warnings,
    };
  }
  if (progress?.renderId) {
    stages.render = {
      renderId: progress.renderId,
      avatarId: progress.avatarId ?? '',
      walletBeforeUsd: progress.walletBeforeUsd ?? null,
    };
  }
  return stages;
}

/**
 * True when a poll may schedule a pipeline continuation: no render to
 * resume (render jobs use the render-resume path), no live claim, quiet
 * for a full resume window (the previous invocation is certainly dead —
 * it lives at most 60s), and a resume input exists (stored checkpoints
 * or a scan row to reload). ScanJson jobs from before checkpoints
 * existed have neither and are left to the watchdog, honestly.
 */
export function shouldContinue(
  progress: JobProgress | null,
  job: { createdAt: string; scanId?: string },
  now: number,
): boolean {
  if (progress?.renderId) return false;
  if (progress && isClaimLive(progress, now)) return false;
  if (now - lastActivityAt(progress, job.createdAt) <= RENDER_RESUME_STALE_MS) return false;
  return Boolean(progress?.checkpoints?.input || job.scanId);
}

function failJob(record: JobRecord, err: unknown): void {
  record.status = 'failed';
  record.error = err instanceof Error ? err.message : String(err);
  if (err instanceof PipelineError) record.failedStage = err.stage;
  console.error('[hackathon/video-report] pipeline failed:', err);
}

function completeJobFromPipeline(record: JobRecord, result: PipelineResult): void {
  record.status = 'complete';
  record.result = {
    videoUrl: result.video.remoteVideoUrl,
    heygenVideoId: result.video.heygenVideoId,
    avatarId: result.video.avatarId,
    scriptSource: result.scriptSource,
    costs: result.costs,
    warnings: result.warnings,
    stages: result.stages,
    totalLatencyMs: result.totalLatencyMs,
  };
}

/**
 * Run the full pipeline for a job (called inside after()). RenderPending
 * is NOT a failure: the render is still going, the job stays 'processing',
 * and a later GET resumes it from the stored renderId.
 */
async function runJob(
  record: JobRecord,
  input: Parameters<typeof runVideoPipeline>[0],
  outDir: string,
  avatarId?: string,
): Promise<void> {
  const store = getJobStore();
  // Resume persistence never throws: a failed progress write must not
  // fail the render itself — the wait loop continues in this invocation,
  // and a stale resume only delays (never blocks) a later resume.
  const persistResume = (p: RenderProgress | null): Promise<void> =>
    store.saveResume(record.jobId, p).catch((err) => {
      console.error('[hackathon/video-report] resume persist failed (job continues):', err);
    });
  // Terminal persistence: a failed final write leaves the stored row
  // 'processing' (stall state) instead of the true outcome — loud, and
  // the only honest option left when the store itself is down.
  const persistTerminal = async () => {
    try {
      await store.save(record);
    } catch (err) {
      console.error('[hackathon/video-report] terminal job persist FAILED (stored row stays processing):', err);
    }
    void persistResume(null);
  };
  // Holder object, not a bare `let`: TypeScript narrows a closure-assigned
  // `let` to `never` after the try block (assignments inside callbacks are
  // invisible to control-flow analysis). Property access has no such trap.
  // Seeded with the POST-requested avatar: the checkpoint handlers below
  // MERGE into this blob, so a null seed would silently drop the avatar
  // the moment the first checkpoint (or a Spark retry) overwrote the
  // POST-time resume blob — which is exactly how the first distinct-
  // avatar run rendered Dante instead (Oct 27, 3 jobs). The seed keeps
  // the requested presenter in every blob this invocation writes, so a
  // pre-render continuation reads it back and still renders with it.
  const progressHolder: { current: RenderProgress | null } = {
    current: avatarId ? { avatarId } : null,
  };
  try {
    const result = await runVideoPipeline(input, {
      outDir,
      downloadLocal: false,
      renderWaitBudgetMs: RENDER_WAIT_BUDGET_MS,
      // Presenter: the POST-requested avatar, if any; absent means the
      // pipeline's Dante default. A resumed render keeps its ORIGINAL
      // avatar (pipeline prefers resume.render.avatarId), so this only
      // decides the first render, never overrides a started one.
      avatarId,
      // Narration voice, PAIRED to the avatar (Oct 27 fix, Oct 28
      // replacements): Abigail and Saoirse narrate with Bella
      // (female), Dante and Julian with Eric (male). Deriving it from the avatar — never leaving it at a
      // fixed default — is what prevents another female-face / male-
      // voice render. Absent avatar means the Dante default, hence Eric.
      voiceId: voiceIdForAvatarId(avatarId),
      // Checkpoint persistence (awaited by the pipeline): a stage's
      // checkpoint is durable before the next stage starts, so an
      // invocation that dies mid-pipeline never loses finished work.
      // A failed write only degrades resume (that stage redoes) — it
      // never fails the run, because persistResume never throws.
      onCheckpoint: async (checkpoints) => {
        progressHolder.current = {
          ...(progressHolder.current ?? {}),
          checkpoints,
          lastCheckpointAt: Date.now(),
        };
        await persistResume(progressHolder.current);
      },
      onRenderStarted: async (ctx) => {
        // MERGE, don't replace: replacing the blob would drop the
        // checkpoints written by stages 1–4. Awaited (see the pipeline's
        // onRenderStarted doc): the renderId must be durable before the
        // wait loop starts.
        progressHolder.current = {
          ...(progressHolder.current ?? {}),
          ...ctx,
          lastCheckAt: Date.now(),
          waiterActive: true,
          waiterActiveSince: Date.now(),
        };
        await persistResume(progressHolder.current);
      },
      onRenderCheck: () => {
        if (progressHolder.current) {
          progressHolder.current.lastCheckAt = Date.now();
          void persistResume(progressHolder.current);
        }
      },
    });
    completeJobFromPipeline(record, result);
  } catch (err) {
    if (progressHolder.current) progressHolder.current.waiterActive = false;
    if (err instanceof RenderPending) {
      // Render still going after this invocation's budget. Job stays
      // 'processing'; GET resumes it once the waiter has gone quiet.
      // Await the dead-waiter write so the quiet window starts now
      // instead of after the stale-active timeout.
      if (progressHolder.current) await persistResume(progressHolder.current);
      console.warn(
        `[hackathon/video-report] render ${err.renderId} pending after wait budget; job ${record.jobId} stays processing`,
      );
      return;
    }
    if (err instanceof SparkRetryPending) {
      // Spark empty with attempts remaining: NOT a failure. Persist the
      // incremented count + the input checkpoint (no stage checkpoint
      // exists yet — the script stage is first), so a later poll's
      // continuation retries Spark in its own 60s budget. Awaited, so
      // the quiet window — and the watchdog clock — start now.
      progressHolder.current = {
        ...(progressHolder.current ?? {}),
        checkpoints: progressHolder.current?.checkpoints ?? { input },
        sparkAttempts: err.attempts,
        lastCheckpointAt: Date.now(),
      };
      await persistResume(progressHolder.current);
      console.warn(
        `[hackathon/video-report] Spark empty (attempt ${err.attempts}); job ${record.jobId} stays processing for a cross-invocation retry`,
      );
      return;
    }
    failJob(record, err);
    await persistTerminal();
    return;
  }
  if (progressHolder.current) progressHolder.current.waiterActive = false;
  await persistTerminal();
}

/**
 * Resume a render whose waiter went quiet: attach a fresh bounded wait
 * loop for the stored renderId. On completion the job record is built
 * from the stored resume context + the finished video URL (costs use the
 * stored wallet-before and a fresh wallet-after; spend is null when
 * either is unmeasurable). On budget expiry the job stays 'processing'
 * for the next resume. Never throws — a failed resume just means the
 * next delivery-page poll tries again.
 */
async function resumeRender(jobId: string): Promise<void> {
  const store = getJobStore();
  let found: { job: JobRecord; resume: RenderProgress | null } | null;
  try {
    found = await store.get(jobId);
  } catch (err) {
    console.error('[hackathon/video-report] render resume load failed:', err);
    return;
  }
  // No renderId, no render to resume (a pre-render job goes through
  // continueJob, not this path).
  if (!found || found.job.status !== 'processing') return;
  const record = found.job;
  const progress = found.resume;
  if (!progress?.renderId) return;
  const renderId = progress.renderId;
  progress.waiterActive = true;
  progress.waiterActiveSince = Date.now();
  // Best-effort waiter claim (a failed claim just means the next poll
  // tries again); the wait loop itself must never throw.
  const persistResume = (p: RenderProgress | null): Promise<void> =>
    store.saveResume(jobId, p).catch((err) => {
      console.error('[hackathon/video-report] resume persist failed (resume continues):', err);
    });
  await persistResume(progress);
  let terminal = false;
  try {
    const poller = createHeygenRenderPoller();
    const final = await pollRenderUntilDone(poller, renderId, {
      intervalMs: RENDER_POLL_INTERVAL_MS,
      budgetMs: RENDER_WAIT_BUDGET_MS,
      onCheck: () => {
        progress.lastCheckAt = Date.now();
        void persistResume(progress);
      },
    });
    if (final.status === 'complete') {
      const walletAfter = await getHeygenWalletBalance().catch(() => null);
      const spent =
        progress.walletBeforeUsd != null && walletAfter != null
          ? Math.round((progress.walletBeforeUsd - walletAfter) * 100) / 100
          : null;
      record.status = 'complete';
      record.result = {
        videoUrl: final.videoUrl ?? null,
        heygenVideoId: renderId,
        avatarId: progress.avatarId ?? '',
        scriptSource: progress.scriptSource ?? '',
        costs: {
          heygenWalletBeforeUsd: progress.walletBeforeUsd ?? null,
          heygenWalletAfterUsd: walletAfter,
          heygenSpentUsd: spent,
          elevenlabsCharacters: progress.narration?.characters ?? 0,
          projectedTotalUsd: spent,
          budgetWarnUsd: 2,
          overBudget: spent != null && spent > 2,
        },
        warnings: [...(progress.warnings ?? []), 'Render completed after resume'],
        stages: [
          ...(progress.stages ?? []),
          {
            stage: 'heygen-avatar',
            status: 'ok',
            detail: 'render completed after resume',
            latencyMs: 0,
          },
        ],
        totalLatencyMs: Date.now() - new Date(record.createdAt).getTime(),
      };
      try {
        await store.save(record);
      } catch (err) {
        console.error('[hackathon/video-report] resumed terminal persist FAILED (stored row stays processing):', err);
      }
      void persistResume(null);
      terminal = true;
    } else if (final.status === 'failed') {
      record.status = 'failed';
      record.error = final.error ?? 'HeyGen render failed';
      record.failedStage = 'heygen-avatar';
      try {
        await store.save(record);
      } catch (err) {
        console.error('[hackathon/video-report] resumed terminal persist FAILED (stored row stays processing):', err);
      }
      void persistResume(null);
      terminal = true;
    }
    // 'processing' (budget out): leave the job processing; the next
    // quiet-window GET resumes it again.
  } catch (err) {
    console.error('[hackathon/video-report] render resume failed:', err);
  } finally {
    if (!terminal) {
      progress.waiterActive = false;
      await persistResume(progress);
    }
  }
}

/**
 * True when a processing job's render waiter is gone: either no waiter is
 * attached, or the attached waiter has been silent longer than one full
 * wait loop + headroom (a waiter that never returns is treated as dead,
 * so a lost after() callback cannot wedge the job forever).
 */
function shouldResume(progress: RenderProgress): boolean {
  const now = Date.now();
  const waiterDead =
    !progress.waiterActive ||
    now - (progress.waiterActiveSince ?? 0) > RENDER_WAIT_BUDGET_MS + 60_000;
  return waiterDead && now - (progress.lastCheckAt ?? 0) > RENDER_RESUME_STALE_MS;
}

/**
 * One HeyGen status read for the watchdog, bounded at 10s: a slow
 * provider must never stall a delivery-page poll for the full 60s fetch
 * timeout. 'unknown' means 'could not tell' — the watchdog never fails
 * a job on an unknown, only on a definite non-processing state.
 */
async function isRenderLive(
  renderId: string,
): Promise<'processing' | 'complete' | 'failed' | 'unknown'> {
  try {
    const check = await Promise.race([
      createHeygenRenderPoller().checkRender(renderId),
      new Promise<'unknown'>((resolve) => setTimeout(() => resolve('unknown'), 10_000)),
    ]);
    if (check === 'unknown') return 'unknown';
    return check.status;
  } catch {
    return 'unknown';
  }
}

/**
 * Continue a processing job from its last checkpoint (called inside
 * after() from a poll that found the job idle). Re-enters the pipeline
 * at the NEXT stage after the last checkpoint: stored outputs are reused
 * verbatim (script, director report, narration asset, renderId), so a
 * duplicate continuation is cost-free — worst case it re-checks render
 * status.
 *
 * Race honesty (read this before 'fixing' it): the continuation claim
 * below is a best-effort read-modify-write, NOT an atomic compare-and-
 * swap — PostgREST upsert cannot do one, and two polls on different
 * instances can both read 'no claim' in the same window and both
 * schedule. That is safe, not just unlikely: stage re-entry reuses
 * checkpoints, and the render-start step re-reads the row (via the
 * claim write) before starting, so the only duplicate spend needs two
 * continuations to both pass the claim window AND both reach
 * render-start before either persists its renderId — a narrow race,
 * bounded at one duplicate render, and the watchdog bounds the damage
 * further by failing jobs that never progress. A fully atomic claim
 * would need a dedicated claims table (a migration); the soft claim +
 * idempotent re-entry is the proportionate design for a hackathon
 * submission path, and this comment says so plainly.
 *
 * Never throws: a failed continuation just means the next poll tries
 * again (or the watchdog eventually fails the job honestly).
 */
async function continueJob(jobId: string): Promise<void> {
  const store = getJobStore();
  let found: { job: JobRecord; resume: RenderProgress | null } | null;
  try {
    found = await store.get(jobId);
  } catch (err) {
    console.error('[hackathon/video-report] continuation load failed:', err);
    return;
  }
  if (!found || found.job.status !== 'processing') return;
  const record = found.job;
  const progress: RenderProgress = found.resume ?? {};
  progress.continuationActive = true;
  progress.continuationSince = Date.now();
  try {
    await store.saveResume(jobId, progress);
  } catch (err) {
    console.error('[hackathon/video-report] continuation claim failed (next poll retries):', err);
    return;
  }
  const releaseClaim = async (): Promise<void> => {
    progress.continuationActive = false;
    await store.saveResume(jobId, progress).catch(() => {});
  };

  // Resume input: stored checkpoints first (exact input the job started
  // with), else reload aggregates for scanId jobs. ScanJson jobs from
  // before checkpoints existed have neither — fail honestly now instead
  // of leaving another zombie: no continuation can ever succeed.
  let input: ScanVideoInput | null = null;
  if (progress.checkpoints?.input) {
    input = progress.checkpoints.input;
  } else if (record.scanId) {
    try {
      input = sanitizeScanInput(await loadScanAggregates(record.scanId));
    } catch (err) {
      console.error('[hackathon/video-report] continuation input reload failed (next poll retries):', err);
      await releaseClaim();
      return;
    }
  } else {
    record.status = 'failed';
    record.failedStage = 'script';
    record.error = 'Cannot resume: the original scan input was not saved for this job.';
    try {
      await store.save(record);
    } catch (err) {
      console.error('[hackathon/video-report] continuation terminal persist FAILED:', err);
    }
    await store.saveResume(jobId, null).catch(() => {});
    return;
  }

  const resumeStages = buildResumeStages(progress);
  const outDir = join(tmpdir(), `rankall-video-${jobId}-resume-${Date.now()}`);
  try {
    const result = await runVideoPipeline(input, {
      outDir,
      downloadLocal: false,
      renderWaitBudgetMs: RENDER_WAIT_BUDGET_MS,
      resumeStages,
      // Presenter for a pre-render continuation: the avatar requested at
      // POST (stored in the resume blob at POST time), so a job whose
      // first invocation died before stage 5 still renders with its
      // requested presenter instead of falling back to Dante. A
      // resumed render ignores this (pipeline prefers its stored
      // render.avatarId), so this can never override a started render.
      avatarId: progress.avatarId,
      // Narration voice, PAIRED to the stored avatar (Oct 27 fix):
      // derived from progress.avatarId exactly as in runJob, so a
      // continuation that re-narrates (or narrates for the first time)
      // uses the same voice as the face — Bella for Abigail/Saoirse,
      // Eric for Dante/Julian/default.
      voiceId: voiceIdForAvatarId(progress.avatarId),
      // Cross-invocation Spark retries (Day 7): the stored count rides
      // in, the pipeline throws SparkRetryPending while attempts remain.
      sparkAttempts: progress.sparkAttempts ?? 0,
      onCheckpoint: async (checkpoints) => {
        progress.checkpoints = checkpoints;
        progress.lastCheckpointAt = Date.now();
        await store.saveResume(jobId, progress).catch((err) => {
          console.error('[hackathon/video-report] continuation checkpoint failed (stage will redo):', err);
        });
      },
      onRenderStarted: async (ctx) => {
        Object.assign(progress, ctx, {
          lastCheckAt: Date.now(),
          waiterActive: true,
          waiterActiveSince: Date.now(),
        });
        await store.saveResume(jobId, progress).catch((err) => {
          console.error('[hackathon/video-report] continuation render-start persist failed:', err);
        });
      },
      onRenderCheck: () => {
        progress.lastCheckAt = Date.now();
        void store.saveResume(jobId, progress).catch(() => {});
      },
    });
    completeJobFromPipeline(record, result);
    // Honest total: wall time since creation, not just this invocation.
    if (record.result) {
      record.result.totalLatencyMs = Date.now() - new Date(record.createdAt).getTime();
    }
    try {
      await store.save(record);
    } catch (err) {
      console.error('[hackathon/video-report] continuation terminal persist FAILED (stored row stays processing):', err);
    }
    await store.saveResume(jobId, null).catch(() => {});
  } catch (err) {
    if (err instanceof RenderPending) {
      // Render still going: the render-resume path owns it from here.
      // Mark the waiter inactive so the quiet window starts now.
      progress.waiterActive = false;
      await releaseClaim();
      return;
    }
    if (err instanceof SparkRetryPending) {
      // Spark empty with attempts remaining: NOT a failure. Store the
      // incremented count and refresh the watchdog clock; the job stays
      // 'processing' and a later poll retries Spark. The input
      // checkpoint is already in this progress blob (continuation
      // rebuilt its input from it), so nothing else needs saving.
      progress.sparkAttempts = err.attempts;
      progress.lastCheckpointAt = Date.now();
      await releaseClaim();
      return;
    }
    failJob(record, err);
    try {
      await store.save(record);
    } catch (err) {
      console.error('[hackathon/video-report] continuation terminal persist FAILED (stored row stays processing):', err);
    }
    await store.saveResume(jobId, null).catch(() => {});
  }
}

/** Loads the scan aggregates a video job renders from. Exported for tests. */
export async function loadScanAggregates(scanId: string): Promise<Record<string, unknown>> {
  const admin = getSupabaseAdmin();
  const { data: scanRow, error: scanError } = await admin
    .from('rankall_scans')
    .select('id, user_business_name, input, industry, location, overall_score, competitor_name, mentioned_count')
    .eq('id', scanId)
    .maybeSingle();
  if (scanError) {
    console.error('[hackathon/video-report] scan load error:', scanError);
    throw new Error('Load failed');
  }
  const scan = scanRow as ScanRow | null;
  if (!scan) throw new Error('Not found');

  // NOTE: the column is rank_position. There is NO `rank` column on this
  // table, and PostgREST resolves a bare `rank` in select to the
  // ordered-set aggregate rank() → error 42809 "WITHIN GROUP is
  // required". The old code selected `rank`, the error was logged and
  // swallowed, and the pipeline proceeded with ZERO platforms — a
  // silently degraded video. Never select a bare `rank` here.
  const { data: platformRows, error: platError } = await admin
    .from('rankall_platform_results')
    .select('platform, score, mentioned, sentiment, rank_position')
    .eq('scan_id', scanId)
    .order('score', { ascending: false });
  if (platError) {
    // Fail LOUD (hackathon follow-up, Oct 27): a platform-load error must
    // fail the job, never render a video from zero platforms. The old
    // code logged and swallowed it, and the pipeline proceeded with
    // platforms: [] — a silently degraded video. A failed job shows the
    // player retry state; a degraded video looks finished. (An EMPTY
    // platform list with no error still proceeds as before — only real
    // load errors throw.)
    console.error('[hackathon/video-report] platform results load error:', platError);
    throw new Error('Platform results load failed');
  }
  const platforms: PlatformFinding[] = ((platformRows ?? []) as PlatformRow[]).map((r) => ({
    platform: r.platform,
    score: r.score ?? 0,
    mentioned: Boolean(r.mentioned),
    sentiment: r.sentiment ?? 'neutral',
    rank: r.rank_position ?? null,
  }));

  return {
    businessName: scan.user_business_name || scan.input || 'your business',
    industry: scan.industry ?? null,
    location: scan.location ?? null,
    overallScore: scan.overall_score ?? null,
    mentionedCount: scan.mentioned_count ?? platforms.filter((p) => p.mentioned).length,
    totalPlatforms: platforms.length || null,
    competitorName: scan.competitor_name ?? null,
    platforms,
  };
}

export async function POST(req: NextRequest) {
  if (!flagOn()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  }

  let body: { scanId?: unknown; scanJson?: unknown; avatarId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: NO_STORE });
  }

  // Presenter validation FIRST, before any job is created or any scan
  // is loaded: an invalid avatarId is a 400 with no job and no spend.
  let avatarId: string | undefined;
  try {
    avatarId = parseVideoAvatarId(body.avatarId);
  } catch {
    return NextResponse.json(
      { error: 'avatarId must be one of the allowed presenter ids' },
      { status: 400, headers: NO_STORE },
    );
  }

  let raw: Record<string, unknown>;
  try {
    if (typeof body.scanId === 'string' && body.scanId) {
      if (!isScanId(body.scanId)) {
        return NextResponse.json({ error: 'scanId is required' }, { status: 400, headers: NO_STORE });
      }
      raw = await loadScanAggregates(body.scanId);
    } else if (body.scanJson !== undefined) {
      raw = body.scanJson as Record<string, unknown>;
    } else {
      return NextResponse.json(
        { error: 'Provide scanId or scanJson' },
        { status: 400, headers: NO_STORE },
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Load failed';
    const status = message === 'Not found' ? 404 : 500;
    return NextResponse.json({ error: message }, { status, headers: NO_STORE });
  }

  let input;
  try {
    input = sanitizeScanInput(raw);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid scan input' },
      { status: 400, headers: NO_STORE },
    );
  }

  const jobId = `job_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const record: JobRecord = {
    jobId,
    status: 'processing',
    createdAt: new Date().toISOString(),
    // scanId path only: scanJson jobs render an ad-hoc input with no scan row.
    ...(typeof body.scanId === 'string' && body.scanId ? { scanId: body.scanId } : {}),
    businessName: input.businessName,
  };
  // The job must exist in the durable store BEFORE the 202 is sent: a
  // job the polls can never find is worse than a visible 503 here.
  try {
    await getJobStore().create(record);
  } catch (err) {
    if (err instanceof StoreUnavailable) {
      return NextResponse.json({ error: 'job_store_unavailable' }, { status: 503, headers: NO_STORE });
    }
    console.error('[hackathon/video-report] job create failed:', err);
    return NextResponse.json({ error: 'Job store error' }, { status: 500, headers: NO_STORE });
  }

  // The resume input is checkpointed BEFORE the 202: a job whose
  // invocation dies during stage 1 still resumes from stage 1 with the
  // exact sanitized input it started with (scanJson jobs have no scan
  // row to reload from). Best-effort: a failed write only degrades
  // resume (scanId jobs reload aggregates); the job itself still runs.
  try {
    await getJobStore().saveResume(jobId, {
      checkpoints: { input },
      lastCheckpointAt: Date.now(),
      // Same presenter, in the resume blob, for a pre-render
      // continuation: the job record's columns do not carry a
      // pre-render avatar (avatar_id is only written with a completed
      // result), so the resume blob is the durable place for it.
      ...(avatarId ? { avatarId } : {}),
    });
  } catch (err) {
    console.error('[hackathon/video-report] input checkpoint failed (job continues; resume degraded):', err);
  }

  // Run after the 202 is sent (Next.js after() keeps the invocation alive
  // via waitUntil instead of freezing it the moment the response goes
  // out, as the old floating promise did). The try/catch is a last resort
  // for runtimes without after() support: a floating promise is worse
  // than after(), but a job that never runs is worse than both.
  const outDir = join(tmpdir(), `rankall-video-${jobId}`);
  try {
    after(() => runJob(record, input, outDir, avatarId));
  } catch (err) {
    console.error('[hackathon/video-report] after() unavailable, falling back to floating promise:', err);
    void runJob(record, input, outDir, avatarId);
  }

  return NextResponse.json(
    { jobId, status: 'processing', pipeline: isHeygenFetchEnabled() ? 'heygen-audio-v3' : 'heygen-audio-v2' },
    { status: 202, headers: NO_STORE },
  );
}

// GET: health check (no jobId) or job status (?jobId=...).
export async function GET(req: NextRequest) {
  if (!flagOn()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
  }
  const jobId = req.nextUrl.searchParams.get('jobId');
  if (jobId) {
    let found: { job: JobRecord; resume: RenderProgress | null } | null;
    try {
      found = await getJobStore().get(jobId);
    } catch (err) {
      if (err instanceof StoreUnavailable) {
        return NextResponse.json({ error: 'job_store_unavailable' }, { status: 503, headers: NO_STORE });
      }
      console.error('[hackathon/video-report] job read failed:', err);
      return NextResponse.json({ error: 'Job store error' }, { status: 500, headers: NO_STORE });
    }
    if (!found) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404, headers: NO_STORE });
    }
    const record = found.job;
    if (record.status === 'processing') {
      const progress = found.resume;
      // 1. Stall watchdog: a job with no checkpoint progress for over
      //    10 minutes and no live waiter/render is a zombie — fail it
      //    honestly with its last incomplete stage instead of leaving
      //    'processing' forever. A job WITH a renderId checks HeyGen
      //    first: a live render is never watchdog-failed, and a failed
      //    status check never fails the job by itself ('unknown').
      const assessment = assessStall(progress, record.createdAt, Date.now());
      if (assessment.stalled) {
        if (progress?.renderId) {
          const live = await isRenderLive(progress.renderId);
          if (live === 'failed') {
            record.status = 'failed';
            record.failedStage = 'heygen-avatar';
            record.error = 'HeyGen render failed (found by stall check).';
            try {
              await getJobStore().save(record);
            } catch (err) {
              console.error('[hackathon/video-report] watchdog terminal persist FAILED:', err);
            }
            await getJobStore().saveResume(jobId, null).catch(() => {});
            return NextResponse.json(record, { headers: NO_STORE });
          }
          // 'processing' → fall through to the render-resume path.
          // 'complete'/'unknown' → leave processing; the render-resume
          // path finalizes a completed render on the next quiet poll.
        } else {
          const stage = assessment.failedStage ?? 'script';
          record.status = 'failed';
          record.failedStage = stage;
          record.error = stallErrorFor(stage);
          try {
            await getJobStore().save(record);
          } catch (err) {
            console.error('[hackathon/video-report] watchdog terminal persist FAILED:', err);
          }
          await getJobStore().saveResume(jobId, null).catch(() => {});
          return NextResponse.json(record, { headers: NO_STORE });
        }
      }
      // 2. Resume a quiet render: if this job is mid-render and its
      //    waiter has gone quiet, attach a fresh bounded wait loop after
      //    this response. The response itself still returns the current
      //    record immediately. The waiter claim is persisted BEFORE
      //    scheduling, so a second poll on any instance sees the live
      //    waiter instead of double-resuming.
      if (progress && progress.renderId && shouldResume(progress)) {
        progress.waiterActive = true;
        progress.waiterActiveSince = Date.now();
        try {
          await getJobStore().saveResume(jobId, progress);
          try {
            after(() => resumeRender(jobId));
          } catch (err) {
            progress.waiterActive = false;
            await getJobStore().saveResume(jobId, progress).catch(() => {});
            console.error('[hackathon/video-report] render resume scheduling failed:', err);
          }
        } catch (err) {
          console.error('[hackathon/video-report] render resume claim failed:', err);
        }
      } else if (shouldContinue(progress, record, Date.now())) {
        // 3. Continue an idle pre-render job from its last checkpoint.
        //    Same claim-before-schedule discipline as the render path:
        //    the claim is persisted BEFORE scheduling so a second poll
        //    on any instance sees the live continuation.
        const claim: RenderProgress = {
          ...(progress ?? {}),
          continuationActive: true,
          continuationSince: Date.now(),
        };
        try {
          await getJobStore().saveResume(jobId, claim);
          try {
            after(() => continueJob(jobId));
          } catch (err) {
            claim.continuationActive = false;
            await getJobStore().saveResume(jobId, claim).catch(() => {});
            console.error('[hackathon/video-report] continuation scheduling failed:', err);
          }
        } catch (err) {
          console.error('[hackathon/video-report] continuation claim failed:', err);
        }
      }
    }
    return NextResponse.json(record, { headers: NO_STORE });
  }
  return NextResponse.json(
    {
      enabled: true,
      pipeline: isHeygenFetchEnabled() ? 'heygen-audio-v3' : 'heygen-audio-v2',
      note: 'Credentials live in the vault (not env keys); run a job to verify end to end.',
    },
    { headers: NO_STORE },
  );
}
