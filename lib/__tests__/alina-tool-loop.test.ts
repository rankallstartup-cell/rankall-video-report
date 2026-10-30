// A6 — tool loop: one validated function per tool, max 3 calls per reply,
// typed failures, identity from the session only (never client/model
// userId), max_tokens 800 for the answer.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => { throw new Error('no db in tests'); } }));
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 10, limit: 15 })) }));
vi.mock('@/lib/emailTemplates', () => ({ sendEmail: vi.fn(async () => true) }));
vi.mock('@/lib/apiAuth', () => ({ getSessionUser: vi.fn(async () => null) }));
vi.mock('@/lib/alinaLogging', () => ({ logChatSession: vi.fn(async () => {}), logChatLead: vi.fn(async () => {}) }));

import { executeAlinaTool } from '@/lib/alinaTools';
import { POST } from '@/app/api/chat/route';
import { sendEmail } from '@/lib/emailTemplates';
import { logChatSession, logChatLead } from '@/lib/alinaLogging';

const mockedSend = sendEmail as unknown as ReturnType<typeof vi.fn>;
const mockedLogSession = logChatSession as unknown as ReturnType<typeof vi.fn>;
const mockedLogLead = logChatLead as unknown as ReturnType<typeof vi.fn>;

function post(body: unknown) {
  return POST(new NextRequest('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.9' },
    body: JSON.stringify(body),
  }));
}

function anthropicReply(content: unknown[]) {
  return new Response(JSON.stringify({ content }), { status: 200 });
}

describe('executeAlinaTool', () => {
  beforeEach(() => { vi.clearAllMocks(); mockedSend.mockResolvedValue(true); });

  it('get_pricing returns typed ok + data; unknown need is a typed failure', async () => {
    const ok = await executeAlinaTool({ id: 't1', name: 'get_pricing', input: { need: 'agency' } }, { userId: null, email: null });
    expect(ok.isError).toBe(false);
    expect(JSON.parse(ok.content).data.tiers).toEqual([expect.objectContaining({ name: 'Agency', monthly: 259 })]);
    const bad = await executeAlinaTool({ id: 't2', name: 'get_pricing', input: { need: 'platinum' } }, { userId: null, email: null });
    expect(bad.isError).toBe(true);
    expect(JSON.parse(bad.content).ok).toBe(false);
  });

  it('unknown tool is a typed failure, never a throw', async () => {
    const r = await executeAlinaTool({ id: 't1', name: 'delete_everything', input: {} }, { userId: null, email: null });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toContain('Unknown tool');
  });

  it('capture_lead validates input (typed failure) and strips a hallucinated userId', async () => {
    const invalid = await executeAlinaTool(
      { id: 't1', name: 'capture_lead', input: { name: 'Dana', summary: 'Demo', reason: 'demo' } },
      { userId: null, email: null },
    );
    expect(invalid.isError).toBe(true);
    expect(JSON.parse(invalid.content).error).toContain('email');

    const ok = await executeAlinaTool(
      { id: 't2', name: 'capture_lead', input: { name: 'Dana', email: 'dana@example.com', summary: 'Demo', reason: 'demo', userId: 'victim-id' } },
      { userId: null, email: null },
    );
    expect(ok.isError).toBe(false);
    const html = (mockedSend.mock.calls[0][0] as { html: string }).html;
    expect(html).not.toContain('victim-id');
    expect(ok.capturedLead).toEqual({
      lead: expect.objectContaining({ name: 'Dana', email: 'dana@example.com' }),
      captured: true,
    });
  });

  it('capture_lead delivery failure is a typed failure with the lead recorded', async () => {
    mockedSend.mockResolvedValue(false);
    const r = await executeAlinaTool(
      { id: 't1', name: 'capture_lead', input: { name: 'Dana', email: 'dana@example.com', summary: 'Demo', reason: 'demo' } },
      { userId: null, email: null },
    );
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content).error).toContain('hello@rankall.io');
    expect(r.capturedLead?.captured).toBe(false);
  });
});

describe('chat route tool loop', () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSend.mockResolvedValue(true);
    process.env.ANTHROPIC_API_KEY = 'sk-test';
  });
  afterEach(() => { global.fetch = realFetch; delete process.env.ANTHROPIC_API_KEY; });

  it('runs a tool round-trip: tool_use -> typed result -> text answer + PricingCard block', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(anthropicReply([{ type: 'tool_use', id: 'tu1', name: 'get_pricing', input: { need: 'agency' } }]))
      .mockResolvedValueOnce(anthropicReply([{ type: 'text', text: 'Agency is $259/mo.' }]));
    global.fetch = fetchMock as never;
    const res = await post({ messages: [{ role: 'user', content: 'I run a dental chain, what should I buy?' }] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reply).toBe('Agency is $259/mo.');
    // No deterministic pricing block (message has no pricing intent) —
    // the card comes from the tool result.
    expect(body.blocks).toEqual([{ kind: 'pricing', tiers: [expect.objectContaining({ name: 'Agency' })], trial: expect.anything() }]);
    // Second call carries the tool_result with the real pricing data.
    const secondBody = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    const toolResult = secondBody.messages.at(-1).content[0];
    expect(toolResult.type).toBe('tool_result');
    expect(JSON.parse(toolResult.content).data.tiers[0].monthly).toBe(259);
    // Both calls use max_tokens 800.
    for (const call of fetchMock.mock.calls) {
      expect(JSON.parse(String((call[1] as RequestInit).body)).max_tokens).toBe(800);
    }
    // Logging records the tool actually used.
    expect(mockedLogSession).toHaveBeenCalledWith(expect.objectContaining({ toolsUsed: ['get_pricing'], outcome: 'no_outcome' }));
  });

  it('caps at 3 tool calls per reply, then makes a final no-tools call', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const sent = JSON.parse(String(init?.body ?? '{}'));
      if (!sent.tools) return anthropicReply([{ type: 'text', text: 'Final answer.' }]);
      return anthropicReply([{ type: 'tool_use', id: `tu-${Math.random()}`, name: 'get_pricing', input: {} }]);
    });
    global.fetch = fetchMock as never;
    const res = await post({ messages: [{ role: 'user', content: 'Tell me everything' }] });
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toBe('Final answer.');
    // 3 tool rounds + 1 final no-tools call = 4 model calls.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const lastBody = JSON.parse(String((fetchMock.mock.calls[3][1] as RequestInit).body));
    expect(lastBody.tools).toBeUndefined();
    // Exactly 3 tool executions: count DISTINCT tool_use_ids across all
    // calls (later calls re-send the accumulated history, so counting
    // raw tool_result blocks would double-count: 1 + 2 + 3 = 6).
    const toolUseIds = new Set(fetchMock.mock.calls.flatMap((call) => {
      const sent = JSON.parse(String((call[1] as RequestInit).body));
      return (sent.messages as Array<{ content?: unknown }>).flatMap((m) =>
        Array.isArray(m.content) ? m.content : [],
      );
    }).filter((c: { type?: string }) => c.type === 'tool_result')
      .map((c: { tool_use_id?: string }) => c.tool_use_id));
    expect(toolUseIds.size).toBe(3);
  });

  it('a typed tool failure reaches the model as is_error and it can recover', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(anthropicReply([{ type: 'tool_use', id: 'tu1', name: 'capture_lead', input: { name: 'Dana', summary: 'Demo', reason: 'demo' } }]))
      .mockResolvedValueOnce(anthropicReply([{ type: 'text', text: 'What email should I use?' }]));
    global.fetch = fetchMock as never;
    const res = await post({ messages: [{ role: 'user', content: 'Book me a demo, I am Dana' }] });
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toBe('What email should I use?');
    const secondBody = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    const toolResult = secondBody.messages.at(-1).content[0];
    expect(toolResult.is_error).toBe(true);
    expect(JSON.parse(toolResult.content).error).toContain('email');
  });

  it('a loop capture_lead logs the lead row + lead_captured outcome', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(anthropicReply([{ type: 'tool_use', id: 'tu1', name: 'capture_lead', input: { name: 'Dana', email: 'dana@example.com', summary: 'Demo', reason: 'demo' } }]))
      .mockResolvedValueOnce(anthropicReply([{ type: 'text', text: 'Thanks — the team has your note.' }]));
    global.fetch = fetchMock as never;
    const res = await post({ messages: [{ role: 'user', content: 'I am Dana, dana@example.com, book me a demo' }] });
    expect(res.status).toBe(200);
    expect(mockedLogLead).toHaveBeenCalledWith(expect.objectContaining({ captured: true }));
    expect(mockedLogSession).toHaveBeenCalledWith(expect.objectContaining({ toolsUsed: ['capture_lead'], outcome: 'lead_captured' }));
  });

  it('a client-supplied userId is 403 on both paths', async () => {
    global.fetch = vi.fn() as never;
    expect((await post({ userId: 'forged', messages: [{ role: 'user', content: 'hi' }] })).status).toBe(403);
    expect((await post({ userId: 'forged', lead: { name: 'D', email: 'd@e.com', summary: 'x', reason: 'demo' } })).status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('a model failure mid-loop falls back honestly with the deterministic blocks', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(anthropicReply([{ type: 'tool_use', id: 'tu1', name: 'get_pricing', input: {} }]))
      .mockResolvedValueOnce(new Response('bad gateway', { status: 502 }));
    global.fetch = fetchMock as never;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await post({ messages: [{ role: 'user', content: 'How much?' }] });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain('hello@rankall.io');
    // Deterministic pricing block still attached.
    expect(body.blocks[0].kind).toBe('pricing');
    err.mockRestore();
  });
});
