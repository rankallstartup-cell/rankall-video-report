import { describe, it, expect, vi, afterEach } from 'vitest';
import { PLATFORMS, callPlatform } from '../platforms';

function mockRes(status: number, body: unknown = null, headers: Record<string, string> = {}): Response {
  return new Response(body === null ? null : JSON.stringify(body), { status, headers });
}

const okBody = { choices: [{ message: { content: 'hello' } }] };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('platform timeout config', () => {
  it('Grok gets a 15s timeout (was 8s default)', () => {
    expect(PLATFORMS.find(p => p.name === 'Grok')?.timeoutMs).toBe(15000);
  });

  it('Kimi gets a 25s timeout (was 14s)', () => {
    expect(PLATFORMS.find(p => p.name === 'Kimi')?.timeoutMs).toBe(25000);
  });
});

describe('Kimi token budget', () => {
  it('Kimi sends max_tokens 300 (was 500)', async () => {
    let sentBody = '';
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      sentBody = String(init?.body ?? '');
      return mockRes(200, okBody);
    });
    vi.stubGlobal('fetch', fetchMock);
    const kimi = PLATFORMS.find(p => p.name === 'Kimi')!;
    const text = await callPlatform({ ...kimi, apiKey: 'test-key' }, 'best dentist');
    expect(text).toBe('hello');
    const body = JSON.parse(sentBody);
    expect(body.max_tokens).toBe(300);
  });
});

describe('Retry-After handling (Mistral branch)', () => {
  it('honors Retry-After: waits ~10s, not the 1s default backoff', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockRes(429, null, { 'Retry-After': '10' }))
      .mockResolvedValueOnce(mockRes(200, okBody));
    vi.stubGlobal('fetch', fetchMock);
    const mistral = PLATFORMS.find(p => p.name === 'Mistral')!;
    const p = callPlatform({ ...mistral, apiKey: 'test-key' }, 'best dentist');
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(1); // still waiting out Retry-After
    await vi.advanceTimersByTimeAsync(11000);
    await expect(p).resolves.toBe('hello');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('honors Retry-After in full, uncapped (Retry-After: 120)', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockRes(429, null, { 'Retry-After': '120' }))
      .mockResolvedValueOnce(mockRes(200, okBody));
    vi.stubGlobal('fetch', fetchMock);
    const mistral = PLATFORMS.find(p => p.name === 'Mistral')!;
    const p = callPlatform({ ...mistral, apiKey: 'test-key' }, 'best dentist');
    // Jitter is ±20%, so the 120s wait fires between 96s and 144s.
    await vi.advanceTimersByTimeAsync(95000);
    expect(fetchMock).toHaveBeenCalledTimes(1); // uncapped 120s wait not yet over
    await vi.advanceTimersByTimeAsync(50000);
    await expect(p).resolves.toBe('hello');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('skips the retry when it would exceed the scan deadline (fail fast)', async () => {
    const fetchMock = vi.fn(async () => mockRes(429, null, { 'Retry-After': '5' }));
    vi.stubGlobal('fetch', fetchMock);
    const mistral = PLATFORMS.find(p => p.name === 'Mistral')!;
    await expect(
      callPlatform({ ...mistral, apiKey: 'test-key' }, 'best dentist', { deadlineMs: Date.now() + 3000 }),
    ).rejects.toThrow(/429/);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no retry attempted
  });

  it('still retries 5xx once', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockRes(500))
      .mockResolvedValueOnce(mockRes(200, okBody));
    vi.stubGlobal('fetch', fetchMock);
    const mistral = PLATFORMS.find(p => p.name === 'Mistral')!;
    const p = callPlatform({ ...mistral, apiKey: 'test-key' }, 'best dentist');
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(p).resolves.toBe('hello');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('Kimi empty content retry (aeb5)', () => {
  const emptyBody = { choices: [{ message: { content: '', reasoning_content: 'thinking...' }, finish_reason: 'length' }] };
  it('retries once on 200-empty, then returns content', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockRes(200, emptyBody))
      .mockResolvedValueOnce(mockRes(200, okBody));
    vi.stubGlobal('fetch', fetchMock);
    const kimi = PLATFORMS.find(p => p.name === 'Kimi')!;
    await expect(callPlatform({ ...kimi, apiKey: 'test-key' }, 'best dentist')).resolves.toBe('hello');
    expect(fetchMock).toHaveBeenCalledTimes(2); // 1 retry, same domain
  });

  it('throws a descriptive error after two empties, with finish_reason', async () => {
    const fetchMock = vi.fn(async () => mockRes(200, emptyBody));
    vi.stubGlobal('fetch', fetchMock);
    const kimi = PLATFORMS.find(p => p.name === 'Kimi')!;
    await expect(
      callPlatform({ ...kimi, apiKey: 'test-key' }, 'best dentist'),
    ).rejects.toThrow(/finish_reason=length/);
    expect(fetchMock).toHaveBeenCalledTimes(2); // 1 retry, then throw
  });

  it('escalates the token budget on the empty retry (300 -> 1000)', async () => {
    const bodies: number[] = [];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? '')).max_tokens);
      return bodies.length === 1 ? mockRes(200, emptyBody) : mockRes(200, okBody);
    });
    vi.stubGlobal('fetch', fetchMock);
    const kimi = PLATFORMS.find(p => p.name === 'Kimi')!;
    await expect(callPlatform({ ...kimi, apiKey: 'test-key' }, 'best dentist')).resolves.toBe('hello');
    expect(bodies).toEqual([300, 1000]);
  });
});
