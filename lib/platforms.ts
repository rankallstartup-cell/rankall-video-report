// Shared platform definitions and caller — used by /api/scan and /api/scan-personal

export interface Platform {
  name: string;
  weight: number;
  model: string;
  apiKey: string | undefined;
  // Meta AI is live by default (12th platform, via the Meta Model API).
  // Set META_AI_SCAN_ENABLED=0 to opt out (restores the old "Coming Soon"
  // stub: excluded from ACTIVE_PLATFORMS, callPlatform returns '').
  // active:false platforms are excluded from ACTIVE_PLATFORMS and every scan loop.
  active?: boolean;
  // Optional per-platform timeout override (ms). Slower models (e.g. Kimi) need
  // longer than the default before we give up on them.
  timeoutMs?: number;
  // Optional stagger (ms) between concurrent calls to avoid 429s.
  staggerMs?: number;
  // Max queries to send to this platform. Defaults to all queries.
  // Use for rate-limited platforms (e.g. Kimi at 3 RPM).
  maxQueries?: number;
}

// Hackathon (Oct 26–Nov 4 2026): Meta AI is the 12th scanned platform,
// live by default. Same query baskets, prompt shape, timeout/retry
// plumbing, and mention extraction as the other 11 platforms. Opt out
// only with META_AI_SCAN_ENABLED=0. Scoring is safe: lib/scoring
// normalizes by responding weight, and the recommendation-share
// denominator (PLATFORMS.length) is 12 once Meta AI is measured.
// Display weights (lib/publicStats PLATFORM_SCORING_WEIGHTS) are the
// integer-percent form of this table (largest-remainder allocation, sums
// to 100%). Renormalized Oct 26 (hackathon, Nandish-approved): every weight
// below is the pre-Meta weight / 1.05, so the table sums to 100%. Scores are
// unchanged — lib/scoring normalizes by responded weight.
export function isMetaAIScanEnabled(): boolean {
  return process.env.META_AI_SCAN_ENABLED !== '0';
}

export const PLATFORMS: Platform[] = [
  { name: 'ChatGPT',    weight: 0.25 / 1.05, model: 'gpt-4o-mini',              apiKey: process.env.OPENAI_API_KEY,      active: true  },
  { name: 'Gemini',     weight: 0.18 / 1.05, model: 'gemini-flash-latest',      apiKey: process.env.GEMINI_API_KEY,      active: true, timeoutMs: 12000 },
  { name: 'Google AI',  weight: 0.15 / 1.05, model: 'serpapi',                   apiKey: process.env.SERPAPI_KEY,         active: true  },
  { name: 'Copilot',    weight: 0.10 / 1.05, model: 'gpt-4o',                    apiKey: process.env.OPENAI_API_KEY,      active: true  },
  { name: 'Perplexity', weight: 0.09 / 1.05, model: 'sonar',                     apiKey: process.env.PERPLEXITY_API_KEY,  active: true  },
  { name: 'Grok',       weight: 0.07 / 1.05, model: 'grok-3-mini',                apiKey: process.env.GROK_API_KEY,        active: true, timeoutMs: 15000 },
  { name: 'Claude',     weight: 0.06 / 1.05, model: 'claude-haiku-4-5',          apiKey: process.env.ANTHROPIC_API_KEY,   active: true  },
  { name: 'DeepSeek',   weight: 0.04 / 1.05, model: 'deepseek-chat',             apiKey: process.env.DEEPSEEK_API_KEY,    active: true  },
  { name: 'Mistral',    weight: 0.03 / 1.05, model: 'mistral-small-latest',      apiKey: process.env.MISTRAL_API_KEY,     active: true, maxQueries: 1 },
  { name: 'Kimi',       weight: 0.02 / 1.05, model: 'kimi-k2.6',                   apiKey: process.env.KIMI_API_KEY,        active: true, timeoutMs: 25000, staggerMs: 1500, maxQueries: 1 },
  { name: 'Groq',       weight: 0.01 / 1.05, model: 'openai/gpt-oss-120b',   apiKey: process.env.GROQ_API_KEY,        active: true  },
  // Meta AI — live 12th platform via the Meta Model API (muse-spark-1.3).
  { name: 'Meta AI',    weight: 0.05 / 1.05, model: 'muse-spark-1.3',            apiKey: process.env.MODEL_API_KEY,       active: process.env.META_AI_SCAN_ENABLED !== '0', timeoutMs: 20000 },
];

// The 12 platforms actually scanned. Use this for scan loops and counts.
export const ACTIVE_PLATFORMS: Platform[] = PLATFORMS.filter(p => p.active !== false);

// 8s per-platform cap — if a platform doesn't respond in time we skip it and
// move on rather than letting one slow API block the whole scan.
const TIMEOUT_MS = 8000;

// Retry config: 429s get more retries with exponential backoff because they're
// transient rate-limits, not failures. Other retryable errors (5xx, timeout)
// get 1 retry to avoid slowing scans on dead platforms.
const RETRYABLE_STATUS = [429, 500, 502, 503, 504];
const MAX_RETRIES_429 = 3;
const MAX_RETRIES_OTHER = 1;
const BACKOFF_BASE_MS = 1000;

// Max wait for COMPUTED exponential backoff on 429s (no server guidance).
// A server-sent Retry-After is honored in full (uncapped) — the scan
// deadline check bounds the total wait instead. One slow platform must
// never stall the whole scan. (Named MAX_COMPUTED_BACKOFF_MS, not
// MAX_RETRY_AFTER_MS, so nobody re-files 'the 30s Retry-After cap' —
// the cap never applied to server-sent Retry-After.)
const MAX_COMPUTED_BACKOFF_MS = 30000;

// Parse a Retry-After header: seconds ("120") or an HTTP date. Returns ms to
// wait, or 0 when the header is missing/unparseable.
function parseRetryAfter(res: Response): number {
  const raw = res.headers.get('Retry-After');
  if (!raw) return 0;
  const secs = Number(raw);
  if (!Number.isNaN(secs)) return Math.max(0, secs * 1000);
  const dateMs = Date.parse(raw);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return 0;
}

// ±20% jitter so retries from concurrent calls don't synchronize.
function jittered(ms: number): number {
  return Math.max(0, Math.round(ms * (1 + (Math.random() * 2 - 1) * 0.2)));
}

async function callWithRetry(
  fn: () => Promise<Response>,
  retries?: number,
  attempt = 0,
  // Absolute epoch-ms deadline for the enclosing scan (scan start + 45s master
  // timeout). When set, a retry whose backoff + next attempt would run past
  // the deadline is skipped — fail fast with the original error instead of
  // being silently killed by the master timeout mid-retry.
  deadlineMs?: number,
  // Per-attempt timeout of the call being retried, for the deadline check.
  timeoutMs?: number,
): Promise<Response> {
  try {
    const res = await fn();
    if (RETRYABLE_STATUS.includes(res.status)) {
      const maxRetries = res.status === 429 ? MAX_RETRIES_429 : MAX_RETRIES_OTHER;
      const retriesLeft = retries ?? maxRetries;
      if (retriesLeft > 0) {
        let delay: number;
        // Server-sent Retry-After on this 429, if any (0 = none sent).
        let retryAfterMs = 0;
        if (res.status === 429) {
          const backoff = BACKOFF_BASE_MS * Math.pow(2, attempt); // 1s, 2s, 4s
          retryAfterMs = parseRetryAfter(res);
          if (retryAfterMs > 0) {
            // Server sent Retry-After: honor its full value (uncapped).
            // The scan deadline check below still bounds the total wait.
            delay = jittered(retryAfterMs);
            // aeb3: log the wait so Vercel logs show the Retry-After was
            // respected (the ticket's acceptance is log-visible).
            console.log(`[scan] 429 — honoring Retry-After ${retryAfterMs / 1000}s, waiting ${delay}ms (attempt ${attempt + 1})`);
          } else {
            // No server guidance: computed exponential backoff, capped.
            delay = Math.min(jittered(backoff), MAX_COMPUTED_BACKOFF_MS);
          }
        } else {
          delay = jittered(2000);
        }
        if (deadlineMs !== undefined && timeoutMs !== undefined &&
            Date.now() + delay + timeoutMs > deadlineMs) {
          // aeb3: log the skip — a long Retry-After past the 45s scan
          // deadline means no retry happens. (Oct 27 log evidence:
          // Mistral's Retry-After is 1s and IS honored — no deadline
          // skip observed; its persistent 429 is an account limit, not
          // a retry-window problem. Do not re-derive a 60s window here.)
          // Without this line the 429 looked like an unretried failure.
          if (retryAfterMs > 0) {
            console.log(`[scan] 429 — skipping retry: Retry-After ${retryAfterMs / 1000}s would exceed scan deadline (${Math.max(0, deadlineMs - Date.now())}ms left)`);
          }
          return res;
        }
        await new Promise(r => setTimeout(r, delay));
        return callWithRetry(fn, retriesLeft - 1, attempt + 1, deadlineMs, timeoutMs);
      }
    }
    return res;
  } catch (err) {
    const e = err as { name?: string; message?: string };
    const retriesLeft = retries ?? MAX_RETRIES_OTHER;
    if (retriesLeft > 0 && (e?.name === 'AbortError' || e?.name === 'TimeoutError' || e?.message?.includes('timeout'))) {
      const delay = jittered(2000);
      if (deadlineMs !== undefined && timeoutMs !== undefined &&
          Date.now() + delay + timeoutMs > deadlineMs) {
        throw err;
      }
      await new Promise(r => setTimeout(r, delay));
      return callWithRetry(fn, retriesLeft - 1, attempt + 1, deadlineMs, timeoutMs);
    }
    throw err;
  }
}

const _staggerCounters = new Map<string, number>();
export function resetStaggerCounters() { _staggerCounters.clear(); }

export async function callPlatform(
  platform: Platform,
  query: string,
  // Optional absolute epoch-ms deadline for the enclosing scan (scan start +
  // 45s master timeout). Retries that would run past it fail fast instead.
  opts?: { deadlineMs?: number },
): Promise<string> {
  if (platform.staggerMs) {
    const idx = _staggerCounters.get(platform.name) ?? 0;
    _staggerCounters.set(platform.name, idx + 1);
    if (idx > 0) await new Promise(r => setTimeout(r, platform.staggerMs! * idx));
  }
  // Opted out (META_AI_SCAN_ENABLED=0): preserve the old stub behavior
  // exactly (''). Live by default — falls through to the key check below.
  if (platform.name === 'Meta AI' && !isMetaAIScanEnabled()) return '';
  if (!platform.apiKey) throw new Error(`${platform.name}: API key missing`);

  // Per-platform timeout (slower models like Kimi get longer). Bounded by the
  // scan's 45s master timeout regardless. A FRESH signal is minted per attempt
  // (retries) via sig() so a retried call isn't born already-aborted.
  const timeoutMs = platform.timeoutMs ?? TIMEOUT_MS;
  const sig = () => AbortSignal.timeout(timeoutMs);
  // All retries in this call share the scan deadline + this per-attempt timeout.
  const retry = (fn: () => Promise<Response>) =>
    callWithRetry(fn, undefined, 0, opts?.deadlineMs, timeoutMs);
  const prompt = `${query}\n\nPlease provide a helpful, concise answer. If this is asking about a local business, product, or brand recommendation, provide your best recommendation based on your knowledge.`;

  if (platform.name === 'ChatGPT' || platform.name === 'Copilot') {
    const res = await retry(() => fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal: sig(),
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${platform.apiKey}` },
      body: JSON.stringify({ model: platform.model, messages: [{ role: 'user', content: prompt }], temperature: 0, top_p: 1, max_tokens: 500 }),
    }));
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  if (platform.name === 'Gemini') {
    // Current models (2.5/2.0) first, then 1.5 as extra fallbacks. Each model gets
    // a FRESH timeout so a slow first attempt doesn't kill the fallbacks. Every
    // failure is logged so Vercel logs show exactly which model fails and why.
    // Only current models — the 1.5 family is deprecated and 404s, wasting retries.
    const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-3.5-flash'];
    const failures: string[] = [];
    for (const model of GEMINI_MODELS) {
      try {
        const res = await retry(() => fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${platform.apiKey}`,
          { method: 'POST', signal: sig(), headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 1000, temperature: 0, topP: 1 } }) }
        ));
        const data = await res.json();
        if (data.error || !res.ok) {
          const reason = data?.error?.message || `HTTP ${res.status}`;
          console.error('GEMINI ERROR:', model, res.status, reason);
          failures.push(`${model}: ${res.status} ${reason}`);
          // 401/403 = bad/forbidden key — no other model will help, fail fast.
          if (res.status === 401 || res.status === 403) {
            throw new Error(`Gemini auth error (${res.status}) — check GEMINI_API_KEY`);
          }
          continue;
        }
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (text) return text;
        failures.push(`${model}: empty response`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('auth error')) throw err; // propagate the auth failure
        console.error('GEMINI ERROR:', model, 'threw', msg);
        failures.push(`${model}: ${msg}`);
      }
    }
    throw new Error(`Gemini: all model fallbacks failed [${failures.join(' | ')}]`);
  }

  if (platform.name === 'Claude') {
    const res = await retry(() => fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: sig(),
      headers: { 'Content-Type': 'application/json', 'x-api-key': platform.apiKey!, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: platform.model, max_tokens: 500, temperature: 0, messages: [{ role: 'user', content: prompt }] }),
    }));
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[scan] platform error: Claude', res.status, errText.slice(0, 300));
      throw new Error(`Claude failed: ${res.status} ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.content?.[0]?.text || '';
  }

  if (platform.name === 'Groq') {
    const res = await retry(() => fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', signal: sig(),
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${platform.apiKey}` },
      body: JSON.stringify({ model: platform.model, messages: [{ role: 'user', content: prompt }], temperature: 0, top_p: 1, max_tokens: 500 }),
    }));
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  if (platform.name === 'Perplexity') {
    const res = await retry(() => fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST', signal: sig(),
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${platform.apiKey}` },
      body: JSON.stringify({ model: platform.model, messages: [{ role: 'user', content: prompt }], temperature: 0, top_p: 1, max_tokens: 500 }),
    }));
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  if (platform.name === 'Grok') {
    const res = await retry(() => fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST', signal: sig(),
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${platform.apiKey}` },
      // grok-3 is a reasoning model that thinks before answering (too slow for
      // a 15s cap). grok-3-mini with low reasoning effort answers in ~2-3x less
      // time — Rankall only needs a mention signal, not deep reasoning.
      body: JSON.stringify({ model: platform.model, messages: [{ role: 'user', content: prompt }], temperature: 0, top_p: 1, max_tokens: 500, reasoning_effort: 'low' }),
    }));
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  if (platform.name === 'DeepSeek') {
    const res = await retry(() => fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST', signal: sig(),
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${platform.apiKey}` },
      body: JSON.stringify({ model: platform.model, messages: [{ role: 'user', content: prompt }], temperature: 0, top_p: 1, max_tokens: 500 }),
    }));
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  if (platform.name === 'Mistral') {
    const res = await retry(() => fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST', signal: sig(),
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${platform.apiKey}` },
      body: JSON.stringify({ model: platform.model, messages: [{ role: 'user', content: prompt }], temperature: 0, top_p: 1, max_tokens: 500 }),
    }));
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[scan] platform error: Mistral', res.status, errText.slice(0, 300));
      throw new Error(`Mistral failed: ${res.status} ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  if (platform.name === 'Kimi') {
    // Keys can be region-bound. Try the .ai domain first; on 401/403 fall back to
    // the .cn domain. All failures are logged so they surface in Vercel logs.
    const KIMI_DOMAINS = [
      'https://api.moonshot.ai/v1/chat/completions',
      'https://api.moonshot.cn/v1/chat/completions',
    ];
    let lastErr = '';
    domainLoop: for (const url of KIMI_DOMAINS) {
      // aeb5: token-budget decision, explicit — first attempt keeps
      // max_tokens 300 (PR #29); an empty-content retry escalates to
      // 1000 (hackathon fix, Oct 27). Reasoning is non-deterministic and
      // shares the budget with the answer, so a second attempt with the
      // SAME 300 budget can be eaten the same way — the retry only helps
      // if the budget grows. If both attempts come back empty, the
      // descriptive throw below still fires and the scan route records
      // it (never error=null). Cost note: the cap is a ceiling, not a
      // spend — a call that answers in 200 tokens costs 200 tokens.
      for (let emptyAttempt = 0; emptyAttempt < 2; emptyAttempt++) {
      const maxTokens = emptyAttempt === 0 ? 300 : 1000;
      const res = await retry(() => fetch(url, {
        method: 'POST', signal: sig(),
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${platform.apiKey}` },
        body: JSON.stringify({ model: platform.model, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens }),
      }));
      if (!res.ok) {
        const errText = await res.text();
        console.error('KIMI ERROR:', res.status, url, errText);
        lastErr = `${res.status} ${errText}`;
        // Region-mismatch keys 401/403 on the wrong domain — try the other one.
        if ((res.status === 401 || res.status === 403) && url !== KIMI_DOMAINS[KIMI_DOMAINS.length - 1]) continue domainLoop;
        throw new Error(`Kimi failed: ${res.status}`);
      }
      const data = await res.json();
      if (data.error) {
        console.error('KIMI API ERROR:', data.error);
        throw new Error(`Kimi API error: ${data.error.message || data.error}`);
      }
      // Kimi is a thinking model: if reasoning consumes the token budget,
      // Moonshot returns HTTP 200 with empty content (finish_reason=length).
      // That must be a recorded error — never a silent '' return.
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        const finishReason = data.choices?.[0]?.finish_reason;
        const reasoning = data.choices?.[0]?.message?.reasoning_content;
        console.error('KIMI EMPTY CONTENT:', {
          choices: Array.isArray(data.choices) ? data.choices.length : 0,
          finish_reason: finishReason ?? null,
          contentLength: typeof content === 'string' ? content.length : 0,
          reasoningContentLength: typeof reasoning === 'string' ? reasoning.length : 0,
          emptyAttempt,
        });
        if (emptyAttempt === 0) {
          console.log('[scan] Kimi empty content — retrying once (fresh token budget)');
          continue;
        }
        throw new Error(`Kimi returned empty content (finish_reason=${finishReason ?? 'unknown'}; reasoning likely consumed token budget)`);
      }
      return content;
      }
    }
    throw new Error(`Kimi: all domains failed [${lastErr}]`);
  }

  if (platform.name === 'Google AI') {
    if (!platform.apiKey) throw new Error('Google AI: SERPAPI_KEY missing');
    // SerpAPI (Google AI Overview) — a search API, not an LLM: no temperature param.
    const params = new URLSearchParams({ q: query, api_key: platform.apiKey, gl: 'us', hl: 'en' });
    const res = await retry(() => fetch(`https://serpapi.com/search.json?${params}`, { method: 'GET', signal: sig() }));
    const data = await res.json();
    const aiOverview = data.ai_overview?.text_blocks?.map((b: any) => b.snippet || b.text || '').filter(Boolean).join(' ') || data.ai_overview?.snippet || '';
    if (aiOverview) return aiOverview;
    return data.organic_results?.[0]?.snippet || '';
  }

  if (platform.name === 'Meta AI') {
    // Meta Model API — OpenAI-compatible chat completions (same prompt
    // shape as the other platforms). Spark is a reasoning model: it spends
    // part of the token budget thinking first, so max_tokens is 4000
    // (a small budget returns empty content with the budget eaten by
    // reasoning — see the connector doc). Redirects are disabled so the
    // bearer credential can never leak to another host via redirect.
    // Standard tier only — never the -contributor tier (Meta trains on
    // contributor prompts/completions; scan data stays off it).
    const res = await retry(() => fetch('https://api.meta.ai/v1/chat/completions', {
      method: 'POST', signal: sig(), redirect: 'manual',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${platform.apiKey}` },
      body: JSON.stringify({ model: platform.model, messages: [{ role: 'user', content: prompt }], temperature: 0, top_p: 1, max_tokens: 4000 }),
    }));
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[scan] platform error: Meta AI', res.status, errText.slice(0, 300));
      throw new Error(`Meta AI failed: ${res.status} ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    if (!content) {
      throw new Error('Meta AI returned empty content (reasoning likely consumed token budget)');
    }
    return content;
  }

  throw new Error(`${platform.name}: unsupported platform`);
}
