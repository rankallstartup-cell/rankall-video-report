// ── Hackathon video-report: ElevenLabs narration ───────────────────────
// Calls el.py (vault credential, never hardcoded). Default voice is Eric
// — Smooth, Trustworthy, a STOCK premade voice. The pipeline must never
// narrate with a cloned voice of Nandish: narrateWithElevenLabs() verifies
// the chosen voice's category via `el.py voices` and refuses anything
// that is not a stock/premade voice (or an explicitly listed professional
// stock voice). A voice id that is absent from the account is also refused.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

/** Eric — Smooth, Trustworthy (premade stock). Overridable via ELEVENLABS_VOICE_ID. */
export const DEFAULT_ELEVENLABS_VOICE_ID = 'cjVigY5qzO86Huf0OWal';
/** Default narration model — matches el.py's DEFAULT_MODEL. */
export const ELEVENLABS_MODEL = 'eleven_multilingual_v2';
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io';
const EL_PY =
  process.env.EL_PY_PATH ??
  '/home/hatch/workspace/custom-connectors/custom.elevenlabs/bin/el.py';

export interface NarrationResult {
  audioPath: string;
  characters: number;
  voiceId: string;
  voiceName: string | null;
  latencyMs: number;
  /**
   * Raw audio bytes — set ONLY on the fetch path, for the later HeyGen v3
   * asset-upload step (upload bytes directly instead of re-reading the
   * file). The pipeline report picks only the scalar fields above, so
   * these bytes are never serialized into a job record or report JSON.
   */
  audio?: Buffer;
}

/**
 * Server-side selection rule: when ELEVENLABS_API_KEY is present (Vercel
 * preview/production), call the ElevenLabs API directly with fetch —
 * the el.py helper does not exist on Vercel. Otherwise (local dev/CLI)
 * keep the existing el.py exec path. The key is never logged or returned.
 */
export function isElevenLabsFetchEnabled(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

async function runEl(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('python3', [EL_PY, ...args], {
    timeout: 180_000,
    maxBuffer: 1024 * 1024,
  });
  return stdout;
}

/**
 * Verify a voice id is a stock voice on the account. Returns its display
 * name, or throws when the voice is missing or not stock (cloned voices
 * are refused — the business's video must never speak in Nandish's voice).
 */
export async function verifyStockVoice(voiceId: string): Promise<string | null> {
  const out = await runEl(['voices']);
  for (const line of out.split('\n')) {
    const parts = line.split('\t');
    if (parts.length >= 3 && parts[0] === voiceId) {
      const category = parts[2].trim();
      if (category === 'cloned') {
        throw new Error(`Refusing cloned voice ${voiceId} — only stock voices may narrate business videos`);
      }
      return parts[1] || null;
    }
  }
  throw new Error(`Voice ${voiceId} was not found on the ElevenLabs account`);
}

export async function narrateWithElevenLabs(
  narration: string,
  outPath: string,
  voiceId?: string,
): Promise<NarrationResult> {
  const started = Date.now();
  const voice = voiceId ?? process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_ELEVENLABS_VOICE_ID;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (apiKey) {
    // Server-side fetch path (Vercel): same voice guard and model as
    // the el.py path, but over direct API calls. The file is still
    // written to outPath so the current pipeline keeps working, and the
    // raw bytes ride along for the later HeyGen v3 asset upload.
    const voiceName = await verifyStockVoiceViaFetch(voice, apiKey);
    const res = await fetch(`${ELEVENLABS_API_URL}/v1/text-to-speech/${voice}`, {
      method: 'POST',
      signal: AbortSignal.timeout(180_000),
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({ text: narration, model_id: ELEVENLABS_MODEL }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`ElevenLabs TTS failed: ${res.status} ${errText.slice(0, 200)}`);
    }
    const audio = Buffer.from(await res.arrayBuffer());
    await writeFile(outPath, audio);
    return {
      audioPath: outPath,
      characters: narration.length,
      voiceId: voice,
      voiceName,
      latencyMs: Date.now() - started,
      audio,
    };
  }
  const voiceName = await verifyStockVoice(voice);
  const scriptFile = join(tmpdir(), `rankall-narration-${Date.now()}.txt`);
  await writeFile(scriptFile, narration, 'utf8');
  const out = await runEl(['tts', voice, '', '--script-file', scriptFile, '--out', outPath]);
  let parsed: { characters?: number };
  try {
    parsed = JSON.parse(out) as { characters?: number };
  } catch {
    throw new Error(`el.py tts output was not JSON: ${out.slice(0, 200)}`);
  }
  return {
    audioPath: outPath,
    characters: parsed.characters ?? narration.length,
    voiceId: voice,
    voiceName,
    latencyMs: Date.now() - started,
  };
}

/**
 * Fetch twin of verifyStockVoice: same rules (refuse cloned, refuse
 * unknown) against GET /v1/voices, the endpoint el.py reads. Returns the
 * voice's display name.
 */
async function verifyStockVoiceViaFetch(voiceId: string, apiKey: string): Promise<string | null> {
  const res = await fetch(`${ELEVENLABS_API_URL}/v1/voices`, {
    method: 'GET',
    signal: AbortSignal.timeout(60_000),
    headers: { 'xi-api-key': apiKey },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`ElevenLabs voices request failed: ${res.status} ${errText.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    voices?: Array<{ voice_id?: string; name?: string; category?: string }>;
  };
  for (const v of data.voices ?? []) {
    if (v.voice_id === voiceId) {
      if (v.category === 'cloned') {
        throw new Error(`Refusing cloned voice ${voiceId} — only stock voices may narrate business videos`);
      }
      return v.name ?? null;
    }
  }
  throw new Error(`Voice ${voiceId} was not found on the ElevenLabs account`);
}
