import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  writeScriptWithSpark,
  isSparkFetchEnabled,
  SPARK_MODEL,
  SPARK_MAX_TOKENS,
} from '../video/sparkScript';
import {
  narrateWithElevenLabs,
  isElevenLabsFetchEnabled,
  DEFAULT_ELEVENLABS_VOICE_ID,
  ELEVENLABS_MODEL,
} from '../video/providers/elevenlabsNarration';
import { reviewScript } from '../video/director';
import type { ScanVideoInput } from '../video/script';

// Server-side stages (slice 2 of the Vercel rebuild): when the API key
// env vars are present, the Spark script stage and the ElevenLabs
// narration stage call the provider APIs directly with fetch instead of
// shelling out to the VM-local mm.py / el.py helpers, which do not exist
// on Vercel. All fetch calls here are mocked — no paid calls, no keys.
//
// Deliberately NOT tested here: the exec paths (they would run the real
// helpers). Selection of those paths is covered only via the boolean
// selector functions, never by invoking them.

const FAKE_META_KEY = 'test-meta-key-not-real';
const FAKE_EL_KEY = 'test-el-key-not-real';

const baseInput: ScanVideoInput = {
  businessName: 'Tech Ridge Dental',
  industry: 'Dentist',
  location: 'North Austin',
  overallScore: 34,
  mentionedCount: 3,
  totalPlatforms: 12,
};

// Mirrors the proven-passing director fixture: only numbers that appear
// in baseInput (34, 3, 12, and the 100 scale), hook names the business,
// no absolute "never" claims, CTA has action language.
const sparkScriptJson = JSON.stringify({
  title: 'Your AI visibility report — Tech Ridge Dental',
  hook: {
    id: 'hook',
    onScreenText: 'AI recommends others first',
    narration:
      'Tech Ridge Dental, AI answers are naming your competitors while your score sits at 34 out of 100.',
  },
  findings: [
    {
      id: 'finding-1',
      onScreenText: 'Visibility score: 34/100',
      narration:
        'We scanned 12 AI platforms. Tech Ridge Dental scored 34 out of 100, mentioned on 3 of them.',
    },
  ],
  cta: {
    id: 'cta',
    onScreenText: 'See your full report — free',
    narration: 'Claim your free report today and see every platform and fix.',
  },
});

type FetchCall = { url: string; init: Record<string, unknown> };

function stubResponse(opts: {
  ok: boolean;
  status: number;
  json?: unknown;
  text?: string;
  bytes?: Uint8Array;
}): Response {
  return {
    ok: opts.ok,
    status: opts.status,
    json: async () => opts.json,
    text: async () => opts.text ?? '',
    arrayBuffer: async () =>
      (opts.bytes ? opts.bytes.buffer.slice(opts.bytes.byteOffset, opts.bytes.byteOffset + opts.bytes.byteLength) : new ArrayBuffer(0)),
  } as unknown as Response;
}

describe('server-side Spark stage (fetch)', () => {
  const savedEnv = { ...process.env };
  const savedFetch = globalThis.fetch;
  let calls: FetchCall[];
  let handler: (url: string) => Response;

  beforeEach(() => {
    calls = [];
    handler = () =>
      stubResponse({ ok: true, status: 200, json: { choices: [{ message: { content: sparkScriptJson } }] } });
    globalThis.fetch = (async (url: unknown, init: unknown) => {
      calls.push({ url: String(url), init: (init ?? {}) as Record<string, unknown> });
      return handler(String(url));
    }) as typeof fetch;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    globalThis.fetch = savedFetch;
  });

  it('selects fetch only when MODEL_API_KEY is present', () => {
    delete process.env.MODEL_API_KEY;
    expect(isSparkFetchEnabled()).toBe(false);
    process.env.MODEL_API_KEY = FAKE_META_KEY;
    expect(isSparkFetchEnabled()).toBe(true);
  });

  it('posts the exact Meta Model API shape (model, temp, top_p, max_tokens, redirect manual)', async () => {
    process.env.MODEL_API_KEY = FAKE_META_KEY;
    const script = await writeScriptWithSpark(baseInput);
    expect(calls).toHaveLength(1);
    const call = calls[0];
    expect(call.url).toBe('https://api.meta.ai/v1/chat/completions');
    expect(call.init.method).toBe('POST');
    expect(call.init.redirect).toBe('manual');
    const headers = call.init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${FAKE_META_KEY}`);
    const body = JSON.parse(String(call.init.body));
    expect(body.model).toBe(SPARK_MODEL);
    expect(body.model).not.toContain('contributor');
    expect(body.temperature).toBe(0);
    expect(body.top_p).toBe(1);
    expect(body.max_tokens).toBe(SPARK_MAX_TOKENS);
    expect(body.messages[0].content).toContain('Tech Ridge Dental');
    expect(body.messages[0].content).toContain('SCAN DATA:');
    expect(script.hook.id).toBe('hook');
    expect(script.findings).toHaveLength(1);
    expect(script.cta.id).toBe('cta');
    expect(script.fullNarration).toContain(script.hook.narration);
    expect(script.fullNarration).toContain(script.cta.narration);
  });

  it('includes director repair issues in the repair-round prompt', async () => {
    process.env.MODEL_API_KEY = FAKE_META_KEY;
    await writeScriptWithSpark(baseInput, ['[hook] weak hook']);
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.messages[0].content).toContain('PREVIOUS DRAFT WAS REJECTED');
    expect(body.messages[0].content).toContain('[hook] weak hook');
  });

  it('retries once, then surfaces the API status on failure', async () => {
    process.env.MODEL_API_KEY = FAKE_META_KEY;
    handler = () => stubResponse({ ok: false, status: 401, text: 'bad key' });
    await expect(writeScriptWithSpark(baseInput)).rejects.toThrow('Meta Model API failed: 401');
    expect(calls).toHaveLength(2);
  });

  it('rejects empty Spark content (the reasoning-token gotcha)', async () => {
    process.env.MODEL_API_KEY = FAKE_META_KEY;
    handler = () =>
      stubResponse({ ok: true, status: 200, json: { choices: [{ message: { content: '  ' } }] } });
    await expect(writeScriptWithSpark(baseInput)).rejects.toThrow('empty content');
    expect(calls).toHaveLength(2);
  });

  it('maxAttempts = 1 makes exactly one transport call (the 60s serverless rule)', async () => {
    process.env.MODEL_API_KEY = FAKE_META_KEY;
    handler = () =>
      stubResponse({ ok: true, status: 200, json: { choices: [{ message: { content: '  ' } }] } });
    await expect(writeScriptWithSpark(baseInput, [], 1)).rejects.toThrow('after 1 attempt(s)');
    expect(calls).toHaveLength(1);
  });

  it('director passes a Spark-generated-style script', async () => {
    process.env.MODEL_API_KEY = FAKE_META_KEY;
    const script = await writeScriptWithSpark(baseInput);
    const report = reviewScript(script, baseInput);
    expect(report.passed).toBe(true);
    expect(report.issues).toHaveLength(0);
  });
});

describe('server-side ElevenLabs stage (fetch)', () => {
  const savedEnv = { ...process.env };
  const savedFetch = globalThis.fetch;
  let calls: FetchCall[];
  let voices: Array<{ voice_id: string; name: string; category: string }>;
  let ttsOk = true;
  const outPaths: string[] = [];

  function tmpOut(): string {
    const p = join(tmpdir(), `rankall-el-test-${Date.now()}-${outPaths.length}.mp3`);
    outPaths.push(p);
    return p;
  }

  beforeEach(() => {
    calls = [];
    voices = [{ voice_id: DEFAULT_ELEVENLABS_VOICE_ID, name: 'Eric', category: 'premade' }];
    ttsOk = true;
    globalThis.fetch = (async (url: unknown, init: unknown) => {
      const u = String(url);
      calls.push({ url: u, init: (init ?? {}) as Record<string, unknown> });
      if (u.endsWith('/v1/voices')) {
        return stubResponse({ ok: true, status: 200, json: { voices } });
      }
      if (u.includes('/v1/text-to-speech/')) {
        if (!ttsOk) return stubResponse({ ok: false, status: 401, text: 'bad key' });
        return stubResponse({ ok: true, status: 200, bytes: new TextEncoder().encode('FAKEAUDIO') });
      }
      throw new Error(`unexpected fetch url ${u}`);
    }) as typeof fetch;
  });

  afterEach(async () => {
    process.env = { ...savedEnv };
    globalThis.fetch = savedFetch;
    for (const p of outPaths.splice(0)) await rm(p, { force: true });
  });

  it('selects fetch only when ELEVENLABS_API_KEY is present', () => {
    delete process.env.ELEVENLABS_API_KEY;
    expect(isElevenLabsFetchEnabled()).toBe(false);
    process.env.ELEVENLABS_API_KEY = FAKE_EL_KEY;
    expect(isElevenLabsFetchEnabled()).toBe(true);
  });

  it('verifies the voice, posts TTS with the right shape, returns bytes and writes the file', async () => {
    process.env.ELEVENLABS_API_KEY = FAKE_EL_KEY;
    const narration = 'Hello from Tech Ridge Dental.';
    const outPath = tmpOut();
    const result = await narrateWithElevenLabs(narration, outPath);
    const voicesCall = calls.find((c) => c.url.endsWith('/v1/voices'));
    expect(voicesCall).toBeDefined();
    expect((voicesCall!.init.headers as Record<string, string>)['xi-api-key']).toBe(FAKE_EL_KEY);
    const ttsCall = calls.find((c) => c.url.includes('/v1/text-to-speech/'));
    expect(ttsCall).toBeDefined();
    expect(ttsCall!.url).toBe(`https://api.elevenlabs.io/v1/text-to-speech/${DEFAULT_ELEVENLABS_VOICE_ID}`);
    expect(ttsCall!.init.method).toBe('POST');
    const body = JSON.parse(String(ttsCall!.init.body));
    expect(body.text).toBe(narration);
    expect(body.model_id).toBe(ELEVENLABS_MODEL);
    expect(result.audioPath).toBe(outPath);
    expect(result.voiceId).toBe(DEFAULT_ELEVENLABS_VOICE_ID);
    expect(result.voiceName).toBe('Eric');
    expect(result.characters).toBe(narration.length);
    expect(Buffer.from(result.audio ?? [])).toEqual(Buffer.from('FAKEAUDIO'));
    expect(await readFile(outPath)).toEqual(Buffer.from('FAKEAUDIO'));
  });

  it('refuses a cloned voice before any TTS call', async () => {
    process.env.ELEVENLABS_API_KEY = FAKE_EL_KEY;
    voices = [{ voice_id: DEFAULT_ELEVENLABS_VOICE_ID, name: 'Eric', category: 'cloned' }];
    await expect(narrateWithElevenLabs('hi', tmpOut())).rejects.toThrow('Refusing cloned voice');
    expect(calls.some((c) => c.url.includes('/v1/text-to-speech/'))).toBe(false);
  });

  it('refuses an unknown voice', async () => {
    process.env.ELEVENLABS_API_KEY = FAKE_EL_KEY;
    voices = [];
    await expect(narrateWithElevenLabs('hi', tmpOut())).rejects.toThrow('was not found on the ElevenLabs account');
    expect(calls.some((c) => c.url.includes('/v1/text-to-speech/'))).toBe(false);
  });

  it('surfaces the TTS status on failure', async () => {
    process.env.ELEVENLABS_API_KEY = FAKE_EL_KEY;
    ttsOk = false;
    await expect(narrateWithElevenLabs('hi', tmpOut())).rejects.toThrow('ElevenLabs TTS failed: 401');
  });
});
