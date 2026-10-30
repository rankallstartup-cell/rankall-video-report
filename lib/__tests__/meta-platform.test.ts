// Meta AI as the 12th scanned platform (hackathon, live by default).
// Same contract as the other platforms: same prompt shape, same
// timeout/retry plumbing, same mention extraction downstream.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { PLATFORMS, ACTIVE_PLATFORMS, callPlatform, isMetaAIScanEnabled } from '../platforms';

function mockRes(status: number, body: unknown = null, headers: Record<string, string> = {}): Response {
  return new Response(body === null ? null : JSON.stringify(body), { status, headers });
}

const okBody = { choices: [{ message: { content: 'Tech Ridge Dental is a top pick' } }] };

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.META_AI_SCAN_ENABLED;
});

describe('Meta AI live by default', () => {
  it('isMetaAIScanEnabled() is true when the flag is unset', () => {
    expect(isMetaAIScanEnabled()).toBe(true);
  });

  it('isMetaAIScanEnabled() is false only when the flag is 0', () => {
    process.env.META_AI_SCAN_ENABLED = '0';
    expect(isMetaAIScanEnabled()).toBe(false);
  });

  it('Meta AI is in ACTIVE_PLATFORMS by default (12 platforms)', () => {
    expect(ACTIVE_PLATFORMS.map(p => p.name)).toContain('Meta AI');
    expect(ACTIVE_PLATFORMS).toHaveLength(12);
  });

  it('Meta AI entry declares the real model, weight, and timeout', () => {
    const meta = PLATFORMS.find(p => p.name === 'Meta AI')!;
    expect(meta.model).toBe('muse-spark-1.3');
    expect(meta.weight).toBe(0.05 / 1.05); // renormalized Oct 26: pre-Meta weight / 1.05
    expect(meta.timeoutMs).toBe(20000);
  });

  it('opted out (flag 0): Meta AI leaves ACTIVE_PLATFORMS on re-import', async () => {
    process.env.META_AI_SCAN_ENABLED = '0';
    vi.resetModules();
    const mod = await import('../platforms');
    expect(mod.ACTIVE_PLATFORMS.map(p => p.name)).not.toContain('Meta AI');
    expect(mod.ACTIVE_PLATFORMS).toHaveLength(11);
  });

  it('opted out: callPlatform returns the old stub empty string', async () => {
    process.env.META_AI_SCAN_ENABLED = '0';
    const meta = PLATFORMS.find(p => p.name === 'Meta AI')!;
    await expect(callPlatform({ ...meta, apiKey: undefined }, 'best dentist')).resolves.toBe('');
  });
});

describe('Meta AI scan call (live)', () => {
  it('missing key throws an honest error, never a silent empty string', async () => {
    const meta = PLATFORMS.find(p => p.name === 'Meta AI')!;
    await expect(callPlatform({ ...meta, apiKey: undefined }, 'best dentist')).rejects.toThrow('Meta AI: API key missing');
  });

  it('calls api.meta.ai chat completions with the scan prompt shape', async () => {
    let url = '';
    let sentBody = '';
    let auth = '';
    let redirect: string | undefined;
    const fetchMock = vi.fn(async (u: string, init?: RequestInit) => {
      url = String(u);
      sentBody = String(init?.body ?? '');
      auth = String((init?.headers as Record<string, string>)?.['Authorization'] ?? '');
      redirect = init?.redirect;
      return mockRes(200, okBody);
    });
    vi.stubGlobal('fetch', fetchMock);
    const meta = PLATFORMS.find(p => p.name === 'Meta AI')!;
    const text = await callPlatform({ ...meta, apiKey: 'test-meta-key' }, 'best dentist');
    expect(text).toBe('Tech Ridge Dental is a top pick');
    expect(url).toBe('https://api.meta.ai/v1/chat/completions');
    const body = JSON.parse(sentBody);
    expect(body.model).toBe('muse-spark-1.3');
    expect(body.temperature).toBe(0);
    expect(body.max_tokens).toBe(4000);
    expect(body.messages[0].content).toContain('best dentist');
    expect(auth).toBe('Bearer test-meta-key');
    expect(redirect).toBe('manual');
  });

  it('empty content throws an honest error (reasoning budget case)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockRes(200, { choices: [{ message: { content: '' } }] })));
    const meta = PLATFORMS.find(p => p.name === 'Meta AI')!;
    await expect(callPlatform({ ...meta, apiKey: 'test-meta-key' }, 'best dentist')).rejects.toThrow('empty content');
  });

  it('non-OK status throws with the status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockRes(401, { error: 'bad key' })));
    const meta = PLATFORMS.find(p => p.name === 'Meta AI')!;
    await expect(callPlatform({ ...meta, apiKey: 'test-meta-key' }, 'best dentist')).rejects.toThrow('Meta AI failed: 401');
  });
});
