// ── Delivery-page video player: pure state helpers ────────────────────────
// Meta Global AI Developer Hackathon (Oct 26 – Nov 4 2026), Days 4–5.
//
// These helpers are pure (no DOM, no fetch) so the polling state machine
// is unit-testable. The client component in video-player.tsx owns the
// timers and network calls; it must never invent progress — elapsed time
// is real, and a job that never completes is reported as stalled, never
// as a finished video.

/** Poll the job-status endpoint this often while a render is running. */
export const POLL_INTERVAL_MS = 15_000;

/**
 * A real combo render (Spark + ElevenLabs + HeyGen) takes ~8 minutes.
 * Past this point a still-processing job is treated as stalled, not
 * "almost done" — the API route documents why: a serverless instance can
 * freeze after POST returns, so the job may never finish. Production
 * needs a queue/worker; the player must surface the stall honestly.
 */
export const STALL_AFTER_MS = 15 * 60 * 1000;

export type PlayerStatus = 'preparing' | 'ready' | 'failed' | 'stalled';
export type JobStatus = 'processing' | 'complete' | 'failed';

/** Only http(s) URLs may ever reach a <video> src. Anything else is dropped. */
export function isSafeVideoUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Real elapsed time for the preparing state — e.g. 45s, 2m 30s. Never a %. */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export function isStalled(elapsedMs: number): boolean {
  return elapsedMs >= STALL_AFTER_MS;
}

/**
 * Map a job record to what the player shows. A complete job WITHOUT a
 * usable video URL is a failure, not a success — never render a player
 * with no source.
 */
export function playerStatusFor(
  job: { status: JobStatus; videoUrl?: string | null },
  elapsedMs: number,
): PlayerStatus {
  if (job.status === 'complete') return isSafeVideoUrl(job.videoUrl) ? 'ready' : 'failed';
  if (job.status === 'failed') return 'failed';
  return isStalled(elapsedMs) ? 'stalled' : 'preparing';
}
