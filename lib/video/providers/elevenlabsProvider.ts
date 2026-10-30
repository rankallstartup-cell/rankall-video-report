// ── ElevenLabsProvider: narration audio for the video report ─────────────
// Env: ELEVENLABS_API_KEY (server-side only).
//
// Strategy: render the script's fullNarration (or per-section narration) to
// audio via ElevenLabs TTS. This pairs with a scene-based video renderer
// (e.g. Meta's Muse Image frames + Ken Burns) when a full avatar-video
// provider is unavailable. Mirrors the pattern already used by
// app/api/generate-video-email (which returns audio_url from ElevenLabs).
//
// TODO (day 1–2 spike):
//  1. Confirm the TTS endpoint + voice list against current ElevenLabs docs.
//  2. Decide per-section vs. single-pass narration (per-section lets scenes
//     stay in sync with the on-screen text).
//  3. Wire the POST here; getStatus() may stay synchronous (TTS is fast).
import type {
  VideoProvider, VideoRenderOptions, VideoRenderResult, VideoScript,
} from '../types';

const ENV_KEY = 'ELEVENLABS_API_KEY';

export class ElevenLabsProvider implements VideoProvider {
  readonly name = 'elevenlabs' as const;

  isConfigured(): boolean {
    return Boolean(process.env[ENV_KEY]);
  }

  async renderVideo(script: VideoScript, options?: VideoRenderOptions): Promise<VideoRenderResult> {
    if (!this.isConfigured()) {
      throw new Error(
        `ElevenLabsProvider is not configured: set ${ENV_KEY} (server env, never client-side). ` +
        'TODO: implement the ElevenLabs TTS call for the narration track.',
      );
    }
    const voiceId = options?.voice?.voiceId ?? '(default voice)';
    // TODO: implement — POST TTS with script.fullNarration; store audioUrl.
    throw new Error(
      'ElevenLabsProvider.renderVideo is not implemented yet (day 1–2 spike). ' +
      `Script "${script.title}" is ready for narration (voice ${voiceId}).`,
    );
  }

  async getStatus(jobId: string): Promise<VideoRenderResult> {
    if (!this.isConfigured()) {
      throw new Error(`ElevenLabsProvider is not configured: set ${ENV_KEY}.`);
    }
    // TODO: ElevenLabs TTS is near-synchronous; this may become a no-op that
    // returns the finished audioUrl. Kept for the common interface.
    throw new Error(`ElevenLabsProvider.getStatus is not implemented yet (jobId: ${jobId}).`);
  }
}
