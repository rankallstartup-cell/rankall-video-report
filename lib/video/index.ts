// ── Hackathon video-report: provider registry ────────────────────────────
// Selects the active VideoProvider from env:
//
//   VIDEO_REPORT_PROVIDER=meta        (default; Meta Model API)
//   VIDEO_REPORT_PROVIDER=heygen     (avatar-video backup)
//   VIDEO_REPORT_PROVIDER=elevenlabs (narration-audio track only)
//
// Unknown/missing values fall back to 'meta' so the default path always
// targets the hackathon's sponsor API.
import type { VideoProvider, VideoProviderName } from './types';
import { MetaVideoProvider } from './providers/metaVideoProvider';
import { HeyGenProvider } from './providers/heygenProvider';
import { ElevenLabsProvider } from './providers/elevenlabsProvider';

export * from './types';
export { buildVideoScript } from './script';
export type { ScanVideoInput, PlatformFinding } from './script';
export { sanitizeScanInput } from './scanInput';
export { reviewScript, NO_TEXT_SUFFIX } from './director';
export type { DirectorIssue, DirectorReport, SceneNote } from './director';
export { writeScriptWithSpark, SPARK_MODEL, SPARK_MAX_TOKENS } from './sparkScript';
export { runVideoPipeline, withRetry, PipelineError, SparkRetryPending, SPARK_MAX_ATTEMPTS, shouldRetrySparkScript } from './pipeline';
export type { PipelineResult, PipelineOptions, PipelineStageResult, PipelineCosts, RenderStartedContext, ResumeStages, PipelineCheckpoints, CheckpointScript, CheckpointDirector, CheckpointNarration } from './pipeline';
export { pollRenderUntilDone, RenderPending } from './renderPoller';
export type { RenderCheck, RenderCheckStatus, RenderPoller, PollRenderOptions } from './renderPoller';
export {
  getJobStore, createSupabaseJobStore, createMemoryJobStore,
  isSupabaseJobStoreConfigured, StoreUnavailable,
} from './jobStore';
export type { JobStore, StoredJob, StoredJobResult, StoredRenderProgress, JobProgress } from './jobStore';
export {
  createHeygenRenderPoller, createHeygenRenderPollerV3, createHeygenRenderPollerV2,
  isHeygenFetchEnabled, V3_DEFAULT_AVATAR_ID,
  startHeygenAudioRender, startHeygenAudioRenderV3, checkHeygenRender, checkHeygenRenderV3,
  downloadHeygenVideo, downloadHeygenVideoV3, renderHeygenAudioAvatar, getHeygenWalletBalance,
} from './providers/heygenAudioAvatar';
export { runOpenWeightsReview, OPEN_WEIGHTS_MODEL } from './openWeights';
export type { OpenWeightsReview } from './openWeights';

const PROVIDER_NAMES: VideoProviderName[] = ['meta', 'heygen', 'elevenlabs'];

export function resolveProviderName(): VideoProviderName {
  const raw = (process.env.VIDEO_REPORT_PROVIDER ?? '').trim().toLowerCase();
  return (PROVIDER_NAMES as string[]).includes(raw) ? (raw as VideoProviderName) : 'meta';
}

export function getVideoProvider(name?: VideoProviderName): VideoProvider {
  switch (name ?? resolveProviderName()) {
    case 'heygen': return new HeyGenProvider();
    case 'elevenlabs': return new ElevenLabsProvider();
    case 'meta':
    default: return new MetaVideoProvider();
  }
}

/** The configured provider, for health checks / diagnostics. */
export function getConfiguredProvider(): VideoProvider | null {
  const provider = getVideoProvider();
  return provider.isConfigured() ? provider : null;
}
