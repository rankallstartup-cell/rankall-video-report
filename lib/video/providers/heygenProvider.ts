// ── HeyGenProvider: avatar-narrated video reports ────────────────────────
// Env: HEYGEN_API_KEY (server-side only).
//
// Strategy: feed the script's fullNarration (or per-section narration) to
// HeyGen's avatar video API; the avatar "presents" the business's own scan.
// This is the backup path if Meta's video models are quota-limited.
//
// TODO (day 1–2 spike):
//  1. Pick an avatar + voice on the HeyGen dashboard (faceless vs. avatar
//     is still undecided — see conversion-loop notes).
//  2. Confirm HeyGen v2 API shape (avatar_id, voice_id, input_text) against
//     current docs; wire POST here.
//  3. Wire getStatus() to HeyGen's video-status endpoint.
//  4. Record the real endpoint + chosen avatar/voice in HACKATHON.md.
import type {
  VideoProvider, VideoRenderOptions, VideoRenderResult, VideoScript,
} from '../types';

const ENV_KEY = 'HEYGEN_API_KEY';

export class HeyGenProvider implements VideoProvider {
  readonly name = 'heygen' as const;

  isConfigured(): boolean {
    return Boolean(process.env[ENV_KEY]);
  }

  async renderVideo(script: VideoScript, _options?: VideoRenderOptions): Promise<VideoRenderResult> {
    if (!this.isConfigured()) {
      throw new Error(
        `HeyGenProvider is not configured: set ${ENV_KEY} (server env, never client-side). ` +
        'TODO: implement the HeyGen v2 avatar-video call once avatar/voice are chosen.',
      );
    }
    // TODO: implement — POST avatar video job with script.fullNarration.
    throw new Error(
      'HeyGenProvider.renderVideo is not implemented yet (day 1–2 spike). ' +
      `Script "${script.title}" is ready to render once the endpoint is wired.`,
    );
  }

  async getStatus(jobId: string): Promise<VideoRenderResult> {
    if (!this.isConfigured()) {
      throw new Error(`HeyGenProvider is not configured: set ${ENV_KEY}.`);
    }
    // TODO: implement — poll HeyGen's video-status endpoint.
    throw new Error(`HeyGenProvider.getStatus is not implemented yet (jobId: ${jobId}).`);
  }
}
