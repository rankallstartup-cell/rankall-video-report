// Slice 3: render wait interface units (mocked pollers only — no provider
// calls, no keys, no real renders).
import { describe, it, expect, vi } from 'vitest';
import {
  pollRenderUntilDone, RenderPending,
  type RenderCheck, type RenderPoller,
} from '../video/renderPoller';

function pollerFrom(checks: Array<RenderCheck | Error>): RenderPoller {
  const queue = [...checks];
  return {
    startRender: async () => ({ renderId: 'vid-test' }),
    checkRender: async () => {
      const next = queue.shift();
      if (next instanceof Error) throw next;
      if (!next) return { status: 'processing', checkedAt: new Date().toISOString() };
      return next;
    },
  };
}

describe('pollRenderUntilDone', () => {
  it('returns the terminal check and reports every check', async () => {
    const seen: RenderCheck[] = [];
    const poller = pollerFrom([
      { status: 'processing', checkedAt: 't1' },
      { status: 'complete', videoUrl: 'https://example.invalid/v.mp4', checkedAt: 't2' },
    ]);
    const final = await pollRenderUntilDone(poller, 'vid-test', {
      intervalMs: 1,
      onCheck: (c) => seen.push(c),
    });
    expect(final.status).toBe('complete');
    expect(final.videoUrl).toBe('https://example.invalid/v.mp4');
    expect(seen.map((c) => c.status)).toEqual(['processing', 'complete']);
  });

  it('returns processing (not an error) when the budget runs out', async () => {
    const poller = pollerFrom([]);
    const final = await pollRenderUntilDone(poller, 'vid-test', {
      intervalMs: 1,
      budgetMs: 20,
    });
    expect(final.status).toBe('processing');
  });

  it('treats a throwing check as transient and keeps polling', async () => {
    const seen: RenderCheck[] = [];
    const poller = pollerFrom([
      new Error('provider hiccup'),
      new Error('provider hiccup again'),
      { status: 'complete', videoUrl: 'https://example.invalid/v.mp4', checkedAt: 't3' },
    ]);
    const final = await pollRenderUntilDone(poller, 'vid-test', {
      intervalMs: 1,
      onCheck: (c) => seen.push(c),
    });
    expect(final.status).toBe('complete');
    // Every loop iteration reports: the two transient failures surface as
    // synthetic 'processing' checks (they prove the waiter is still alive),
    // then the terminal check.
    expect(seen.map((c) => c.status)).toEqual(['processing', 'processing', 'complete']);
  });

  it('returns a failed check as-is (the caller turns it into PipelineError)', async () => {
    const poller = pollerFrom([
      { status: 'failed', error: 'HeyGen render failed: boom', checkedAt: 't1' },
    ]);
    const final = await pollRenderUntilDone(poller, 'vid-test', { intervalMs: 1 });
    expect(final.status).toBe('failed');
    expect(final.error).toContain('boom');
  });
});

describe('RenderPending', () => {
  it('carries the renderId so the caller can resume it', () => {
    const err = new RenderPending('vid-123');
    expect(err.renderId).toBe('vid-123');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('RenderPending');
  });
});

describe('vi sanity', () => {
  it('vitest mocking is available', () => {
    expect(typeof vi.fn).toBe('function');
  });
});
