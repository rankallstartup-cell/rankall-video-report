// Slice 3: job survival for long renders (route level).
//
// POST must return 202 immediately and schedule the pipeline with
// Next.js after() instead of a floating promise; a render that outlives
// its invocation's wait budget must leave the job 'processing' (never
// 'failed'); and a later GET must resume that renderId and advance the
// job. All provider calls are mocked — no HeyGen/ElevenLabs/Meta calls,
// no keys, no real renders.
//
// next/server's after() is mocked to capture callbacks (there is no Next
// request context under vitest); runVideoPipeline is mocked so the test
// controls exactly when stage 5 starts and when it goes pending; the
// HeyGen poller + wallet used by the resume path are mocked too.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RenderPending } from '../video/renderPoller';

const hoisted = vi.hoisted(() => ({
  afterCallbacks: [] as Array<() => unknown>,
  runPipeline: vi.fn(),
  checkRender: vi.fn(),
  wallet: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return {
    ...actual,
    after: (cb: () => unknown) => {
      hoisted.afterCallbacks.push(cb);
    },
  };
});

vi.mock('@/lib/video', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/video')>();
  return { ...actual, runVideoPipeline: hoisted.runPipeline };
});

vi.mock('@/lib/video/providers/heygenAudioAvatar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/video/providers/heygenAudioAvatar')>();
  return {
    ...actual,
    createHeygenRenderPoller: () => ({
      startRender: vi.fn(),
      checkRender: hoisted.checkRender,
      downloadRender: vi.fn(),
    }),
    getHeygenWalletBalance: hoisted.wallet,
  };
});

// Imported after the mocks above (vitest hoists vi.mock above imports).
import { POST, GET } from '@/app/api/hackathon/video-report/route';

const scanJson = {
  businessName: 'Tech Ridge Dental',
  industry: 'Dentist',
  location: 'North Austin',
  overallScore: 34,
  mentionedCount: 3,
  totalPlatforms: 12,
};

function postReq(body: unknown): never {
  return { json: async () => body } as never;
}

function getReq(jobId: string): never {
  return {
    nextUrl: new URL(`http://localhost/api/hackathon/video-report?jobId=${jobId}`),
  } as never;
}

function renderCtx(renderId: string) {
  return {
    renderId,
    avatarId: 'Aditya_public_4',
    stages: [{ stage: 'script', status: 'ok', detail: '', latencyMs: 1 }],
    narration: { characters: 811, voiceId: 'voice-eric', voiceName: 'Eric' },
    scriptSource: 'spark',
    warnings: [],
    walletBeforeUsd: 21.0,
  };
}

beforeEach(() => {
  process.env.HACKATHON_VIDEO_REPORT_ENABLED = '1';
  hoisted.afterCallbacks.length = 0;
  hoisted.runPipeline.mockReset();
  hoisted.checkRender.mockReset();
  hoisted.wallet.mockReset();
  hoisted.wallet.mockResolvedValue(20.0);
});

afterEach(() => {
  delete process.env.HACKATHON_VIDEO_REPORT_ENABLED;
  vi.useRealTimers();
});

describe('POST schedules via after() and returns immediately', () => {
  it('returns 202 + jobId before the pipeline runs', async () => {
    const res = await POST(postReq({ scanJson }));
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(typeof body.jobId).toBe('string');
    expect(body.status).toBe('processing');
    expect(body.pipeline).toBe('heygen-audio-v2');
    // The 202 is out before any pipeline work: after() was scheduled,
    // but the callback has not run yet.
    expect(hoisted.afterCallbacks.length).toBe(1);
    expect(hoisted.runPipeline).not.toHaveBeenCalled();
  });

  it('labels the pipeline v3 when the HeyGen key is present (v2-death check)', async () => {
    process.env.HEYGEN_API_KEY = 'test-key';
    try {
      const res = await POST(postReq({ scanJson }));
      const body = await res.json();
      expect(body.pipeline).toBe('heygen-audio-v3');
    } finally {
      delete process.env.HEYGEN_API_KEY;
    }
  });
});

describe('RenderPending keeps the job processing', () => {
  it('stays processing (never failed) and GET does not resume a live waiter', async () => {
    const res = await POST(postReq({ scanJson }));
    const { jobId } = await res.json();
    hoisted.runPipeline.mockImplementation(async (_input: unknown, opts: any) => {
      opts.onRenderStarted?.(renderCtx('vid-123'));
      opts.onRenderCheck?.({ status: 'processing', checkedAt: new Date().toISOString() });
      throw new RenderPending('vid-123');
    });
    await hoisted.afterCallbacks[0]();
    expect(hoisted.runPipeline).toHaveBeenCalledTimes(1);

    const status = await GET(getReq(jobId));
    const data = await status.json();
    expect(data.status).toBe('processing');
    expect(data.error).toBeUndefined();
    expect(data.failedStage).toBeUndefined();
    // The waiter just checked, so the quiet window has not elapsed: GET
    // must NOT schedule a resume yet.
    expect(hoisted.afterCallbacks.length).toBe(1);
    // And the GET response carries exactly the old contract fields —
    // no renderId / renderState bookkeeping leaks into it.
    expect(Object.keys(data).sort()).toEqual(
      ['businessName', 'createdAt', 'jobId', 'status'],
    );
  });
});

describe('GET resumes a quiet render', () => {
  async function pendingJob(renderId: string): Promise<string> {
    const res = await POST(postReq({ scanJson }));
    const { jobId } = await res.json();
    hoisted.runPipeline.mockImplementation(async (_input: unknown, opts: any) => {
      opts.onRenderStarted?.(renderCtx(renderId));
      opts.onRenderCheck?.({ status: 'processing', checkedAt: new Date().toISOString() });
      throw new RenderPending(renderId);
    });
    const idx = hoisted.afterCallbacks.length - 1;
    await hoisted.afterCallbacks[idx]();
    return jobId;
  }

  it('completes the job from the stored resume context', async () => {
    vi.useFakeTimers();
    const jobId = await pendingJob('vid-123');
    // Past the 90s quiet window: the next poll resumes the render.
    vi.advanceTimersByTime(91_000);
    const before = hoisted.afterCallbacks.length;
    await GET(getReq(jobId));
    expect(hoisted.afterCallbacks.length).toBe(before + 1);

    hoisted.checkRender.mockResolvedValue({
      status: 'complete',
      videoUrl: 'https://example.invalid/video.mp4',
      checkedAt: new Date().toISOString(),
    });
    await hoisted.afterCallbacks[hoisted.afterCallbacks.length - 1]();

    const status = await GET(getReq(jobId));
    const data = await status.json();
    expect(data.status).toBe('complete');
    expect(data.result.videoUrl).toBe('https://example.invalid/video.mp4');
    expect(data.result.heygenVideoId).toBe('vid-123');
    expect(data.result.avatarId).toBe('Aditya_public_4');
    expect(data.result.scriptSource).toBe('spark');
    expect(data.result.costs.heygenWalletBeforeUsd).toBe(21.0);
    expect(data.result.costs.heygenWalletAfterUsd).toBe(20.0);
    expect(data.result.costs.heygenSpentUsd).toBe(1.0);
    // Completed record keeps the old contract shape exactly.
    expect(Object.keys(data).sort()).toEqual(
      ['businessName', 'createdAt', 'jobId', 'result', 'status'],
    );
  });

  it('marks the job failed with failedStage when the resumed render fails', async () => {
    vi.useFakeTimers();
    const jobId = await pendingJob('vid-999');
    vi.advanceTimersByTime(91_000);
    const before = hoisted.afterCallbacks.length;
    await GET(getReq(jobId));
    expect(hoisted.afterCallbacks.length).toBe(before + 1);

    hoisted.checkRender.mockResolvedValue({
      status: 'failed',
      error: 'HeyGen render failed: boom',
      checkedAt: new Date().toISOString(),
    });
    await hoisted.afterCallbacks[hoisted.afterCallbacks.length - 1]();

    const status = await GET(getReq(jobId));
    const data = await status.json();
    expect(data.status).toBe('failed');
    expect(data.failedStage).toBe('heygen-avatar');
    expect(data.error).toContain('boom');
  });
});
