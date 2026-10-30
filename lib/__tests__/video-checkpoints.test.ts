// Checkpointed resumable pipeline (Oct 26): a job whose invocation dies
// mid-pipeline must resume from its last checkpoint, never redo a
// finished stage, and never sit 'processing' forever. All provider calls
// are mocked — no Spark/ElevenLabs/HeyGen calls, no keys, no renders.
//
// Two halves: (A) pipeline-level — stage reuse counters prove script /
// narration / render are never redone when a checkpoint exists; (B)
// route-level — POST checkpoints the input, GET schedules a continuation
// for an idle pre-render job, and the watchdog fails a frozen job with
// its last incomplete stage. GET contract keys are asserted throughout.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ── Part A: pipeline-level reuse ─────────────────────────────────────────
// ONE mock per resolved module (vitest keys mocks by resolved path, so
// the relative and @/ spellings of the HeyGen module share one mock):
// the HeyGen mock serves both halves — Part A passes its own fake
// poller, Part B drives the route's resume path through checkRender.
const hoisted = vi.hoisted(() => ({
  spark: vi.fn(),
  narrate: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
  runPipeline: vi.fn(),
  checkRender: vi.fn(),
  wallet: vi.fn(),
}));

vi.mock('../video/sparkScript', () => ({
  writeScriptWithSpark: hoisted.spark,
  SPARK_MODEL: 'muse-spark-1.3',
  SPARK_MAX_TOKENS: 4000,
}));

vi.mock('../video/providers/elevenlabsNarration', () => ({
  narrateWithElevenLabs: hoisted.narrate,
  DEFAULT_ELEVENLABS_VOICE_ID: 'voice-eric',
}));

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

import { runVideoPipeline } from '../video/pipeline';
import type { RenderPoller } from '../video/renderPoller';
import { buildVideoScript } from '../video/script';
import type { ScanVideoInput } from '../video/script';
import { reviewScript } from '../video/director';

const INPUT: ScanVideoInput = {
  businessName: 'Tech Ridge Dental',
  industry: 'Dentist',
  location: 'North Austin',
  overallScore: 34,
  mentionedCount: 3,
  totalPlatforms: 12,
  platforms: [
    { platform: 'ChatGPT', score: 80, mentioned: true, sentiment: 'positive', rank: 1 },
    { platform: 'Gemini', score: 60, mentioned: false, sentiment: 'neutral', rank: null },
  ],
};

function fakePoller(overrides: Partial<RenderPoller> = {}): RenderPoller {
  return {
    startRender: vi.fn(async () => ({ renderId: 'vid-legacy' })),
    checkRender: vi.fn(async () => ({
      status: 'complete' as const,
      videoUrl: 'https://example.invalid/v.mp4',
      checkedAt: new Date().toISOString(),
    })),
    uploadAudioAsset: vi.fn(async () => ({ assetId: 'asset-1' })),
    startRenderFromAsset: vi.fn(async () => ({ renderId: 'vid-asset' })),
    defaultAvatarId: 'dante-id',
    ...overrides,
  };
}

async function outDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'ckpt-'));
}

describe('pipeline checkpoints: fresh run writes script → director → narration', () => {
  beforeEach(() => {
    hoisted.spark.mockReset();
    hoisted.narrate.mockReset();
    hoisted.wallet.mockResolvedValue(21.0);
    hoisted.spark.mockImplementation(async () => buildVideoScript(INPUT));
    hoisted.narrate.mockImplementation(async (_text: string, audioPath: string) => ({
      audioPath,
      audio: Buffer.from('fake-mp3'),
      characters: 811,
      voiceId: 'voice-eric',
      voiceName: 'Eric',
      latencyMs: 100,
    }));
  });

  it('checkpoints each stage in order, with a narration assetId', async () => {
    const poller = fakePoller();
    const seen: Array<Record<string, unknown>> = [];
    const result = await runVideoPipeline(INPUT, {
      outDir: await outDir(),
      downloadLocal: false,
      renderWaitBudgetMs: null,
      renderPoller: poller,
      onCheckpoint: (cp) => {
        seen.push(JSON.parse(JSON.stringify(cp)));
      },
    });
    expect(result.video.remoteVideoUrl).toBe('https://example.invalid/v.mp4');
    expect(hoisted.spark).toHaveBeenCalledTimes(1);
    expect(hoisted.narrate).toHaveBeenCalledTimes(1);
    expect(poller.uploadAudioAsset).toHaveBeenCalledTimes(1);
    // Fresh narration uploads, then stage 5 creates from the asset —
    // legacy startRender is never used on the v3-shaped poller.
    expect(poller.startRenderFromAsset).toHaveBeenCalledTimes(1);
    expect(poller.startRender).not.toHaveBeenCalled();
    expect(seen.map((c) => Object.keys(c).sort())).toEqual([
      ['input', 'script'],
      ['director', 'input', 'script'],
      ['director', 'input', 'narration', 'script'],
    ]);
    const last = seen[seen.length - 1];
    expect((last.narration as { assetId: string }).assetId).toBe('asset-1');
    expect((last.script as { scriptSource: string }).scriptSource).toBe('spark');
  });

  it('upload failure degrades: legacy startRender, no asset checkpoint, still completes', async () => {
    const poller = fakePoller({
      uploadAudioAsset: vi.fn(async () => {
        throw new Error('asset upload down');
      }),
    });
    let narrationFragment: Record<string, unknown> | undefined;
    const result = await runVideoPipeline(INPUT, {
      outDir: await outDir(),
      downloadLocal: false,
      renderWaitBudgetMs: null,
      renderPoller: poller,
      onCheckpoint: (cp) => {
        if (cp.narration) narrationFragment = cp.narration as unknown as Record<string, unknown>;
      },
    });
    expect(result.video.remoteVideoUrl).toBe('https://example.invalid/v.mp4');
    expect(poller.startRender).toHaveBeenCalledTimes(1);
    expect(poller.startRenderFromAsset).not.toHaveBeenCalled();
    expect(narrationFragment?.assetId).toBeUndefined();
    expect(result.warnings.join(' ')).toContain('asset upload');
    // withRetry backoff is ~6s (2s + 4s): production retry behavior, so
    // this test needs a longer timeout than the 5s default.
  }, 15000);
});

describe('pipeline checkpoints: reuse never redoes a finished stage', () => {
  beforeEach(() => {
    hoisted.spark.mockReset();
    hoisted.narrate.mockReset();
    hoisted.wallet.mockResolvedValue(21.0);
    hoisted.spark.mockImplementation(async () => buildVideoScript(INPUT));
    hoisted.narrate.mockImplementation(async (_text: string, audioPath: string) => ({
      audioPath,
      audio: Buffer.from('fake-mp3'),
      characters: 811,
      voiceId: 'voice-eric',
      voiceName: 'Eric',
      latencyMs: 100,
    }));
  });

  const ruleScript = () => buildVideoScript(INPUT);

  it('script checkpoint: Spark never called, director still runs', async () => {
    const poller = fakePoller();
    const result = await runVideoPipeline(INPUT, {
      outDir: await outDir(),
      downloadLocal: false,
      renderWaitBudgetMs: null,
      renderPoller: poller,
      resumeStages: {
        script: { script: ruleScript(), scriptSource: 'spark', warnings: [] },
      },
    });
    expect(hoisted.spark).not.toHaveBeenCalled();
    expect(result.script).toEqual(ruleScript());
    expect(result.stages[0]).toMatchObject({ stage: 'script', detail: 'reused checkpoint' });
    expect(hoisted.narrate).toHaveBeenCalledTimes(1);
  });

  it('director checkpoint: Spark never called, report reused verbatim', async () => {
    const script = ruleScript();
    const report = reviewScript(script, INPUT);
    expect(report.passed).toBe(true);
    const poller = fakePoller();
    const result = await runVideoPipeline(INPUT, {
      outDir: await outDir(),
      downloadLocal: false,
      renderWaitBudgetMs: null,
      renderPoller: poller,
      resumeStages: {
        script: { script, scriptSource: 'spark', warnings: [] },
        director: { script, report, scriptSource: 'spark', warnings: [] },
      },
    });
    expect(hoisted.spark).not.toHaveBeenCalled();
    expect(result.director).toEqual(report);
    expect(result.stages[1]).toMatchObject({ stage: 'director', detail: 'reused checkpoint' });
  });

  it('narration checkpoint: TTS and upload never called, video from asset', async () => {
    const poller = fakePoller();
    const result = await runVideoPipeline(INPUT, {
      outDir: await outDir(),
      downloadLocal: false,
      renderWaitBudgetMs: null,
      renderPoller: poller,
      resumeStages: {
        narration: { assetId: 'asset-9', characters: 811, voiceId: 'voice-eric', voiceName: 'Eric', warnings: [] },
      },
    });
    expect(hoisted.narrate).not.toHaveBeenCalled();
    expect(poller.uploadAudioAsset).not.toHaveBeenCalled();
    expect(poller.startRenderFromAsset).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: 'asset-9' }),
    );
    expect(poller.startRender).not.toHaveBeenCalled();
    expect(result.video.heygenVideoId).toBe('vid-asset');
  });

  it('narration fragment WITHOUT an assetId is not reusable: TTS runs again', async () => {
    const poller = fakePoller();
    await runVideoPipeline(INPUT, {
      outDir: await outDir(),
      downloadLocal: false,
      renderWaitBudgetMs: null,
      renderPoller: poller,
      resumeStages: {
        narration: { characters: 811, voiceId: 'voice-eric', voiceName: 'Eric', warnings: [] },
      },
    });
    // No asset to reuse, so the stage redoes (fresh TTS + fresh upload).
    expect(hoisted.narrate).toHaveBeenCalledTimes(1);
    expect(poller.uploadAudioAsset).toHaveBeenCalledTimes(1);
  });

  it('render checkpoint: nothing starts, render is only re-polled', async () => {
    const poller = fakePoller();
    const script = ruleScript();
    const result = await runVideoPipeline(INPUT, {
      outDir: await outDir(),
      downloadLocal: false,
      renderWaitBudgetMs: null,
      renderPoller: poller,
      resumeStages: {
        script: { script, scriptSource: 'spark', warnings: [] },
        director: { script, report: reviewScript(script, INPUT), scriptSource: 'spark', warnings: [] },
        narration: { assetId: 'asset-9', characters: 811, voiceId: 'voice-eric', voiceName: 'Eric', warnings: [] },
        render: { renderId: 'vid-old', avatarId: 'dante-id', walletBeforeUsd: 21.0 },
      },
    });
    expect(hoisted.spark).not.toHaveBeenCalled();
    expect(hoisted.narrate).not.toHaveBeenCalled();
    expect(poller.startRender).not.toHaveBeenCalled();
    expect(poller.startRenderFromAsset).not.toHaveBeenCalled();
    expect(poller.checkRender).toHaveBeenCalledWith('vid-old');
    expect(result.video.heygenVideoId).toBe('vid-old');
    expect(result.video.avatarId).toBe('dante-id');
  });
});

// ── Part B: route-level continuation + watchdog + contract ───────────────
// (HeyGen + provider mocks live in the unified block at the top.)
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

import { POST, GET, firstMissingStage, assessStall, buildResumeStages, shouldContinue, stallErrorFor } from '@/app/api/hackathon/video-report/route';
import { getJobStore } from '@/lib/video/jobStore';
import { buildVideoScript as buildScript } from '@/lib/video/script';

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

const COSTS = {
  heygenWalletBeforeUsd: 21.0,
  heygenWalletAfterUsd: 20.0,
  heygenSpentUsd: 1.0,
  elevenlabsCharacters: 811,
  projectedTotalUsd: 1.0,
  budgetWarnUsd: 2,
  overBudget: false,
};

describe('route checkpoints: POST writes the input checkpoint', () => {
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

  it('the stored progress carries the sanitized input before any stage runs', async () => {
    const res = await POST(postReq({ scanJson }));
    const { jobId } = await res.json();
    const found = await getJobStore().get(jobId);
    expect(found?.resume?.checkpoints?.input.businessName).toBe('Tech Ridge Dental');
    expect(typeof found?.resume?.lastCheckpointAt).toBe('number');
    // And the GET response carries exactly the old contract fields —
    // checkpoints never leak into it.
    const status = await GET(getReq(jobId));
    const data = await status.json();
    expect(Object.keys(data).sort()).toEqual(['businessName', 'createdAt', 'jobId', 'status']);
  });
});

describe('route continuation: an idle pre-render job resumes from checkpoints', () => {
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

  async function deadScriptJob(): Promise<string> {
    // POST writes the input checkpoint; the initial after() callback is
    // deliberately never run — the invocation died before stage 1.
    const res = await POST(postReq({ scanJson }));
    const { jobId } = await res.json();
    const found = await getJobStore().get(jobId);
    const progress = found!.resume!;
    progress.checkpoints = {
      ...progress.checkpoints!,
      script: { script: buildScript(scanJson), scriptSource: 'spark', warnings: [] },
    };
    progress.lastCheckpointAt = Date.now();
    await getJobStore().saveResume(jobId, progress);
    return jobId;
  }

  it('GET past the quiet window schedules a continuation that reuses the script checkpoint', async () => {
    vi.useFakeTimers();
    const jobId = await deadScriptJob();
    vi.advanceTimersByTime(91_000);
    const before = hoisted.afterCallbacks.length;
    await GET(getReq(jobId));
    expect(hoisted.afterCallbacks.length).toBe(before + 1);

    let captured: { resumeStages?: Record<string, unknown> } | undefined;
    hoisted.runPipeline.mockImplementation(async (_input: unknown, opts: { resumeStages?: Record<string, unknown> }) => {
      captured = opts;
      return {
        businessName: 'Tech Ridge Dental',
        scriptSource: 'spark',
        video: { localPath: null, remoteVideoUrl: 'https://example.invalid/resumed.mp4', heygenVideoId: 'vid-resumed', avatarId: 'dante-id' },
        costs: COSTS,
        warnings: [],
        stages: [],
        totalLatencyMs: 1,
      };
    });
    await hoisted.afterCallbacks[hoisted.afterCallbacks.length - 1]();
    expect(hoisted.runPipeline).toHaveBeenCalledTimes(1);
    expect(captured?.resumeStages).toHaveProperty('script');

    const status = await GET(getReq(jobId));
    const data = await status.json();
    expect(data.status).toBe('complete');
    expect(data.result.videoUrl).toBe('https://example.invalid/resumed.mp4');
    expect(Object.keys(data).sort()).toEqual(['businessName', 'createdAt', 'jobId', 'result', 'status']);
  });
});

describe('route watchdog: frozen jobs fail honestly, live ones do not', () => {
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

  it('a job frozen at creation fails with failedStage script after 10 minutes', async () => {
    vi.useFakeTimers();
    const res = await POST(postReq({ scanJson }));
    const { jobId } = await res.json();
    const before = hoisted.afterCallbacks.length;
    vi.advanceTimersByTime(11 * 60_000);
    const status = await GET(getReq(jobId));
    const data = await status.json();
    expect(data.status).toBe('failed');
    expect(data.failedStage).toBe('script');
    expect(data.error).toContain('stalled before the script');
    // Watchdog failure returns early: no continuation is scheduled.
    expect(hoisted.afterCallbacks.length).toBe(before);
  });

  it('a 5-minute-old job is still processing (watchdog has not fired)', async () => {
    vi.useFakeTimers();
    const res = await POST(postReq({ scanJson }));
    const { jobId } = await res.json();
    vi.advanceTimersByTime(5 * 60_000);
    const status = await GET(getReq(jobId));
    const data = await status.json();
    expect(data.status).toBe('processing');
    expect(data.failedStage).toBeUndefined();
    expect(data.error).toBeUndefined();
  });

  it('a job with a live render is never watchdog-failed; the render path finalizes it', async () => {
    vi.useFakeTimers();
    const res = await POST(postReq({ scanJson }));
    const { jobId } = await res.json();
    const found = await getJobStore().get(jobId);
    const progress = found!.resume!;
    const old = Date.now() - 11 * 60_000;
    await getJobStore().saveResume(jobId, {
      ...progress,
      renderId: 'vid-live',
      avatarId: 'dante-id',
      stages: [],
      narration: { characters: 811, voiceId: 'voice-eric', voiceName: 'Eric' },
      scriptSource: 'spark',
      warnings: [],
      walletBeforeUsd: 21.0,
      lastCheckAt: old,
      waiterActive: false,
      waiterActiveSince: old,
      lastCheckpointAt: old,
    });
    hoisted.checkRender.mockResolvedValue({
      status: 'processing',
      checkedAt: new Date().toISOString(),
    });
    const status = await GET(getReq(jobId));
    const data = await status.json();
    expect(data.status).toBe('processing');
    expect(data.failedStage).toBeUndefined();

    // The scheduled callback is the render resume (not a continuation):
    // it finalizes from the stored renderId.
    hoisted.checkRender.mockResolvedValue({
      status: 'complete',
      videoUrl: 'https://example.invalid/live.mp4',
      checkedAt: new Date().toISOString(),
    });
    await hoisted.afterCallbacks[hoisted.afterCallbacks.length - 1]();
    expect(hoisted.runPipeline).not.toHaveBeenCalled();
    const done = await GET(getReq(jobId));
    const doneData = await done.json();
    expect(doneData.status).toBe('complete');
    expect(doneData.result.heygenVideoId).toBe('vid-live');
  });
});

describe('checkpoint helpers (pure)', () => {
  const input = scanJson;

  it('firstMissingStage walks script → director → narration → render', () => {
    expect(firstMissingStage(undefined)).toBe('script');
    expect(firstMissingStage({ input })).toBe('script');
    expect(firstMissingStage({ input, script: { script: buildScript(input), scriptSource: 'spark', warnings: [] } })).toBe('director');
    const withDirector = {
      input,
      script: { script: buildScript(input), scriptSource: 'spark' as const, warnings: [] },
      director: { script: buildScript(input), report: { passed: true, issues: [], sceneNotes: [], checkedNumbers: [] }, scriptSource: 'spark' as const, warnings: [] },
    };
    expect(firstMissingStage(withDirector)).toBe('narration');
    // A narration fragment WITHOUT an assetId is not a usable checkpoint.
    expect(firstMissingStage({
      ...withDirector,
      narration: { characters: 1, voiceId: 'v', voiceName: null, warnings: [] },
    })).toBe('narration');
    expect(firstMissingStage({
      ...withDirector,
      narration: { assetId: 'asset-1', characters: 1, voiceId: 'v', voiceName: null, warnings: [] },
    })).toBe('heygen-avatar');
  });

  it('assessStall: young jobs pass, frozen jobs fail, live claims pass', () => {
    const now = Date.now();
    expect(assessStall(null, new Date(now - 60_000).toISOString(), now).stalled).toBe(false);
    expect(assessStall(
      { checkpoints: { input }, lastCheckpointAt: now - 11 * 60_000 },
      new Date(now - 11 * 60_000).toISOString(),
      now,
    )).toEqual({ stalled: true, failedStage: 'script' });
    expect(assessStall(
      { checkpoints: { input }, lastCheckpointAt: now - 11 * 60_000, continuationActive: true, continuationSince: now - 1000 },
      new Date(now - 11 * 60_000).toISOString(),
      now,
    ).stalled).toBe(false);
  });

  it('buildResumeStages passes only reusable stages', () => {
    const stages = buildResumeStages({
      checkpoints: {
        input,
        script: { script: buildScript(input), scriptSource: 'spark', warnings: [] },
        narration: { characters: 1, voiceId: 'v', voiceName: null, warnings: [] },
      },
      renderId: 'vid-1',
      avatarId: 'dante-id',
      walletBeforeUsd: 21.0,
    });
    expect(stages.script).toBeDefined();
    expect(stages.narration).toBeUndefined();
    expect(stages.render).toEqual({ renderId: 'vid-1', avatarId: 'dante-id', walletBeforeUsd: 21.0 });
  });

  it('shouldContinue: render jobs and live claims never continue; idle jobs with input do', () => {
    const now = Date.now();
    const job = { createdAt: new Date(now - 200_000).toISOString() };
    expect(shouldContinue({ renderId: 'vid-1' }, job, now)).toBe(false);
    expect(shouldContinue({ continuationActive: true, continuationSince: now - 1000 }, job, now)).toBe(false);
    expect(shouldContinue({ checkpoints: { input } }, { createdAt: new Date(now - 10_000).toISOString() }, now)).toBe(false);
    expect(shouldContinue({ checkpoints: { input } }, job, now)).toBe(true);
    expect(shouldContinue(null, { ...job, scanId: 'scan-1' }, now)).toBe(true);
    expect(shouldContinue(null, job, now)).toBe(false);
  });

  it('stallErrorFor is plain English per stage', () => {
    expect(stallErrorFor('script')).toContain('before the script');
    expect(stallErrorFor('heygen-avatar')).toContain('before the render');
  });
});
