// ── Hackathon video-report: Muse Spark script writer ───────────────────
// Day 2 build: the narration writer is Meta's Muse Spark 1.3, called via
// the mm.py helper (vault credential, never hardcoded).
//
// ⚠️  CRITICAL Spark gotcha (verified Day 1): Spark is a reasoning model.
// Small max_tokens budgets return EMPTY content (1,500 tokens → 1,498
// reasoning tokens, no output). Script work MUST use max_tokens 4000.
// Do not lower this without re-verifying output is non-empty.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { VideoScript, VideoScriptSection } from './types';
import type { ScanVideoInput } from './script';

const execFileAsync = promisify(execFile);

export const SPARK_MODEL = 'muse-spark-1.3';
export const SPARK_MAX_TOKENS = 4000;
const SPARK_API_URL = 'https://api.meta.ai/v1/chat/completions';
const MM_PY =
  process.env.MM_PY_PATH ??
  '/home/hatch/workspace/custom-connectors/custom.meta-model-api/bin/mm.py';

/**
 * Server-side selection rule: when MODEL_API_KEY is present (Vercel
 * preview/production), call the Meta Model API directly with fetch —
 * the mm.py helper does not exist on Vercel. Otherwise (local dev/CLI)
 * keep the existing mm.py exec path. Read at call time (not import
 * time) so tests and serverless env injection both see the live value.
 * The key is never logged or returned.
 */
export function isSparkFetchEnabled(): boolean {
  return Boolean(process.env.MODEL_API_KEY);
}

export class SparkScriptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SparkScriptError';
  }
}

function buildPrompt(input: ScanVideoInput): string {
  return buildPromptWithIssues(input, []);
}

function buildPromptWithIssues(input: ScanVideoInput, repairIssues: string[]): string {
  const aggregates = {
    businessName: input.businessName,
    industry: input.industry ?? null,
    location: input.location ?? null,
    overallScore: input.overallScore,
    mentionedCount: input.mentionedCount,
    totalPlatforms: input.totalPlatforms,
    competitorName: input.competitorName ?? null,
    competitorScore: input.competitorScore ?? null,
    rating: input.rating ?? null,
    reviewCount: input.reviewCount ?? null,
    mentionNote: input.mentionNote ?? null,
    platforms: (input.platforms ?? []).map((p) => ({
      platform: p.platform,
      score: p.score,
      mentioned: p.mentioned,
      rank: p.rank,
    })),
    signalHighlights: input.signalHighlights ?? [],
    topFix: input.topFix ?? null,
  };
  return [
    'Write a 60-second wound-first video script for a personalized AI-visibility video report.',
    'Structure: a hook (the invisible loss), 2–3 findings (their mentions vs competitors), one CTA (free report).',
    'Each section has an id, a short onScreenText headline, and narration of 25–40 words.',
    'DATA HONESTY — these rules are absolute:',
    '- Use ONLY numbers that appear in the scan data below. Never invent a count, score, rating, or rank.',
    '- Never write "zero", "never", "nobody", or "no one" unless the data shows zero mentions.',
    '- Never write vague magnitudes like "hundreds", "thousands", or "millions" of patients — patient counts are not in the data.',
    '- When a value is null, it is UNKNOWN: do not state it, do not estimate it. Use the mentionNote wording as given when counts are unknown.',
    '- The hook must name the business. The CTA must offer the free report.',
    'Output ONLY valid JSON, no markdown fences, no commentary, matching this shape:',
    '{"title": string, "hook": {"id": "hook", "onScreenText": string, "narration": string},',
    ' "findings": [{"id": string, "onScreenText": string, "narration": string}],',
    ' "cta": {"id": "cta", "onScreenText": string, "narration": string}}',
    `SCAN DATA: ${JSON.stringify(aggregates)}`,
    ...(repairIssues.length
      ? [
          'YOUR PREVIOUS DRAFT WAS REJECTED — fix every issue below, keeping all data-honesty rules:',
          ...repairIssues.map((issue) => `- ${issue}`),
        ]
      : []),
  ].join('\n');
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1].trim() : trimmed;
}

function isSection(value: unknown): value is VideoScriptSection {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    typeof s.onScreenText === 'string' &&
    typeof s.narration === 'string' &&
    s.narration.trim().length > 0
  );
}

function parseScript(raw: string, businessName: string): VideoScript {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    throw new SparkScriptError('Spark output was not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new SparkScriptError('Spark output was not a JSON object');
  }
  const obj = parsed as Record<string, unknown>;
  if (!isSection(obj.hook) || !isSection(obj.cta) || !Array.isArray(obj.findings)) {
    throw new SparkScriptError('Spark output is missing hook, findings, or cta sections');
  }
  const findings = (obj.findings as unknown[]).filter(isSection);
  if (findings.length < 1 || findings.length > 4) {
    throw new SparkScriptError(`Spark output has ${findings.length} findings (need 1–4)`);
  }
  const all = [obj.hook, ...findings, obj.cta];
  return {
    version: 1,
    title:
      typeof obj.title === 'string' && obj.title.trim()
        ? obj.title
        : `Your AI visibility report — ${businessName}`,
    targetDurationSeconds: 60,
    hook: obj.hook,
    findings,
    cta: obj.cta,
    fullNarration: all.map((s) => s.narration).join('\n\n'),
  };
}

async function callSpark(prompt: string): Promise<string> {
  const { stdout } = await execFileAsync('python3', [MM_PY, 'chat', SPARK_MODEL, prompt, '--max-tokens', String(SPARK_MAX_TOKENS)], {
    timeout: 180_000,
    maxBuffer: 1024 * 1024,
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new SparkScriptError('mm.py chat output was not JSON');
  }
  const content =
    (parsed as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content;
  if (!content || !content.trim()) {
    throw new SparkScriptError(
      'Spark returned empty content — this is the known reasoning-token gotcha; max_tokens must stay at 4000',
    );
  }
  return content;
}

/**
 * Server-side Spark call: direct fetch to the Meta Model API, mirroring
 * the Meta AI platform branch in lib/platforms.ts (same endpoint, model,
 * temperature, top_p, and max_tokens; standard tier only — the model
 * name is never suffixed with -contributor; redirect: 'manual' so the
 * bearer key can never leak to another host via redirect). The prompt
 * and response parsing are identical to the mm.py path above, so the
 * director sees the same script shape from either transport.
 */
async function callSparkViaFetch(prompt: string, apiKey: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(SPARK_API_URL, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(180_000),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: SPARK_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        top_p: 1,
        max_tokens: SPARK_MAX_TOKENS,
      }),
    });
  } catch (err) {
    throw new SparkScriptError(
      `Meta Model API request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new SparkScriptError(`Meta Model API failed: ${res.status} ${errText.slice(0, 200)}`);
  }
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    throw new SparkScriptError('Meta Model API response was not JSON');
  }
  const content =
    (parsed as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content;
  if (!content || !content.trim()) {
    throw new SparkScriptError(
      'Spark returned empty content — this is the known reasoning-token gotcha; max_tokens must stay at 4000',
    );
  }
  return content;
}

/**
 * Write a draft script with Spark. Retries once on parse/empty failures
 * by default (local dev/CLI), then throws — the pipeline falls back to
 * the rule-based script and flags the fallback (never silent). When
 * repairIssues are provided, the prompt includes the director's
 * rejection reasons so the repair targets the actual errors instead of
 * blindly regenerating.
 *
 * 60-SECOND RULE (proven Oct 27 00:11–00:23 CDT): the Vercel function
 * limit is 60s, and one Spark reasoning call can take 20–40s. The
 * pipeline therefore passes maxAttempts = 1 — a stacked retry (the old
 * withRetry(2) wrapper × this loop's 2 attempts = up to 6 Spark calls)
 * ran past 60s on every Kinsler invocation and died BEFORE the
 * fallback catch could run, so the job stalled instead of completing
 * with a flagged fallback. Retrying Spark across invocations (a bounded
 * attempt counter in resume_context) is a future polish item, NOT this
 * function: failure here must terminate the invocation, one way or the
 * other. Every attempt logs its start, so a retry stuck in flight is
 * visible in logs instead of a bare "retrying once" ghost.
 */
export async function writeScriptWithSpark(
  input: ScanVideoInput,
  repairIssues: string[] = [],
  maxAttempts = 2,
): Promise<VideoScript> {
  const prompt = buildPromptWithIssues(input, repairIssues);
  // Transport selection: fetch when the key is present (Vercel), else
  // the local mm.py exec path. Prompt, retries, and parsing are shared.
  const fetchKey = process.env.MODEL_API_KEY;
  const run = fetchKey ? (p: string) => callSparkViaFetch(p, fetchKey) : callSpark;
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.warn(`[spark] attempt ${attempt}/${maxAttempts} starting`);
      const content = await run(prompt);
      return parseScript(content, input.businessName);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts) {
        console.warn(`[spark] attempt ${attempt} failed (${lastError.message}); retrying`);
      }
    }
  }
  throw new SparkScriptError(
    `Spark script writing failed after ${maxAttempts} attempt(s): ${lastError?.message}`,
  );
}
