// Slice 4: HeyGen v3 audio-avatar stage (server-side fetch path).
//
// All HeyGen calls here are mocked — no paid calls, no keys, no real
// renders. The one authorized real v3 render lives outside this file.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile, readFile, rm } from 'node:fs/promises';
import {
  startHeygenAudioRenderV3,
  checkHeygenRenderV3,
  downloadHeygenVideoV3,
  createHeygenRenderPoller,
  createHeygenRenderPollerV3,
  createHeygenRenderPollerV2,
  getHeygenWalletBalance,
  isHeygenFetchEnabled,
  V3_DEFAULT_AVATAR_ID,
  DEFAULT_HEYGEN_AVATAR_ID,
} from '../video/providers/heygenAudioAvatar';

const DANTE_ID = 'ee25a2363ef941a1b5b0f7b1172e57d1';
const FAKE_KEY = 'test-heygen-key';

type FetchCall = { url: string; init: Record<string, unknown> };

function stubResponse(opts: {
  ok: boolean;
  status: number;
  json?: unknown;
  text?: string;
  bytes?: Buffer;
}): Response {
  return {
    ok: opts.ok,
    status: opts.status,
    json: async () => opts.json,
    text: async () => opts.text ?? '',
    arrayBuffer: async () =>
      opts.bytes
        ? opts.bytes.buffer.slice(opts.bytes.byteOffset, opts.bytes.byteOffset + opts.bytes.byteLength)
        : new ArrayBuffer(0),
  } as unknown as Response;
}

describe('HeyGen v3 stage (fetch)', () => {
  const savedEnv = { ...process.env };
  const savedFetch = globalThis.fetch;
  let calls: FetchCall[];
  let statusBody: Record<string, unknown>;
  let generateStatus: number;
  let generateBody: Record<string, unknown> | string;
  let uploadBody: Record<string, unknown>;
  let meBody: Record<string, unknown>;

  beforeEach(() => {
    process.env.HEYGEN_API_KEY = FAKE_KEY;
    calls = [];
    statusBody = { data: { status: 'processing' } };
    generateStatus = 200;
    generateBody = { data: { video_id: 'vid-1' } };
    uploadBody = { data: { asset_id: 'asset-1', url: 'https://cdn.example/narration.mp3' } };
    meBody = { data: { wallet: { remaining_balance: 13.6 } } };
    globalThis.fetch = (async (url: unknown, init: unknown) => {
      const u = String(url);
      const ini = (init ?? {}) as Record<string, unknown>;
      calls.push({ url: u, init: ini });
      if (u === 'https://api.heygen.com/v3/users/me' && ini.method === 'GET') {
        return stubResponse({ ok: true, status: 200, json: meBody });
      }
      if (u === 'https://api.heygen.com/v3/assets' && ini.method === 'POST') {
        return stubResponse({ ok: true, status: 200, json: uploadBody });
      }
      if (u === 'https://api.heygen.com/v3/videos' && ini.method === 'POST') {
        return stubResponse({ ok: generateStatus === 200, status: generateStatus, json: generateBody, text: typeof generateBody === 'string' ? generateBody : '' });
      }
      if (u.startsWith('https://api.heygen.com/v3/videos/') && ini.method === 'GET') {
        return stubResponse({ ok: true, status: 200, json: statusBody });
      }
      if (u === 'https://cdn.example/video.mp4') {
        return stubResponse({ ok: true, status: 200, bytes: Buffer.from('fake-video-bytes') });
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as typeof fetch;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    globalThis.fetch = savedFetch;
  });

  it('uploads audio then generates with the exact v3 body (asset_id, Dante default, avatar_iv, 16:9, 720p)', async () => {
    const audio = Buffer.from('fake-mp3-bytes');
    const { heygenVideoId } = await startHeygenAudioRenderV3({
      audioPath: '/definitely/not/here.mp3',
      audio,
      title: 'Rankall video report',
    });
    expect(heygenVideoId).toBe('vid-1');
    expect(calls).toHaveLength(2);

    const upload = calls[0];
    expect(upload.url).toBe('https://api.heygen.com/v3/assets');
    expect(upload.init.method).toBe('POST');
    const uploadHeaders = upload.init.headers as Record<string, string>;
    expect(uploadHeaders['X-Api-Key']).toBe(FAKE_KEY);
    expect(uploadHeaders).not.toHaveProperty('Content-Type');
    const form = upload.init.body as FormData;
    const file = form.get('file') as File;
    expect(file.name).toBe('narration.mp3');
    expect(file.size).toBe(audio.length);

    const generate = calls[1];
    expect(generate.url).toBe('https://api.heygen.com/v3/videos');
    expect(generate.init.method).toBe('POST');
    const genHeaders = generate.init.headers as Record<string, string>;
    expect(genHeaders['X-Api-Key']).toBe(FAKE_KEY);
    expect(genHeaders['Content-Type']).toBe('application/json');
    const body = JSON.parse(String(generate.init.body)) as Record<string, unknown>;
    expect(body.type).toBe('avatar');
    expect(body.avatar_id).toBe(DANTE_ID);
    expect(body.avatar_id).toBe(V3_DEFAULT_AVATAR_ID);
    expect(body.audio_asset_id).toBe('asset-1');
    expect(body).not.toHaveProperty('audio_url');
    expect(body).not.toHaveProperty('script');
    expect(body.title).toBe('Rankall video report');
    expect(body.aspect_ratio).toBe('16:9');
    expect(body.resolution).toBe('720p');
    expect(body.background).toEqual({ type: 'color', value: '#FFFFFF' });
    expect(body.engine).toEqual({ type: 'avatar_iv' });
  });

  it('maps the legacy Aditya id to Dante', async () => {
    await startHeygenAudioRenderV3({
      audioPath: '/nope.mp3',
      audio: Buffer.from('x'),
      avatarId: 'Aditya_public_4',
    });
    const generate = calls[1];
    const body = JSON.parse(String(generate.init.body)) as Record<string, unknown>;
    expect(body.avatar_id).toBe(DANTE_ID);
  });

  it('uses an explicit non-legacy avatar id as given', async () => {
    await startHeygenAudioRenderV3({
      audioPath: '/nope.mp3',
      audio: Buffer.from('x'),
      avatarId: 'some-other-look',
    });
    const body = JSON.parse(String(calls[1].init.body)) as Record<string, unknown>;
    expect(body.avatar_id).toBe('some-other-look');
  });

  it('refuses Adrian before any fetch', async () => {
    await expect(
      startHeygenAudioRenderV3({
        audioPath: '/nope.mp3',
        audio: Buffer.from('x'),
        avatarId: 'Adrian_public_2_20240312',
      }),
    ).rejects.toThrow('Refusing rejected avatar');
    expect(calls).toHaveLength(0);
  });

  it('reads audioPath when no bytes are provided', async () => {
    const tmp = join(tmpdir(), `v3-test-narration-${Date.now()}.mp3`);
    const bytes = Buffer.from('file-mp3-bytes');
    await writeFile(tmp, bytes);
    try {
      await startHeygenAudioRenderV3({ audioPath: tmp });
      const form = calls[0].init.body as FormData;
      const file = form.get('file') as File;
      expect(file.size).toBe(bytes.length);
    } finally {
      await rm(tmp, { force: true });
    }
  });

  it('surfaces a generate 400 with status and body, never the key', async () => {
    generateStatus = 400;
    generateBody = { code: 400, message: 'avatar does not support engine' };
    // Non-OK path reads text(); emulate the error body as text.
    globalThis.fetch = (async (url: unknown, init: unknown) => {
      const u = String(url);
      const ini = (init ?? {}) as Record<string, unknown>;
      calls.push({ url: u, init: ini });
      if (u === 'https://api.heygen.com/v3/assets') {
        return stubResponse({ ok: true, status: 200, json: uploadBody });
      }
      return stubResponse({ ok: false, status: 400, text: 'avatar does not support engine' });
    }) as typeof fetch;
    let caught: unknown;
    try {
      await startHeygenAudioRenderV3({ audioPath: '/nope.mp3', audio: Buffer.from('x') });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('HeyGen v3 video generate failed: 400');
    expect((caught as Error).message).toContain('avatar does not support engine');
    expect((caught as Error).message).not.toContain(FAKE_KEY);
  });

  it('throws when upload returns no asset_id', async () => {
    uploadBody = { data: { url: 'https://cdn.example/narration.mp3' } };
    await expect(
      startHeygenAudioRenderV3({ audioPath: '/nope.mp3', audio: Buffer.from('x') }),
    ).rejects.toThrow('no asset_id');
  });

  it('maps checkRender statuses (completed, failed with code+message, processing)', async () => {
    statusBody = { data: { status: 'completed', video_url: 'https://cdn.example/video.mp4', duration: 5 } };
    await expect(checkHeygenRenderV3('vid-1')).resolves.toEqual(
      expect.objectContaining({ status: 'complete', videoUrl: 'https://cdn.example/video.mp4' }),
    );
    statusBody = { data: { status: 'failed', failure_code: 'render_error', failure_message: 'boom' } };
    const failed = await checkHeygenRenderV3('vid-1');
    expect(failed.status).toBe('failed');
    expect(failed.error).toContain('render_error');
    expect(failed.error).toContain('boom');
    statusBody = { data: { status: 'pending' } };
    await expect(checkHeygenRenderV3('vid-1')).resolves.toEqual(
      expect.objectContaining({ status: 'processing' }),
    );
  });

  it('downloads bytes from video_url to outPath, and refuses when not completed', async () => {
    statusBody = { data: { status: 'completed', video_url: 'https://cdn.example/video.mp4' } };
    const out = join(tmpdir(), `v3-test-video-${Date.now()}.mp4`);
    try {
      await downloadHeygenVideoV3('vid-1', out);
      await expect(readFile(out)).resolves.toEqual(Buffer.from('fake-video-bytes'));
      const downloadCall = calls.find((c) => c.url === 'https://cdn.example/video.mp4');
      expect(downloadCall).toBeDefined();
      expect(downloadCall!.init.headers).toBeUndefined();
    } finally {
      await rm(out, { force: true });
    }
    statusBody = { data: { status: 'processing' } };
    await expect(downloadHeygenVideoV3('vid-1', out)).rejects.toThrow('not completed');
  });

  it('wires startRender through the v3 poller', async () => {
    const poller = createHeygenRenderPollerV3();
    expect(poller.defaultAvatarId).toBe(DANTE_ID);
    const { renderId } = await poller.startRender({
      audioPath: '/nope.mp3',
      audio: Buffer.from('x'),
      avatarId: undefined as unknown as string,
      title: 'T',
    });
    expect(renderId).toBe('vid-1');
  });

  it('selects v3 with Dante default when the key is present, v2 with Aditya default when absent', () => {
    expect(isHeygenFetchEnabled()).toBe(true);
    expect(createHeygenRenderPoller().defaultAvatarId).toBe(DANTE_ID);
    expect(createHeygenRenderPollerV3().defaultAvatarId).toBe(DANTE_ID);
    delete process.env.HEYGEN_API_KEY;
    expect(isHeygenFetchEnabled()).toBe(false);
    expect(createHeygenRenderPoller().defaultAvatarId).toBe(DEFAULT_HEYGEN_AVATAR_ID);
    expect(createHeygenRenderPollerV2().defaultAvatarId).toBe(DEFAULT_HEYGEN_AVATAR_ID);
  });

  it('reads the wallet balance over fetch when the key is present (no hg.py on Vercel)', async () => {
    await expect(getHeygenWalletBalance()).resolves.toBe(13.6);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.heygen.com/v3/users/me');
    expect((calls[0].init.headers as Record<string, string>)['X-Api-Key']).toBe(FAKE_KEY);
  });

  it('returns null (not a throw) when the wallet shape is missing', async () => {
    meBody = { data: {} };
    await expect(getHeygenWalletBalance()).resolves.toBeNull();
  });
});
