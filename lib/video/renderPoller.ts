// ── Render wait interface: start a render, poll it separately ──────────
// Slice 3 of the Vercel rebuild (job survival for long renders).
//
// Why this exists: a HeyGen render takes ~8 minutes and will not survive
// a single serverless invocation. The old path blocked inside one call
// (upload → generate → poll loop → download), so when the invocation was
// frozen or reclaimed, the render's progress died with it. This interface
// splits the wait into two operations the HeyGen v3 stage implements the
// same way (and the v2 exec path kept for local CLI use):
//
//   startRender(input) → { renderId }   (creates the render, returns fast)
//   checkRender(renderId) → RenderCheck (one cheap status read, no wait)
//
// The pipeline's wait loop (pollRenderUntilDone) calls checkRender on an
// interval and reports every check through onCheck, so the caller can
// persist progress (the API route stores it in its renderState map). The
// loop is bounded by budgetMs: when the budget runs out it returns the
// last 'processing' check instead of failing, and the caller throws
// RenderPending — the job stays 'processing' and a later request resumes
// the same renderId. No single invocation ever needs to stay alive for
// the whole render.
//
// A throwing checkRender is treated as transient (provider hiccup): the
// loop logs and keeps polling until the budget. Only a terminal 'failed'
// check fails the render.

export type RenderCheckStatus = 'processing' | 'complete' | 'failed';

export interface RenderCheck {
  status: RenderCheckStatus;
  videoUrl?: string | null;
  error?: string;
  checkedAt: string;
}

export interface RenderPoller {
  /** Create the render; must return quickly (no waiting). */
  startRender(input: {
    audioPath: string;
    /** Raw audio bytes when the caller already has them (slice 2 narration). */
    audio?: Buffer;
    avatarId: string;
    title: string;
  }): Promise<{ renderId: string }>;
  /** One status read for an already-started render. Must not block. */
  checkRender(renderId: string): Promise<RenderCheck>;
  /** Optional: download the finished render to a local path. */
  downloadRender?(renderId: string, outPath: string): Promise<string>;
  /**
   * Optional (v3 only): upload narration bytes as a reusable audio asset
   * and return its asset_id. A checkpointed asset_id lets a later
   * invocation create the video WITHOUT the audio bytes and WITHOUT
   * re-narrating — the whole point of the checkpointed pipeline. Pollers
   * without this (v2 exec) cannot checkpoint narration: a resumed run
   * re-narrates, because the audio file died with the old instance.
   */
  uploadAudioAsset?(audio: Buffer): Promise<{ assetId: string }>;
  /**
   * Optional (v3 only): create a render from a previously uploaded audio
   * asset instead of raw audio. Used when resuming from a narration
   * checkpoint (asset_id present) — no bytes, no re-narration, no
   * duplicate asset upload.
   */
  startRenderFromAsset?(input: {
    assetId: string;
    avatarId: string;
    title: string;
  }): Promise<{ renderId: string }>;
  /** Default presenter for this provider (v3: Dante, v2: Aditya). */
  defaultAvatarId?: string;
}

export interface PollRenderOptions {
  /** Delay between checks. Default 15s (matches the old hg.py poll cadence). */
  intervalMs?: number;
  /** Max wall time for this wait loop. Null = wait until terminal. */
  budgetMs?: number | null;
  /** Called after every successful check (not after transient failures). */
  onCheck?: (check: RenderCheck) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll checkRender until the render reaches a terminal status, or the
 * budget (if any) runs out — in which case the last 'processing' check is
 * returned, NOT an error. Callers turn that into RenderPending.
 */
export async function pollRenderUntilDone(
  poller: RenderPoller,
  renderId: string,
  opts: PollRenderOptions = {},
): Promise<RenderCheck> {
  const intervalMs = opts.intervalMs ?? 15_000;
  const budgetMs = opts.budgetMs ?? null;
  const started = Date.now();
  for (;;) {
    let check: RenderCheck;
    try {
      check = await poller.checkRender(renderId);
    } catch (err) {
      console.warn(
        `[render] check for ${renderId} failed (transient, continuing): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      check = { status: 'processing', checkedAt: new Date().toISOString() };
    }
    opts.onCheck?.(check);
    if (check.status !== 'processing') return check;
    if (budgetMs != null && Date.now() - started >= budgetMs) {
      return { status: 'processing', checkedAt: new Date().toISOString() };
    }
    await sleep(intervalMs);
  }
}

/**
 * Thrown when a bounded render wait ends with the render still
 * processing. This is NOT a failure: the job stays 'processing' and a
 * later request resumes the same renderId. The API route distinguishes
 * this from PipelineError and never marks the job failed on it.
 */
export class RenderPending extends Error {
  readonly renderId: string;
  constructor(renderId: string) {
    super(`Render ${renderId} still processing after wait budget`);
    this.name = 'RenderPending';
    this.renderId = renderId;
  }
}
