// ── Hackathon video-report: open-weights review stage (STUB) ───────────
// The plan calls for a script review pass on an open-weights model —
// Baseten `muse-spark-open-1026` — so the entry uses the full Meta stack
// (Spark, Image, Wonder, open-weights, Muse Code) and the Best Open Weight
// bonus is in play.
//
// STATUS: STUB ONLY. Baseten access is NOT connected for this workspace:
// no credential exists, no endpoint is called, and no credential is
// invented here. The stage reports `skipped` honestly and the pipeline
// continues — the open-weights review is advisory, never blocking.
// TODO: when Baseten access is connected, implement the client in this
// file (same prompt shape as the director's issue list) and flip the
// stage to `ok` with its own latency + cost reporting.
export const OPEN_WEIGHTS_MODEL = 'muse-spark-open-1026';

export interface OpenWeightsReview {
  status: 'skipped';
  model: string;
  reason: string;
}

export function runOpenWeightsReview(): OpenWeightsReview {
  if (process.env.OPEN_WEIGHTS_REVIEW_ENABLED !== '1') {
    return {
      status: 'skipped',
      model: OPEN_WEIGHTS_MODEL,
      reason: 'disabled (OPEN_WEIGHTS_REVIEW_ENABLED is not 1)',
    };
  }
  console.warn(
    '[open-weights] OPEN_WEIGHTS_REVIEW_ENABLED=1 but Baseten access is not connected — ' +
      'stage skipped (stub only, no credentials invented, no call attempted)',
  );
  return {
    status: 'skipped',
    model: OPEN_WEIGHTS_MODEL,
    reason: 'Baseten access not connected — stub only; wire credentials + client before enabling',
  };
}
