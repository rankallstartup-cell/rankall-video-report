// ── MetaVideoProvider: Meta Model API video generation ───────────────────
// Env: MODEL_API_KEY (server-side only).
//
// TODO (day 1–2 spike, once the hackathon key arrives):
//  1. Confirm which Meta Model API endpoint renders video (muse-image is
//     confirmed on the same API at $0.01/image; a video-capable model id
//     and quota are UNKNOWN until we get the key).
//  2. Decide the render strategy: (a) fully generated video, or
//     (b) image-per-scene via Muse Image + client-side Ken Burns pan/zoom —
//     (b) is the safe fallback if video generation is quota-limited.
//  3. Wire the actual HTTP call here and the status polling in getStatus().
//  4. Record the real endpoint + model id in HACKATHON.md.
import type {
  VideoProvider, VideoRenderOptions, VideoRenderResult, VideoScript,
} from '../types';

const ENV_KEY = 'MODEL_API_KEY';

export class MetaVideoProvider implements VideoProvider {
  readonly name = 'meta' as const;

  isConfigured(): boolean {
    return Boolean(process.env[ENV_KEY]);
  }

  async renderVideo(script: VideoScript, _options?: VideoRenderOptions): Promise<VideoRenderResult> {
    if (!this.isConfigured()) {
      throw new Error(
        `MetaVideoProvider is not configured: set ${ENV_KEY} (server env, never client-side). ` +
        'TODO: implement the Meta Model API video/image call once the hackathon key arrives.',
      );
    }
    // TODO: implement — POST to the Meta Model API with the script scenes.
    throw new Error(
      'MetaVideoProvider.renderVideo is not implemented yet (day 1–2 spike). ' +
      `Script "${script.title}" is ready to render once the endpoint is wired.`,
    );
  }

  async getStatus(jobId: string): Promise<VideoRenderResult> {
    if (!this.isConfigured()) {
      throw new Error(`MetaVideoProvider is not configured: set ${ENV_KEY}.`);
    }
    // TODO: implement — poll the Meta Model API for job status.
    throw new Error(`MetaVideoProvider.getStatus is not implemented yet (jobId: ${jobId}).`);
  }
}
