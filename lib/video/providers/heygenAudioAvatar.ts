// ── HeyGen avatar video from external (ElevenLabs) audio ───────────────
// THIS MODULE IS THE ONLY PLACE THAT CALLS HEYGEN. Keep it that way.
//
// Two paths live here, selected by createHeygenRenderPoller():
// - v3 fetch path (server-side, Vercel): POST /v3/assets + POST /v3/videos
//   with audio_asset_id, used when process.env.HEYGEN_API_KEY is present.
//   Presenter: Dante Office 2 (v3 look, Nandish-approved Oct 26), engine
//   Avatar IV. The v2 studio avatar Aditya_public_4 is REJECTED by v3, so
//   the v3 path maps that legacy id to Dante instead of failing.
// - v2 exec path (local CLI only, hg.py): the pre-Oct-31 path, kept so
//   local runs keep working. v2 sunsets Oct 31, 2026 — do not build on it.
//
// Locked choices (do not change without Nandish):
// - Presenter (v3): Dante Office 2. Adrian is REJECTED. Never Nandish's
//   digital twin, never a cloned voice — the narration mp3 comes from
//   ElevenLabs stock voices only (see elevenlabsNarration).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import {
  pollRenderUntilDone,
  type RenderCheck,
  type RenderPoller,
} from '../renderPoller';

const execFileAsync = promisify(execFile);

const HG_PY =
  process.env.HG_PY_PATH ??
  '/home/hatch/workspace/custom-connectors/custom.heygen/bin/hg.py';

/** Aditya in Brown blazer — the Day 1 combo-test avatar (v2 exec path only). */
export const DEFAULT_HEYGEN_AVATAR_ID = 'Aditya_public_4';
/** Rejected avatars — never render with these. */
export const REJECTED_HEYGEN_AVATARS = ['Adrian_public_2_20240312'];
/** Dante Office 2 — the Nandish-approved v3 presenter (Oct 26). */
export const V3_DEFAULT_AVATAR_ID = 'ee25a2363ef941a1b5b0f7b1172e57d1';
/** Legacy v2 avatar id — v3 rejects it, so the v3 path maps it to Dante. */
export const LEGACY_V2_AVATAR_ID = 'Aditya_public_4';
const HEYGEN_API_URL = 'https://api.heygen.com';

/**
 * Server-side selection rule: when HEYGEN_API_KEY is present (Vercel
 * preview/production), call the HeyGen v3 API directly with fetch — the
 * hg.py helper does not exist on Vercel. Otherwise (local dev/CLI) keep
 * the existing hg.py exec path. The key is never logged or returned.
 */
export function isHeygenFetchEnabled(): boolean {
  return Boolean(process.env.HEYGEN_API_KEY);
}

export interface HeyGenVideoResult {
  localPath: string | null;
  remoteVideoUrl: string | null;
  heygenVideoId: string;
  latencyMs: number;
}

async function runHg(args: string[], timeoutMs = 120_000): Promise<string> {
  const { stdout } = await execFileAsync('python3', [HG_PY, ...args], {
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024,
  });
  return stdout;
}

function parseJson(out: string, what: string): Record<string, unknown> {
  try {
    return JSON.parse(out) as Record<string, unknown>;
  } catch {
    throw new Error(`hg.py ${what} output was not JSON: ${out.slice(0, 200)}`);
  }
}

function dataOf(parsed: Record<string, unknown>): Record<string, unknown> {
  const data = parsed.data;
  return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
}

function walletBalanceOf(parsed: Record<string, unknown>): number | null {
  const wallet = dataOf(parsed).wallet;
  if (typeof wallet === 'object' && wallet !== null) {
    const balance = (wallet as Record<string, unknown>).remaining_balance;
    if (typeof balance === 'number') return balance;
  }
  return null;
}

/** Read the HeyGen API wallet balance (USD) — used for cost guardrails. */
export async function getHeygenWalletBalance(): Promise<number | null> {
  if (isHeygenFetchEnabled()) {
    // Server-side (Vercel): the exec path (hg.py) does not exist there,
    // so the old exec-only read always threw and the pipeline's
    // .catch(() => null) left heygenSpentUsd null on every v3 run — the
    // $2 guard never saw real spend. Same endpoint hg.py `me` calls
    // (GET /v3/users/me), same response shape.
    const parsed = await heygenFetchV3('/v3/users/me', { method: 'GET' }, 'users/me');
    return walletBalanceOf(parsed);
  }
  const parsed = parseJson(await runHg(['me']), 'me');
  return walletBalanceOf(parsed);
}

/**
 * Start a HeyGen avatar render from an ElevenLabs narration mp3:
 * upload asset → generate-audio-v2 (audio_url voice) → video id.
 * Returns quickly — it does NOT wait for the render. The caller polls
 * with checkHeygenRender (see renderPoller.ts: no single invocation needs
 * to stay alive for the whole render).
 */
export async function startHeygenAudioRender(options: {
  audioPath: string;
  avatarId?: string;
  title?: string;
}): Promise<{ heygenVideoId: string }> {
  const avatarId = options.avatarId ?? process.env.HEYGEN_AVATAR_ID ?? DEFAULT_HEYGEN_AVATAR_ID;
  if (REJECTED_HEYGEN_AVATARS.includes(avatarId)) {
    throw new Error(`Refusing rejected avatar ${avatarId} — Adrian was rejected on Day 1`);
  }

  const upload = parseJson(await runHg(['upload', options.audioPath]), 'upload');
  const uploadData = dataOf(upload);
  const audioUrl = uploadData.url;
  if (typeof audioUrl !== 'string' || !audioUrl) {
    throw new Error(`hg.py upload returned no public url: ${JSON.stringify(upload).slice(0, 300)}`);
  }

  const title = options.title ?? 'Rankall video report';
  const generated = parseJson(
    await runHg(['generate-audio-v2', avatarId, audioUrl, '--title', title]),
    'generate-audio-v2',
  );
  const generatedData = dataOf(generated);
  const videoId =
    (generatedData.video_id as string | undefined) ??
    (generatedData.id as string | undefined) ??
    (generated.video_id as string | undefined);
  if (!videoId) {
    throw new Error(`hg.py generate-audio-v2 returned no video_id: ${JSON.stringify(generated).slice(0, 300)}`);
  }
  return { heygenVideoId: videoId };
}

/**
 * One status read for an already-started render. No --wait flag, so this
 * returns immediately with the current state (hg.py status without --wait
 * performs a single GET). 'completed' carries video_url; 'failed' /
 * 'cancelled' carry the provider payload as the error.
 */
export async function checkHeygenRender(videoId: string): Promise<RenderCheck> {
  const parsed = parseJson(await runHg(['status', videoId]), 'status');
  const data = dataOf(parsed);
  const status = (data.status as string | undefined) ?? '';
  const url = data.video_url;
  const checkedAt = new Date().toISOString();
  if (status === 'completed') {
    return {
      status: 'complete',
      videoUrl: typeof url === 'string' ? url : null,
      checkedAt,
    };
  }
  if (status === 'failed' || status === 'cancelled') {
    return {
      status: 'failed',
      error: `HeyGen render ${status}: ${JSON.stringify(parsed).slice(0, 400)}`,
      checkedAt,
    };
  }
  return { status: 'processing', checkedAt };
}

/** Download a completed render to a local path (hg.py refuses otherwise). */
export async function downloadHeygenVideo(videoId: string, outPath: string): Promise<string> {
  await runHg(['download', videoId, '--out', outPath], 300_000);
  return outPath;
}

// ── v3 fetch path (server-side) ─────────────────────────────────────────

async function heygenFetchV3(
  path: string,
  init: RequestInit,
  what: string,
): Promise<Record<string, unknown>> {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) throw new Error('HEYGEN_API_KEY is not set');
  const res = await fetch(`${HEYGEN_API_URL}${path}`, {
    ...init,
    redirect: 'manual',
    headers: { 'X-Api-Key': apiKey, ...((init.headers as Record<string, string> | undefined) ?? {}) },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`HeyGen v3 ${what} failed: ${res.status} ${errText.slice(0, 400)}`);
  }
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    throw new Error(`HeyGen v3 ${what} returned non-JSON`);
  }
}

/** Upload narration bytes as a v3 asset; returns the asset_id (preferred over audio_url). */
async function uploadAudioAssetV3(audio: Buffer): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([Uint8Array.from(audio)], { type: 'audio/mpeg' }), 'narration.mp3');
  const parsed = await heygenFetchV3(
    '/v3/assets',
    { method: 'POST', signal: AbortSignal.timeout(120_000), body: form },
    'asset upload',
  );
  const assetId = dataOf(parsed).asset_id;
  if (typeof assetId !== 'string' || !assetId) {
    throw new Error(`HeyGen v3 asset upload returned no asset_id: ${JSON.stringify(parsed).slice(0, 300)}`);
  }
  return assetId;
}

/**
 * Resolve the avatar for a v3 render: rejected avatars throw, the legacy
 * v2 Aditya id maps to Dante (v3 rejects it), anything else passes
 * through, and no id means the approved Dante default.
 */
function resolveV3AvatarId(avatarId: string | undefined): string {
  if (avatarId && REJECTED_HEYGEN_AVATARS.includes(avatarId)) {
    throw new Error(`Refusing rejected avatar ${avatarId} — Adrian was rejected on Day 1`);
  }
  if (!avatarId || avatarId === LEGACY_V2_AVATAR_ID) {
    if (avatarId === LEGACY_V2_AVATAR_ID) {
      console.warn('[heygen] legacy v2 avatar Aditya_public_4 is rejected by v3; using Dante Office 2 instead');
    }
    return V3_DEFAULT_AVATAR_ID;
  }
  return avatarId;
}

/**
 * Start a v3 avatar render from narration audio: upload asset → POST
 * /v3/videos (audio_asset_id only — exactly one of audio_asset_id /
 * audio_url / script). Returns quickly — it does NOT wait for the render.
 * Prefers caller-provided audio bytes (slice 2 narration) and only reads
 * audioPath when bytes were not provided.
 */
export async function startHeygenAudioRenderV3(options: {
  audioPath: string;
  audio?: Buffer;
  avatarId?: string;
  title?: string;
}): Promise<{ heygenVideoId: string }> {
  const avatarId = resolveV3AvatarId(options.avatarId);
  const audio = options.audio ?? (await readFile(options.audioPath));
  const assetId = await uploadAudioAssetV3(audio);
  return createVideoFromAssetV3(assetId, avatarId, options.title);
}

/**
 * Create a v3 video from a previously uploaded audio asset. Split out of
 * startHeygenAudioRenderV3 so a resumed pipeline run can re-create the
 * video from a checkpointed asset_id WITHOUT the narration bytes and
 * WITHOUT re-narrating or re-uploading.
 */
export async function createVideoFromAssetV3(
  assetId: string,
  avatarId: string,
  title?: string,
): Promise<{ heygenVideoId: string }> {
  const resolvedAvatarId = resolveV3AvatarId(avatarId);
  const resolvedTitle = title ?? 'Rankall video report';
  const parsed = await heygenFetchV3(
    '/v3/videos',
    {
      method: 'POST',
      signal: AbortSignal.timeout(120_000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'avatar',
        avatar_id: resolvedAvatarId,
        audio_asset_id: assetId,
        title: resolvedTitle,
        aspect_ratio: '16:9',
        resolution: '720p',
        background: { type: 'color', value: '#FFFFFF' },
        engine: { type: 'avatar_iv' },
      }),
    },
    'video generate',
  );
  const data = dataOf(parsed);
  const videoId =
    (data.video_id as string | undefined) ??
    (data.id as string | undefined) ??
    (parsed.video_id as string | undefined);
  if (!videoId) {
    throw new Error(`HeyGen v3 video generate returned no video_id: ${JSON.stringify(parsed).slice(0, 300)}`);
  }
  return { heygenVideoId: videoId };
}

/**
 * One status read for an already-started v3 render. 'completed' carries
 * video_url; 'failed' / 'cancelled' carry the provider's failure code and
 * message as the error (mapped to PipelineError stage 'heygen-avatar' by
 * the pipeline).
 */
export async function checkHeygenRenderV3(videoId: string): Promise<RenderCheck> {
  const parsed = await heygenFetchV3(
    `/v3/videos/${videoId}`,
    { method: 'GET', signal: AbortSignal.timeout(60_000) },
    'video status',
  );
  const data = dataOf(parsed);
  const status = (data.status as string | undefined) ?? '';
  const checkedAt = new Date().toISOString();
  if (status === 'completed') {
    const url = data.video_url;
    return {
      status: 'complete',
      videoUrl: typeof url === 'string' ? url : null,
      checkedAt,
    };
  }
  if (status === 'failed' || status === 'cancelled') {
    const code = data.failure_code;
    const message = data.failure_message;
    return {
      status: 'failed',
      error: `HeyGen render ${status}${typeof code === 'string' ? ` (${code})` : ''}${typeof message === 'string' ? `: ${message}` : ''}`,
      checkedAt,
    };
  }
  return { status: 'processing', checkedAt };
}

/** Download a completed v3 render to a local path (refuses otherwise). */
export async function downloadHeygenVideoV3(videoId: string, outPath: string): Promise<string> {
  const parsed = await heygenFetchV3(
    `/v3/videos/${videoId}`,
    { method: 'GET', signal: AbortSignal.timeout(60_000) },
    'video status',
  );
  const data = dataOf(parsed);
  if (data.status !== 'completed') {
    throw new Error(`HeyGen video ${videoId} not completed, status is ${String(data.status ?? 'unknown')}`);
  }
  const url = data.video_url;
  if (typeof url !== 'string' || !url) {
    throw new Error('Completed HeyGen video has no video_url, poll status again to refresh it');
  }
  const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(300_000) });
  if (!res.ok) {
    throw new Error(`HeyGen video download failed: ${res.status}`);
  }
  await writeFile(outPath, Buffer.from(await res.arrayBuffer()));
  return outPath;
}

/** The v3 RenderPoller: fetch-based, used on Vercel (key present). */
export function createHeygenRenderPollerV3(): RenderPoller {
  return {
    startRender: async ({ audioPath, audio, avatarId, title }) => {
      const { heygenVideoId } = await startHeygenAudioRenderV3({ audioPath, audio, avatarId, title });
      return { renderId: heygenVideoId };
    },
    uploadAudioAsset: async (audio) => {
      const assetId = await uploadAudioAssetV3(audio);
      return { assetId };
    },
    startRenderFromAsset: async ({ assetId, avatarId, title }) => {
      const { heygenVideoId } = await createVideoFromAssetV3(assetId, avatarId, title);
      return { renderId: heygenVideoId };
    },
    checkRender: checkHeygenRenderV3,
    downloadRender: downloadHeygenVideoV3,
    defaultAvatarId: V3_DEFAULT_AVATAR_ID,
  };
}

/** The v2 RenderPoller: hg.py exec, local CLI only. */
export function createHeygenRenderPollerV2(): RenderPoller {
  return {
    startRender: async ({ audioPath, avatarId, title }) => {
      const { heygenVideoId } = await startHeygenAudioRender({ audioPath, avatarId, title });
      return { renderId: heygenVideoId };
    },
    checkRender: checkHeygenRender,
    downloadRender: downloadHeygenVideo,
    defaultAvatarId: DEFAULT_HEYGEN_AVATAR_ID,
  };
}

/**
 * Shared selector used by BOTH the pipeline's initial run and the API
 * route's resume path, so the two can never use different provider
 * versions: v3 fetch when HEYGEN_API_KEY is present, else v2 exec.
 */
export function createHeygenRenderPoller(): RenderPoller {
  return isHeygenFetchEnabled() ? createHeygenRenderPollerV3() : createHeygenRenderPollerV2();
}

/**
 * Render an avatar video from an ElevenLabs narration mp3, blocking until
 * done (CLI path — the API route uses the split start/check interface
 * instead so a render can survive across invocations).
 * Set downloadLocal=false for API-route runs (remote URL only, no file).
 * Same ~15-minute cap as before: 3 × waitBudgetSeconds of polling.
 */
export async function renderHeygenAudioAvatar(options: {
  audioPath: string;
  avatarId?: string;
  title?: string;
  outPath?: string;
  downloadLocal?: boolean;
  waitBudgetSeconds?: number;
}): Promise<HeyGenVideoResult> {
  const started = Date.now();
  const avatarId = options.avatarId ?? process.env.HEYGEN_AVATAR_ID ?? DEFAULT_HEYGEN_AVATAR_ID;
  const downloadLocal = options.downloadLocal ?? true;
  if (downloadLocal && !options.outPath) {
    throw new Error('outPath is required when downloadLocal is true');
  }

  const poller = createHeygenRenderPoller();
  const { renderId } = await poller.startRender({
    audioPath: options.audioPath,
    avatarId,
    title: options.title ?? 'Rankall video report',
  });

  const waitBudget = options.waitBudgetSeconds ?? 300;
  const final = await pollRenderUntilDone(poller, renderId, {
    intervalMs: 15_000,
    budgetMs: waitBudget * 3 * 1000,
  });
  if (final.status === 'failed') {
    throw new Error(final.error ?? 'HeyGen render failed');
  }
  if (final.status !== 'complete') {
    throw new Error('HeyGen render did not complete after polling (last status: processing)');
  }

  let localPath: string | null = null;
  if (downloadLocal && options.outPath && poller.downloadRender) {
    localPath = await poller.downloadRender(renderId, options.outPath);
  }

  return { localPath, remoteVideoUrl: final.videoUrl ?? null, heygenVideoId: renderId, latencyMs: Date.now() - started };
}
