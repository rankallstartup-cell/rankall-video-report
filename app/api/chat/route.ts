import { NextRequest, NextResponse } from 'next/server';
import { buildAlinaPrompt } from '@/lib/constants';
import { FOUNDER_PRICING_USD, PLATFORMS_SCANNED, TRUST_SIGNALS_LABEL, SCAN_TIME_LABEL } from '@/lib/publicStats';
import { sanitizeChatMessages } from '@/lib/chatInput';
import { checkRateLimit } from '@/lib/rateLimit';
import { getSupabaseAdmin } from '@/lib/supabase';
import { clientIp, allowByDbLimit } from '@/lib/publicFormGuard';
// A3: deterministic pricing block (server-computed ground truth). The
// block is attached on every answer path — including the model-failure
// fallbacks — so a pricing question still gets the true price when the
// model is down. A6's tool loop is ADDITIVE: the model can also call
// get_pricing, and the route dedupes the resulting card.
import {
  getPricingBlock,
  getLeadBlock,
  validateLead,
  captureLead,
  ALINA_TOOL_DEFS,
  executeAlinaTool,
  type ChatBlock,
  type LeadInput,
} from '@/lib/alinaTools';
// A6: server-derived identity for tools (session cookies, never a body
// userId). Tools that need ownership use it; get_pricing / capture_lead
// ignore it.
import { getSessionUser } from '@/lib/apiAuth';
// A5: best-effort session/lead logging — never throws, never blocks the
// chat or lead flow when the tables don't exist yet (migration not run).
import { logChatSession, logChatLead, type ChatOutcome } from '@/lib/alinaLogging';

// Alina chatbot proxy. The widget used to call api.anthropic.com straight
// from the browser with no API key (every request failed — and putting a
// key there would have leaked it). The key now stays server-side.
// A7: maxDuration 60 (was 30) — start_free_scan dispatches the real scan
// route, whose own master timeout is 45s.
export const maxDuration = 60;

// Same model id the other server routes use (detect-query, social, …).
const MODEL = 'claude-haiku-4-5-20251001';
const FALLBACK = "Sorry, I'm having trouble answering right now. Please email hello@rankall.io and we'll help.";

const ALINA_PROMPT = buildAlinaPrompt({
  tiers: FOUNDER_PRICING_USD,
  platformsScanned: PLATFORMS_SCANNED,
  trustSignalsLabel: TRUST_SIGNALS_LABEL,
  scanTimeLabel: SCAN_TIME_LABEL,
});

// Per-IP limits: burst (in-memory, per instance) + daily (DB, durable).
const BURST_LIMIT = 15;
const BURST_WINDOW_MS = 10 * 60 * 1000;
const DAILY_LIMIT = 60;
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

// Shared burst + daily per-IP limit for both paths (chat messages and
// LeadForm submissions). Same behavior as before the A4 split.
async function checkChatLimits(req: NextRequest): Promise<{ limited: true } | { limited: false }> {
  const ip = clientIp(req.headers);
  const burst = checkRateLimit(`chat:${ip}`, null, { limit: BURST_LIMIT, windowMs: BURST_WINDOW_MS });
  let dailyOk = true;
  if (burst.allowed) {
    try {
      dailyOk = await allowByDbLimit(getSupabaseAdmin(), 'chat', ip, DAILY_LIMIT, DAILY_WINDOW_MS);
    } catch (err) {
      console.error('[chat] DB limiter unavailable', err instanceof Error ? err.message : err);
    }
  }
  return burst.allowed && dailyOk ? { limited: false } : { limited: true };
}

const RATE_LIMITED = {
  error: "You've sent a lot of messages — please try again later or email hello@rankall.io.",
};

function bodyMeta(body: unknown): { sessionId: string; page: string; scanId: string; stream: boolean } {
  const o = (body ?? {}) as Record<string, unknown>;
  // A9: the scan ID comes from the widget's own URL (report page). Only
  // a UUID-shaped value is accepted — a crafted client value must not be
  // able to inject prompt text into the system prompt.
  const rawScanId = typeof o.scanId === 'string' ? o.scanId : '';
  const scanId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawScanId) ? rawScanId : '';
  return {
    sessionId: typeof o.sessionId === 'string' ? o.sessionId.slice(0, 128) : '',
    page: typeof o.page === 'string' ? o.page.slice(0, 512) : '',
    scanId,
    stream: o.stream === true,
  };
}

// A9: page + scan/report context for the model. Appended to the SYSTEM
// prompt, never to the user history — it is not part of the conversation.
function pageContext(page: string, scanId: string): string {
  const lines: string[] = [];
  if (page) lines.push(`The visitor is on page ${page}.`);
  if (scanId) {
    lines.push(
      `This page is about scan ${scanId} — when the visitor asks about this scan, this report, "my score", or "what should I fix", use this scan ID for get_scan_summary / explain_score / get_fix_plan. Never ask the visitor for a scan ID they did not type.`,
    );
  }
  return lines.length ? `\n\n[PAGE CONTEXT]\n${lines.join('\n')}` : '';
}

// A9: one Anthropic message call, JSON or streaming. Streaming parses the
// SSE event stream into the SAME content-block shape as the JSON path
// (text / tool_use blocks) and forwards text deltas as they arrive.
type AnthropicContentBlock = { type?: string; text?: string; id?: string; name?: string; input?: unknown };

async function parseAnthropicStream(
  res: Response,
  onDelta?: (text: string) => void,
): Promise<AnthropicContentBlock[]> {
  const reader = res.body?.getReader();
  if (!reader) return [];
  const decoder = new TextDecoder();
  let buffer = '';
  const textParts = new Map<number, string>();
  const toolBlocks = new Map<number, { id: string; name: string; json: string }>();
  const order: number[] = [];
  const flushLine = (line: string) => {
    if (!line.startsWith('data: ')) return;
    const payload = line.slice(6).trim();
    if (!payload || payload === '[DONE]') return;
    let event: { type?: string; index?: number; delta?: { type?: string; text?: string; partial_json?: string }; content_block?: { type?: string; id?: string; name?: string } };
    try {
      event = JSON.parse(payload) as typeof event;
    } catch {
      return;
    }
    if (event.type === 'content_block_start' && typeof event.index === 'number') {
      const block = event.content_block;
      if (!order.includes(event.index)) order.push(event.index);
      if (block?.type === 'tool_use') {
        toolBlocks.set(event.index, { id: block.id ?? '', name: block.name ?? '', json: '' });
      }
    } else if (event.type === 'content_block_delta' && typeof event.index === 'number') {
      const delta = event.delta;
      if (delta?.type === 'text_delta' && delta.text) {
        textParts.set(event.index, (textParts.get(event.index) ?? '') + delta.text);
        onDelta?.(delta.text);
      } else if (delta?.type === 'input_json_delta' && delta.partial_json) {
        const tool = toolBlocks.get(event.index);
        if (tool) tool.json += delta.partial_json;
      }
    } else if (event.type === 'error') {
      throw new Error('Anthropic stream error');
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      flushLine(line);
      newline = buffer.indexOf('\n');
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) flushLine(buffer.trim());
  return order.map((index) => {
    const tool = toolBlocks.get(index);
    if (tool) {
      let input: unknown = {};
      try {
        input = tool.json ? JSON.parse(tool.json) : {};
      } catch {
        input = {};
      }
      return { type: 'tool_use', id: tool.id, name: tool.name, input };
    }
    return { type: 'text', text: textParts.get(index) ?? '' };
  });
}

// A6: tool-loop bounds. Max 3 tool calls per reply; the whole loop must
// finish inside maxDuration (60s), so the internal deadline is 52s and
// each model call gets min(20s, remaining). A7: the deadline is 52s
// (was 22s) because a scan tool can take ~45s; the deadline gates MODEL
// calls, not tool execution — after a scan completes, the deterministic
// scan text + ScanCard answer even if the deadline has passed.
const MAX_TOOL_CALLS = 3;
const LOOP_DEADLINE_MS = 52_000;
const MODEL_CALL_TIMEOUT_MS = 20_000;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { messages?: unknown; lead?: unknown; sessionId?: unknown; page?: unknown; scanId?: unknown; stream?: unknown; userId?: unknown } | null;
  const { sessionId, page, scanId, stream: streamMode } = bodyMeta(body);
  // A9: page + scan context appended to the system prompt (not the history).
  const system = ALINA_PROMPT + pageContext(page, scanId);

  // A6: a client-supplied userId is a forgery attempt — identity comes
  // from the session only. Reject before any path runs. The widget never
  // sends userId, so legitimate traffic is unaffected.
  if (body && typeof body === 'object' && 'userId' in body) {
    return NextResponse.json({ error: 'userId must come from the session, not the client.' }, { status: 403 });
  }

  // A4: LeadForm submissions (no new endpoint — tools stay internal to
  // the chat route). Invalid input → 400. Delivery failure → 200 with
  // { captured: false } so the widget shows the honest hello@rankall.io
  // fallback, never a fake confirmation.
  if (body && typeof body === 'object' && 'lead' in body) {
    if ((await checkChatLimits(req)).limited) {
      return NextResponse.json(RATE_LIMITED, { status: 429 });
    }
    const validated = validateLead(body.lead);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }
    const result = await captureLead(validated.lead);
    // A5: log the lead + the session turn. Logging never changes the
    // captured result — it is a record, not the delivery.
    await logChatLead({ sessionId, lead: validated.lead, captured: result.captured });
    await logChatSession({
      sessionId,
      page,
      toolsUsed: ['capture_lead'],
      outcome: result.captured ? 'lead_captured' : 'error',
    });
    return NextResponse.json({ captured: result.captured });
  }

  const messages = sanitizeChatMessages(body?.messages);
  if (!messages) {
    return NextResponse.json({ error: 'Please type a question.' }, { status: 400 });
  }

  if ((await checkChatLimits(req)).limited) {
    return NextResponse.json(RATE_LIMITED, { status: 429 });
  }

  // A3/A4: blocks are computed from the visitor's own last message — no
  // model needed, so they survive a model outage (attached below on
  // 503/502 too). Pricing wins over escalation: "Enterprise pricing"
  // gets a pricing card, not a lead form.
  const lastUserText = messages[messages.length - 1]?.content ?? '';
  const pricingBlock = getPricingBlock(lastUserText);
  const leadBlock = pricingBlock ? null : getLeadBlock(lastUserText);
  const blocks: ChatBlock[] = pricingBlock ? [pricingBlock] : leadBlock ? [leadBlock] : [];

  // A6: tool loop. The model may emit tool_use blocks; the route executes
  // them server-side (max 3 tool calls per reply) and feeds typed results
  // back until the model answers in text. The final answer gets
  // max_tokens 800 (was 400). A model failure on ANY round falls back to
  // the honest error + the deterministic blocks.
  const identity = await getSessionUser(req);
  const loopToolsUsed: string[] = pricingBlock ? ['get_pricing'] : [];
  let capturedLead: { lead: LeadInput; captured: boolean } | null = null;
  // A7: the request context a scan tool dispatches with — the visitor's
  // own headers + trusted IP, so a chat scan is metered like a homepage
  // scan. Built once, passed to every tool execution.
  const toolCtx = {
    headers: Object.fromEntries(req.headers.entries()),
    clientIp: clientIp(req.headers),
  };
  let status = 200;
  let payload: { reply?: string; error?: string; blocks: ChatBlock[] };
  let outcome: ChatOutcome = 'no_outcome';

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[chat] ANTHROPIC_API_KEY is not set');
    status = 503;
    payload = { error: FALLBACK, blocks };
    outcome = 'error';
    // A5 logging still applies on the no-key path (both modes — the
    // widget falls back to JSON when the response is not SSE).
    await logChatSession({ sessionId, page, toolsUsed: loopToolsUsed, outcome });
    return NextResponse.json(payload, { status });
  }

  // A9: one model call (JSON or streaming) returning the same content
  // blocks. Streaming forwards text deltas as they arrive.
  async function callModel(
    working: Array<{ role: string; content: unknown }>,
    offerTools: boolean,
    remaining: number,
    onDelta?: (text: string) => void,
  ): Promise<{ ok: true; content: AnthropicContentBlock[] } | { ok: false }> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey as string,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 800,
        system,
        ...(offerTools ? { tools: ALINA_TOOL_DEFS } : {}),
        ...(streamMode ? { stream: true } : {}),
        messages: working,
      }),
      signal: AbortSignal.timeout(streamMode ? remaining : Math.min(MODEL_CALL_TIMEOUT_MS, remaining)),
    });
    if (!res.ok) {
      console.error('[chat] Anthropic error', res.status);
      return { ok: false };
    }
    if (!streamMode) {
      const data = (await res.json()) as { content?: AnthropicContentBlock[] };
      return { ok: true, content: data.content ?? [] };
    }
    return { ok: true, content: await parseAnthropicStream(res, onDelta) };
  }

  // The tool loop, shared by the JSON and streaming paths. Returns the
  // payload + outcome; the caller logs and delivers it.
  async function runLoop(
    initialMessages: Array<{ role: string; content: string }>,
    onDelta?: (text: string) => void,
    onStatus?: (text: string) => void,
  ): Promise<{
    payload: { reply?: string; error?: string; blocks: ChatBlock[] };
    outcome: ChatOutcome;
    status: number;
    toolsUsed: string[];
    capturedLead: { lead: LeadInput; captured: boolean } | null;
  }> {
    const working: Array<{ role: string; content: unknown }> = [...initialMessages];
    let toolCalls = 0;
    let reply: string | null = null;
    let lastText = '';
    let failed = false;
    let loopOutcome: ChatOutcome = 'no_outcome';
    let loopStatus = 200;
    let loopPayload: { reply?: string; error?: string; blocks: ChatBlock[] };
    const deadline = Date.now() + LOOP_DEADLINE_MS;
    for (let round = 0; round < 4 && !reply && !failed; round++) {
      const remaining = deadline - Date.now();
      if (remaining < 2000) break;
      const offerTools = toolCalls < MAX_TOOL_CALLS;
      try {
        const called = await callModel(working, offerTools, remaining, onDelta);
        if (!called.ok) {
          failed = true;
          break;
        }
        const content = called.content;
        const textParts = content.filter((c) => c.type === 'text' && c.text).map((c) => c.text as string);
        if (textParts.length) lastText = textParts.join('\n');
        const toolUses = content.filter((c) => c.type === 'tool_use' && c.id && c.name);
        if (toolUses.length === 0 || !offerTools) {
          reply = lastText.trim() || null;
          break;
        }
        const batch = toolUses.slice(0, MAX_TOOL_CALLS - toolCalls);
        // A9: while tools run, the widget shows a status line instead of
        // bare typing dots (a scan can take ~45s).
        onStatus?.(batch.some((tu) => tu.name === 'start_free_scan')
          ? 'Running your scan — this can take up to a minute.'
          : 'Looking that up…');
        const results = [];
        for (const tu of batch) {
          const executed = await executeAlinaTool(
            { id: tu.id as string, name: tu.name as string, input: tu.input },
            { userId: identity?.id ?? null, email: identity?.email ?? null },
            toolCtx,
          );
          toolCalls++;
          if (!loopToolsUsed.includes(executed.toolName)) loopToolsUsed.push(executed.toolName);
          if (executed.pricingData && !pricingBlock) {
            blocks.push({ kind: 'pricing', ...executed.pricingData });
          }
          if (executed.scanCard) {
            // A7: one ScanCard per turn — a second scan tool in the same
            // turn replaces the first card (the latest scan is the answer).
            const existing = blocks.findIndex((b) => b.kind === 'scan');
            if (existing >= 0) blocks[existing] = { kind: 'scan', scan: executed.scanCard };
            else blocks.push({ kind: 'scan', scan: executed.scanCard });
          }
          if (executed.fixPlan) {
            // A8: one FixPlanCard per turn — a second fix-plan tool in the
            // same turn replaces the first card.
            const existing = blocks.findIndex((b) => b.kind === 'fix_plan');
            if (existing >= 0) blocks[existing] = { kind: 'fix_plan', plan: executed.fixPlan };
            else blocks.push({ kind: 'fix_plan', plan: executed.fixPlan });
          }
          if (executed.draft) {
            // A10: one DraftCard per turn.
            const existing = blocks.findIndex((b) => b.kind === 'draft');
            if (existing >= 0) blocks[existing] = { kind: 'draft', draft: executed.draft };
            else blocks.push({ kind: 'draft', draft: executed.draft });
          }
          if (executed.verification) {
            // A10: one VerificationCard per turn.
            const existing = blocks.findIndex((b) => b.kind === 'verification');
            if (existing >= 0) blocks[existing] = { kind: 'verification', verification: executed.verification };
            else blocks.push({ kind: 'verification', verification: executed.verification });
          }
          if (executed.capturedLead) capturedLead = executed.capturedLead;
          results.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: executed.content,
            ...(executed.isError ? { is_error: true } : {}),
          });
        }
        working.push({ role: 'assistant', content });
        working.push({ role: 'user', content: results });
      } catch (err) {
        console.error('[chat] request failed', err instanceof Error ? err.message : err);
        failed = true;
        break;
      }
    }
    if (!reply && lastText.trim() && !failed) {
      // Loop exhausted (round cap) with text seen — use it.
      reply = lastText.trim();
    }
    // A7: a completed scan answers itself even when the model never got
    // a final call (deadline passed during the ~45s scan). Deterministic
    // text from the scan's own data + the ScanCard block.
    const scanCard = blocks.find((b) => b.kind === 'scan');
    if (!reply && scanCard && scanCard.kind === 'scan') {
      const s = scanCard.scan;
      reply = `Your scan is done — ${s.businessName} scores ${s.score}/100, mentioned on ${s.mentionedCount} of ${s.respondedCount} responding platforms.${s.partial ? ` ${s.missingPlatforms.length > 0 ? `${s.missingPlatforms.join(', ')} did not respond, so` : 'Some platforms did not respond, so'} the score is based on the platforms that did.` : ''}`;
    }
    if (reply) {
      loopPayload = { reply, blocks };
      const fixPlanCard = blocks.find((b) => b.kind === 'fix_plan');
      // A10: a draft / verification card is a fix-plan outcome (the
      // chat_sessions CHECK has no draft/verification value, and both
      // are fix-plan-adjacent). No migration change needed.
      const fixOutcomeCard = fixPlanCard
        || blocks.find((b) => b.kind === 'draft')
        || blocks.find((b) => b.kind === 'verification');
      if (scanCard) {
        loopOutcome = 'scan_started';
      } else if (fixOutcomeCard) {
        loopOutcome = 'fix_plan_shown';
      } else if (capturedLead) {
        loopOutcome = capturedLead.captured ? 'lead_captured' : 'error';
      }
    } else {
      loopStatus = 502;
      loopPayload = { error: FALLBACK, blocks };
      loopOutcome = 'error';
    }
    return {
      payload: loopPayload,
      outcome: loopOutcome,
      status: loopStatus,
      toolsUsed: loopToolsUsed,
      capturedLead,
    };
  }

  // A5: one log call per turn. A loop capture also writes its lead row.
  async function logTurn(result: {
    outcome: ChatOutcome;
    toolsUsed: string[];
    capturedLead: { lead: LeadInput; captured: boolean } | null;
  }): Promise<void> {
    if (result.capturedLead) {
      await logChatLead({ sessionId, lead: result.capturedLead.lead, captured: result.capturedLead.captured });
    }
    await logChatSession({ sessionId, page, toolsUsed: result.toolsUsed, outcome: result.outcome });
  }

  // A9: streaming delivery. The Response is returned immediately and the
  // loop runs inside the stream, so deltas reach the widget as they
  // arrive. The JSON path runs the same loop and returns one response.
  if (streamMode) {
    const encoder = new TextEncoder();
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
    const emit = (obj: unknown) => {
      streamController?.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
    };
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        streamController = controller;
        try {
          const result = await runLoop(
            messages,
            (delta) => emit({ type: 'text', delta }),
            (text) => emit({ type: 'status', text }),
          );
          emit({ type: 'done', reply: result.payload.reply ?? result.payload.error ?? '', blocks: result.payload.blocks });
          await logTurn(result);
        } catch (err) {
          console.error('[chat] stream failed', err instanceof Error ? err.message : err);
          emit({ type: 'error', error: FALLBACK });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }
  const result = await runLoop(messages);
  await logTurn(result);
  return NextResponse.json(result.payload, { status: result.status });
}
