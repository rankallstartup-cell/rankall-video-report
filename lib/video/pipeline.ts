// ── Hackathon video-report pipeline: scan ID in, video out ─────────────
// Locked combo path (Day 1 verdict): Muse Spark 1.3 script → director
// review → ElevenLabs narration → HeyGen avatar video (external audio).
// Faceless (Meta scenes + narration) stays a proven fallback, but this
// pipeline renders the combo — the path Nandish approved as "perfect".
//
// Failure honesty: external calls retry on transient errors (2 retries,
// backoff). A stage that fails after retries FAILS THE RUN with the stage
// name + cause — except the script stage, which falls back to the
// rule-based script and says so in the report (the rule-based script is
// constructed from aggregates, so it passes the director by construction).
// No other silent fallbacks exist. Cost overruns warn loudly, they do not
// fail the run — a finished video with a warning beats a killed run.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { VideoScript } from './types';
import type { ScanVideoInput } from './script';
import { buildVideoScript } from './script';
import { reviewScript, type DirectorReport } from './director';
import { writeScriptWithSpark } from './sparkScript';
import {
  narrateWithElevenLabs, DEFAULT_ELEVENLABS_VOICE_ID,
  type NarrationResult,
} from './providers/elevenlabsNarration';
import {
  getHeygenWalletBalance, DEFAULT_HEYGEN_AVATAR_ID,
  createHeygenRenderPoller,
} from './providers/heygenAudioAvatar';
import {
  pollRenderUntilDone, RenderPending,
  type RenderCheck, type RenderPoller,
} from './renderPoller';
import { runOpenWeightsReview, type OpenWeightsReview } from './openWeights';

export interface PipelineStageResult {
  stage: string;
  status: 'ok' | 'fallback' | 'skipped' | 'failed';
  detail: string;
  latencyMs: number;
}

export interface PipelineCosts {
  heygenWalletBeforeUsd: number | null;
  heygenWalletAfterUsd: number | null;
  /** HeyGen wallet delta for this run (positive = spent). Null when unmeasurable. */
  heygenSpentUsd: number | null;
  elevenlabsCharacters: number;
  /** Best available total estimate. Null when HeyGen spend is unmeasurable. */
  projectedTotalUsd: number | null;
  budgetWarnUsd: number;
  overBudget: boolean;
}

export interface PipelineResult {
  businessName: string;
  script: VideoScript;
  scriptSource: 'spark' | 'rule-based-fallback';
  director: DirectorReport;
  openWeights: OpenWeightsReview;
  narration: { audioPath: string; characters: number; voiceId: string; voiceName: string | null };
  video: { localPath: string | null; remoteVideoUrl: string | null; heygenVideoId: string; avatarId: string };
  costs: PipelineCosts;
  stages: PipelineStageResult[];
  warnings: string[];
  totalLatencyMs: number;
  reportPath: string;
}

export interface PipelineOptions {
  outDir: string;
  avatarId?: string;
  voiceId?: string;
  /** Warn when projected cost exceeds this (USD). Default 2. */
  budgetWarnUsd?: number;
  /** Skip the local mp4 download (API-route runs use the remote URL only). */
  downloadLocal?: boolean;
  /** HeyGen poll budget per round, seconds. Default 300. */
  heygenWaitSeconds?: number;
  /**
   * Render provider for stage 5. Default: the HeyGen v2 poller. The
   * future HeyGen v3 stage plugs in here — same start/check interface.
   */
  renderPoller?: RenderPoller;
  /**
   * Max wall time for the stage-5 wait loop in THIS invocation. Null =
   * wait until terminal (CLI behavior). When the budget runs out with the
   * render still processing, stage 5 throws RenderPending (NOT a failure)
   * so the caller can resume the same renderId later. The API route sets
   * this under its maxDuration so a cut-off invocation never fails the job.
   */
  renderWaitBudgetMs?: number | null;
  /**
   * Called when stage 5 starts a render, with everything a later
   * invocation needs to finalize the job if it resumes this renderId
   * (stages so far, narration, script source, warnings, wallet-before).
   * The API route persists this in the job row's resume_context. AWAITED: the
   * render checkpoint must be durable before the wait loop starts, or
   * an invocation that dies mid-wait loses the renderId it just created.
   */
  onRenderStarted?: (ctx: RenderStartedContext) => void | Promise<void>;
  /** Called after every render status check (progress persistence). */
  onRenderCheck?: (check: RenderCheck) => void;
  /**
   * Stages a previous invocation already finished (from the job row's
   * checkpoints). A present stage is NEVER redone: its stored output is
   * reused and the stage result is recorded as 'reused checkpoint'.
   * Narration reuses only when an assetId is present AND the poller can
   * create from an asset — otherwise the stage re-runs (see stage 4).
   */
  resumeStages?: ResumeStages;
  /**
   * Called (awaited) after every freshly completed stage with the full
   * checkpoint set so far. The caller persists it; a later invocation
   * resumes from it. Awaited for the same reason as onRenderStarted: a
   * checkpoint that is not durable before the next stage starts is not
   * a checkpoint at all.
   */
  onCheckpoint?: (checkpoints: PipelineCheckpoints) => void | Promise<void>;
  /**
   * Spark script attempts already spent in prior invocations (0 for a
   * fresh job). The script stage throws SparkRetryPending instead of
   * falling back while attempts remain (see SPARK_MAX_ATTEMPTS).
   */
  sparkAttempts?: number;
  /** Total Spark script attempts allowed across invocations. Default 3. */
  sparkMaxAttempts?: number;
}

/**
 * One stage's durable output. The route stores these in the job row's
 * resume_context jsonb (see lib/video/jobStore.ts); no schema change.
 * Warnings snapshots keep earlier invocations' warnings in the final
 * record (e.g. 'used rule-based fallback'), not just the last run's.
 */
export interface CheckpointScript {
  script: VideoScript;
  scriptSource: 'spark' | 'rule-based-fallback';
  warnings: string[];
}

export interface CheckpointDirector {
  script: VideoScript;
  report: DirectorReport;
  scriptSource: 'spark' | 'rule-based-fallback';
  warnings: string[];
}

export interface CheckpointNarration {
  /**
   * v3 audio asset_id. Absent = NOT reusable: the audio bytes died with
   * the old instance and were never stored in the row (by design — rows
   * stay small). A resumed run re-narrates that stage when no assetId
   * exists (v2 pollers never produce one; v2 sunsets Oct 31).
   */
  assetId?: string;
  characters: number;
  voiceId: string;
  voiceName: string | null;
  warnings: string[];
}

/** The full checkpoint set: resume input + one fragment per finished stage. */
export interface PipelineCheckpoints {
  input: ScanVideoInput;
  script?: CheckpointScript;
  director?: CheckpointDirector;
  narration?: CheckpointNarration;
}

/** Stages a resuming invocation skips (stored outputs, reused verbatim). */
export interface ResumeStages {
  script?: CheckpointScript;
  director?: CheckpointDirector;
  narration?: CheckpointNarration;
  render?: { renderId: string; avatarId: string; walletBeforeUsd?: number | null };
}

/**
 * Snapshot a resuming invocation needs to complete a job whose render was
 * started earlier. Built by stage 5 before the wait loop; the route stores
 * it keyed by jobId and replays it when the render finishes on resume.
 */
export interface RenderStartedContext {
  renderId: string;
  avatarId: string;
  stages: PipelineStageResult[];
  narration: { characters: number; voiceId: string; voiceName: string | null };
  scriptSource: 'spark' | 'rule-based-fallback';
  warnings: string[];
  walletBeforeUsd: number | null;
}

export class PipelineError extends Error {
  readonly stage: string;
  constructor(stage: string, message: string) {
    super(`[${stage}] ${message}`);
    this.name = 'PipelineError';
    this.stage = stage;
  }
}

/**
 * Thrown by the script stage when Spark returned empty content and
 * attempts remain: NOT a failure. The caller persists `attempts` in the
 * job row and leaves the job 'processing'; a later invocation retries
 * Spark with the incremented count (bounded cross-invocation retries,
 * Day 7 — the batch proved Spark empties on 8/8 videos, so a single
 * attempt plus immediate fallback ships fallback scripts every time).
 * Like RenderPending, this must never reach failJob.
 */
export class SparkRetryPending extends Error {
  /** Total Spark script attempts spent so far, including this one. */
  readonly attempts: number;
  constructor(attempts: number) {
    super(`Spark script empty; retry pending (attempt ${attempts})`);
    this.name = 'SparkRetryPending';
    this.attempts = attempts;
  }
}

/** Total Spark script attempts allowed across invocations (initial + retries). */
export const SPARK_MAX_ATTEMPTS = 3;

/**
 * Pure retry decision for a failed script stage, exported for unit
 * tests. Retries ONLY empty-content failures (the known reasoning-token
 * gotcha — plausibly transient across invocations, since Tech Ridge's
 * Spark script succeeded once while Kinsler failed 12 straight first
 * attempts on one prompt); auth, quota, and other errors fall back
 * immediately instead of burning invocations. The message match runs on
 * the wrapped "[script] ..." text too, so callers need not unwrap.
 */
export function shouldRetrySparkScript(
  message: string,
  attemptsUsed: number,
  maxAttempts: number = SPARK_MAX_ATTEMPTS,
): { retry: boolean; attempts: number } {
  const attempts = attemptsUsed + 1;
  const retry = /empty content/i.test(message) && attempts < maxAttempts;
  return { retry, attempts };
}

/** Retry helper — exported for unit tests. Retries any error (see module doc). */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  backoffMs = 2000,
): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs * (attempt + 1)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function timed<T>(stage: string, fn: () => Promise<T>): Promise<{ value: T; result: PipelineStageResult }> {
  const started = Date.now();
  try {
    const value = await fn();
    return {
      value,
      result: { stage, status: 'ok', detail: '', latencyMs: Date.now() - started },
    };
  } catch (err) {
    throw new PipelineError(stage, err instanceof Error ? err.message : String(err));
  }
}

export async function runVideoPipeline(
  input: ScanVideoInput,
  options: PipelineOptions,
): Promise<PipelineResult> {
  const started = Date.now();
  const stages: PipelineStageResult[] = [];
  const resume = options.resumeStages;
  // Warnings resume from the latest stored fragment, so a resumed run's
  // final record keeps earlier invocations' warnings (not just its own).
  const warnings: string[] = [
    ...(resume?.narration?.warnings ??
      resume?.director?.warnings ??
      resume?.script?.warnings ??
      []),
  ];
  // The checkpoint set grows as stages finish; onCheckpoint persists it
  // (awaited) after every fresh stage. Reused fragments start in place.
  const checkpoints: PipelineCheckpoints = { input };
  if (resume?.script) checkpoints.script = resume.script;
  if (resume?.director) checkpoints.director = resume.director;
  if (resume?.narration) checkpoints.narration = resume.narration;
  const budgetWarnUsd = options.budgetWarnUsd ?? 2;
  const outDir = options.outDir;
  await mkdir(outDir, { recursive: true });

  // ── Stage 1: script (Spark, rule-based fallback, flagged) ─────────────
  // A checkpointed script is reused verbatim: no second Spark call, no
  // second chance for the script to change under the director's feet.
  let script: VideoScript;
  let scriptSource: 'spark' | 'rule-based-fallback' = 'spark';
  if (resume?.script) {
    script = resume.script.script;
    scriptSource = resume.script.scriptSource;
    stages.push({ stage: 'script', status: 'ok', detail: 'reused checkpoint', latencyMs: 0 });
  } else {
    // ONE Spark attempt in THIS invocation — no withRetry wrapper. The
    // old stack (withRetry(2) × writeScriptWithSpark's 2 attempts = up
    // to 6 Spark calls at 20–40s each) ran past the 60s Vercel function
    // limit on every Kinsler invocation (proven Oct 27 00:11–00:23 CDT)
    // and died BEFORE this catch could run, so the job stalled instead
    // of completing with the flagged fallback below. Retries happen
    // ACROSS invocations instead (Day 7): on empty content with
    // attempts remaining, the stage throws SparkRetryPending, the route
    // persists the incremented count, and a later poll retries Spark —
    // each attempt in its own 60s budget. Exhausted attempts (or any
    // non-empty failure) fall back immediately and honestly.
    try {
      const { value, result } = await timed('script', () => writeScriptWithSpark(input, [], 1));
      script = value;
      stages.push(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const decision = shouldRetrySparkScript(
        message,
        options.sparkAttempts ?? 0,
        options.sparkMaxAttempts ?? SPARK_MAX_ATTEMPTS,
      );
      if (decision.retry) {
        throw new SparkRetryPending(decision.attempts);
      }
      console.warn(`[pipeline] Spark script failed (${message}); falling back to rule-based script`);
      const fallbackStarted = Date.now();
      script = buildVideoScript(input);
      scriptSource = 'rule-based-fallback';
      stages.push({
        stage: 'script',
        status: 'fallback',
        detail: `Spark failed (${message}); used rule-based script`,
        latencyMs: Date.now() - fallbackStarted,
      });
      warnings.push(`Script used rule-based fallback: ${message}`);
    }
    checkpoints.script = { script, scriptSource, warnings: [...warnings] };
    await options.onCheckpoint?.(checkpoints);
  }

  // ── Stage 2: director review (+ one Spark repair round) ───────────────
  // A checkpointed director report is reused verbatim with its script:
  // the numbers were already verified against this scan, and re-running
  // review (or repair) could only disagree with the earlier verdict.
  const directorStarted = Date.now();
  let director: DirectorReport;
  if (resume?.director) {
    script = resume.director.script;
    scriptSource = resume.director.scriptSource;
    director = resume.director.report;
    stages.push({ stage: 'director', status: 'ok', detail: 'reused checkpoint', latencyMs: 0 });
  } else {
    director = reviewScript(script, input);
    if (!director.passed && scriptSource === 'spark') {
      console.warn(
        `[pipeline] director rejected the Spark draft (${director.issues.length} issues); one repair round`,
      );
      try {
        // ONE repair attempt only — same 60s rule as the script stage:
        // a stacked retry here would die at the function limit before
        // the fallback below could run.
        const repaired = await writeScriptWithSpark(
          input,
          director.issues.map((i) => `[${i.section}] ${i.message}`),
          1,
        );
        const repairedReport = reviewScript(repaired, input);
        if (repairedReport.passed) {
          script = repaired;
          director = repairedReport;
          stages.push({
            stage: 'director',
            status: 'ok',
            detail: 'draft rejected, repaired draft passed',
            latencyMs: Date.now() - directorStarted,
          });
        } else {
          throw new Error(
            `repaired draft still has ${repairedReport.issues.filter((i) => i.severity === 'error').length} errors`,
          );
        }
      } catch (repairErr) {
        const message = repairErr instanceof Error ? repairErr.message : String(repairErr);
        console.warn(`[pipeline] repair failed (${message}); falling back to rule-based script`);
        script = buildVideoScript(input);
        scriptSource = 'rule-based-fallback';
        director = reviewScript(script, input);
        stages.push({
          stage: 'director',
          status: 'fallback',
          detail: `repair failed (${message}); used rule-based script`,
          latencyMs: Date.now() - directorStarted,
        });
        warnings.push(`Director repair failed; used rule-based fallback: ${message}`);
        if (!director.passed) {
          throw new PipelineError(
            'director',
            `rule-based fallback also failed review: ${director.issues.map((i) => i.message).join(' | ')}`,
          );
        }
      }
    } else {
      stages.push({
        stage: 'director',
        status: director.passed ? 'ok' : 'failed',
        detail: director.passed
          ? `${director.checkedNumbers.length} numbers checked, 0 errors`
          : director.issues.map((i) => i.message).join(' | '),
        latencyMs: Date.now() - directorStarted,
      });
      if (!director.passed) {
        throw new PipelineError(
          'director',
          `rule-based script failed review (this should not happen): ${director.issues.map((i) => i.message).join(' | ')}`,
        );
      }
    }
    // Only a passed director checkpoints: a throwing stage above never
    // reaches this line, so no checkpoint ever claims a failed stage.
    checkpoints.director = { script, report: director, scriptSource, warnings: [...warnings] };
    await options.onCheckpoint?.(checkpoints);
  }

  // ── Stage 3: open-weights review (stub — see openWeights.ts) ───────────
  const openWeights = runOpenWeightsReview();
  stages.push({
    stage: 'open-weights-review',
    status: 'skipped',
    detail: openWeights.reason,
    latencyMs: 0,
  });

  // ── Stage 4: narration (ElevenLabs) ────────────────────────────────────
  // The poller is resolved here (not in stage 5) because the narration
  // checkpoint depends on it: v3 pollers upload the audio as a reusable
  // asset, and only an assetId makes narration reusable. Reuse requires
  // BOTH the assetId AND a poller that can create from an asset — a
  // checkpointed assetId with a v2 poller (no asset support) re-narrates
  // instead of failing on bytes that no longer exist.
  const poller = options.renderPoller ?? createHeygenRenderPoller();
  const narrationPath = join(outDir, 'narration.mp3');
  const canReuseNarration = Boolean(
    resume?.narration?.assetId && poller.startRenderFromAsset,
  );
  let narration: NarrationResult;
  if (canReuseNarration) {
    const n = resume!.narration!;
    narration = {
      audioPath: narrationPath,
      characters: n.characters,
      voiceId: n.voiceId,
      voiceName: n.voiceName,
      latencyMs: 0,
    };
    stages.push({ stage: 'narration', status: 'ok', detail: 'reused checkpoint (audio asset)', latencyMs: 0 });
  } else {
    const narrationTimed = await timed('narration', () =>
      withRetry(() => narrateWithElevenLabs(script.fullNarration, narrationPath, options.voiceId)),
    );
    stages.push(narrationTimed.result);
    narration = narrationTimed.value;
    // Best-effort asset upload (v3 only): a checkpointed asset_id lets a
    // later invocation create the video without the audio bytes and
    // without re-narrating. Upload failure is NOT fatal: this invocation
    // still holds the bytes for its own stage 5, and a resumed run
    // simply re-narrates because no reusable checkpoint exists.
    let assetId: string | undefined;
    if (poller.uploadAudioAsset && narration.audio) {
      try {
        assetId = (await withRetry(() => poller.uploadAudioAsset!(narration.audio!))).assetId;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[pipeline] narration asset upload failed (${message}); continuing without asset checkpoint`);
        warnings.push(`Narration asset upload failed (no reusable checkpoint): ${message}`);
      }
    }
    checkpoints.narration = {
      assetId,
      characters: narration.characters,
      voiceId: narration.voiceId,
      voiceName: narration.voiceName,
      warnings: [...warnings],
    };
    await options.onCheckpoint?.(checkpoints);
  }

  // ── Stage 5: avatar video (HeyGen external audio, via render poller) ─
  // The wait goes through the start/check interface (renderPoller.ts),
  // not a blocking poll inside one call: each check reports through
  // onRenderCheck so the caller can persist progress, and a bounded
  // budget ends the loop with RenderPending instead of failing the job.
  // Retries wrap only the start (a failed start created nothing); a
  // started render is never re-started, only re-polled.
  //
  // Resume order (first match wins, so a duplicate runner is cost-free):
  //   1. a checkpointed renderId → poll it, never start;
  //   2. a checkpointed assetId + from-asset poller → create from asset
  //      (no bytes, no re-narration, no duplicate upload);
  //   3. otherwise → legacy startRender with bytes (fresh run, or a
  //      narration checkpoint with no usable asset).
  const walletBefore =
    resume?.render?.walletBeforeUsd ?? (await getHeygenWalletBalance().catch(() => null));
  // The presenter's default follows the selected provider: v3 renders use
  // Dante Office 2 (Nandish-approved), v2 renders keep Aditya. Explicit
  // options/env avatars still win, so the recorded avatarId stays honest.
  // A resumed render keeps its ORIGINAL avatarId, not a re-resolved one.
  const avatarId =
    resume?.render?.avatarId ??
    options.avatarId ??
    process.env.HEYGEN_AVATAR_ID ??
    poller.defaultAvatarId ??
    DEFAULT_HEYGEN_AVATAR_ID;
  const videoPath = join(outDir, 'video.mp4');
  const heygenStarted = Date.now();
  let video: PipelineResult['video'];
  try {
    let renderId: string;
    let resumedRender = false;
    if (resume?.render?.renderId) {
      renderId = resume.render.renderId;
      resumedRender = true;
    } else if (checkpoints.narration?.assetId && poller.startRenderFromAsset) {
      const started = await withRetry(() =>
        poller.startRenderFromAsset!({
          assetId: checkpoints.narration!.assetId!,
          avatarId,
          title: script.title,
        }),
      );
      renderId = started.renderId;
    } else {
      const started = await withRetry(() =>
        poller.startRender({ audioPath: narrationPath, audio: narration.audio, avatarId, title: script.title }),
      );
      renderId = started.renderId;
    }
    if (!resumedRender) {
      // AWAITED (see onRenderStarted's doc): the render checkpoint must
      // be durable before the wait loop starts.
      await options.onRenderStarted?.({
        renderId,
        avatarId,
        stages: [...stages],
        narration: {
          characters: narration.characters,
          voiceId: narration.voiceId,
          voiceName: narration.voiceName,
        },
        scriptSource,
        warnings: [...warnings],
        walletBeforeUsd: walletBefore,
      });
    }
    const final = await pollRenderUntilDone(poller, renderId, {
      intervalMs: 15_000,
      // Explicit per-invocation budget wins; otherwise the legacy
      // per-round budget keeps its old meaning (3 rounds).
      budgetMs:
        options.renderWaitBudgetMs ??
        (options.heygenWaitSeconds != null ? options.heygenWaitSeconds * 3 * 1000 : null),
      onCheck: options.onRenderCheck,
    });
    if (final.status === 'processing') {
      // Budget out, render still going: NOT a failure. The caller keeps
      // the job 'processing' and resumes this renderId later.
      throw new RenderPending(renderId);
    }
    if (final.status === 'failed') {
      throw new PipelineError('heygen-avatar', final.error ?? 'HeyGen render failed');
    }
    let localPath: string | null = null;
    const downloadLocal = options.downloadLocal ?? true;
    if (downloadLocal) {
      if (poller.downloadRender) {
        localPath = await poller.downloadRender(renderId, videoPath);
      } else {
        warnings.push('Render provider has no download; local video unavailable');
      }
    }
    video = {
      localPath,
      remoteVideoUrl: final.videoUrl ?? null,
      heygenVideoId: renderId,
      avatarId,
    };
    stages.push({
      stage: 'heygen-avatar',
      status: 'ok',
      detail: '',
      latencyMs: Date.now() - heygenStarted,
    });
  } catch (err) {
    if (err instanceof RenderPending) throw err;
    throw err instanceof PipelineError
      ? err
      : new PipelineError('heygen-avatar', err instanceof Error ? err.message : String(err));
  }
  const walletAfter = await getHeygenWalletBalance().catch(() => null);

  // ── Costs + budget guardrail ───────────────────────────────────────────
  const heygenSpent =
    walletBefore != null && walletAfter != null
      ? Math.round((walletBefore - walletAfter) * 100) / 100
      : null;
  const projectedTotalUsd = heygenSpent;
  const overBudget = projectedTotalUsd != null && projectedTotalUsd > budgetWarnUsd;
  if (overBudget) {
    const msg =
      `COST WARNING: projected video cost $${projectedTotalUsd.toFixed(2)} exceeds the $${budgetWarnUsd.toFixed(2)} guardrail ` +
      `(HeyGen wallet ${walletBefore} → ${walletAfter})`;
    console.warn(`[pipeline] ${msg}`);
    warnings.push(msg);
  }
  const costs: PipelineCosts = {
    heygenWalletBeforeUsd: walletBefore,
    heygenWalletAfterUsd: walletAfter,
    heygenSpentUsd: heygenSpent,
    elevenlabsCharacters: narration.characters,
    projectedTotalUsd,
    budgetWarnUsd,
    overBudget,
  };

  const result: PipelineResult = {
    businessName: input.businessName,
    script,
    scriptSource,
    director,
    openWeights,
    narration: {
      audioPath: narration.audioPath,
      characters: narration.characters,
      voiceId: narration.voiceId,
      voiceName: narration.voiceName,
    },
    video: {
      localPath: video.localPath,
      remoteVideoUrl: video.remoteVideoUrl,
      heygenVideoId: video.heygenVideoId,
      avatarId,
    },
    costs,
    stages,
    warnings,
    totalLatencyMs: Date.now() - started,
    reportPath: join(outDir, 'pipeline-report.json'),
  };
  await writeFile(result.reportPath, JSON.stringify(result, null, 2), 'utf8');
  return result;
}

export { DEFAULT_ELEVENLABS_VOICE_ID };
