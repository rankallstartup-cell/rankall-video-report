// Durable video-job store (Supabase) — the Oct 26 instance-routing fix.
// A job accepted on one instance must be visible from any other instance.
// All Supabase calls here are faked in-memory (no keys, no paid calls);
// the fake JSON-clones rows on write to simulate PostgREST jsonb
// round-trips. The two-instances tests share ONE fake backend object.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createSupabaseJobStore,
  createMemoryJobStore,
  StoreUnavailable,
  type StoredJob,
  type StoredRenderProgress,
  type JobProgress,
} from '../video/jobStore';
import type { PipelineCosts } from '../video/pipeline';

const COSTS: PipelineCosts = {
  heygenWalletBeforeUsd: 21.82,
  heygenWalletAfterUsd: 21.65,
  heygenSpentUsd: 0.17,
  elevenlabsCharacters: 811,
  projectedTotalUsd: 0.17,
  budgetWarnUsd: 2,
  overBudget: false,
};

const PROCESSING_JOB: StoredJob = {
  jobId: 'job-1',
  status: 'processing',
  createdAt: '2026-10-26T22:00:00.000Z',
  scanId: 'scan-1',
  businessName: 'Tech Ridge Dental',
};

// scanJson-style job: no scan row, so no scanId (mirrors the old contract).
const ADHOC_JOB: StoredJob = {
  jobId: 'job-adhoc',
  status: 'processing',
  createdAt: '2026-10-26T22:01:00.000Z',
  businessName: 'Tech Ridge Dental',
};

const COMPLETE_JOB: StoredJob = {
  ...PROCESSING_JOB,
  status: 'complete',
  result: {
    videoUrl: 'https://example.com/v.mp4',
    heygenVideoId: 'vid-123',
    avatarId: 'dante-id',
    scriptSource: 'spark',
    costs: COSTS,
    warnings: [],
    stages: [{ stage: 'heygen-avatar', status: 'ok', detail: 'done', latencyMs: 48000 }],
    totalLatencyMs: 480000,
  },
};

const RESUME: StoredRenderProgress = {
  renderId: 'vid-123',
  avatarId: 'dante-id',
  stages: [{ stage: 'script', status: 'ok', detail: 'done', latencyMs: 1000 }],
  narration: { characters: 811, voiceId: 'voice-1', voiceName: 'Eric' },
  scriptSource: 'spark',
  warnings: [],
  walletBeforeUsd: 21.82,
  lastCheckAt: 1793071800000,
  waiterActive: true,
  waiterActiveSince: 1793071790000,
};

type FakeError = { code?: string; message: string } | null;

// Minimal PostgREST-shaped fake: only the calls jobStore makes.
class FakeTable {
  rows = new Map<string, Record<string, unknown>>();
  error: FakeError = null;

  from(table: string) {
    if (table !== 'video_jobs') throw new Error(`unexpected table ${table}`);
    const self = this;
    return {
      select(_cols: string) {
        return {
          eq(col: string, val: string) {
            return {
              async maybeSingle() {
                if (self.error) return { data: null, error: self.error };
                const row = [...self.rows.values()].find((r) => r[col] === val);
                return { data: row ?? null, error: null };
              },
            };
          },
          async order(col: string, opts: { ascending: boolean }) {
            if (self.error) return { data: null, error: self.error };
            const sorted = [...self.rows.values()].sort((a, b) => {
              const av = String(a[col] ?? '');
              const bv = String(b[col] ?? '');
              return opts.ascending ? av.localeCompare(bv) : bv.localeCompare(av);
            });
            return { data: sorted, error: null };
          },
        };
      },
      async upsert(row: Record<string, unknown>, _opts: { onConflict: string }) {
        if (self.error) return { data: null, error: self.error };
        const prev = self.rows.get(row.job_id as string) ?? {};
        // JSON round-trip, like PostgREST jsonb columns.
        self.rows.set(
          row.job_id as string,
          JSON.parse(JSON.stringify({ ...prev, ...row })),
        );
        return { data: row, error: null };
      },
    };
  }
}

function supabaseStores() {
  const table = new FakeTable();
  const fake = { from: (t: string) => table.from(t) };
  const client = fake as unknown as SupabaseClient;
  return { table, a: createSupabaseJobStore(client), b: createSupabaseJobStore(client) };
}

describe('Supabase job store: cross-instance visibility (the Oct 26 bug)', () => {
  it('instance B reads what instance A created', async () => {
    const { a, b } = supabaseStores();
    await a.create(PROCESSING_JOB);
    const found = await b.get('job-1');
    expect(found?.job).toEqual(PROCESSING_JOB);
    expect(found?.resume).toBeNull();
  });

  it('complete round-trip keeps the exact GET key set', async () => {
    const { a, b } = supabaseStores();
    await a.create(PROCESSING_JOB);
    await a.save(COMPLETE_JOB);
    const found = await b.get('job-1');
    expect(found).not.toBeNull();
    expect(Object.keys(found!.job).sort()).toEqual([
      'businessName',
      'createdAt',
      'jobId',
      'result',
      'scanId',
      'status',
    ]);
    expect(Object.keys(found!.job.result!).sort()).toEqual([
      'avatarId',
      'costs',
      'heygenVideoId',
      'scriptSource',
      'stages',
      'totalLatencyMs',
      'videoUrl',
      'warnings',
    ]);
    expect(found!.job.result!.videoUrl).toBe('https://example.com/v.mp4');
    expect(found!.job.result!.totalLatencyMs).toBe(480000);
  });

  it('processing record key set matches the old contract (no scanId, no result)', async () => {
    const { a, b } = supabaseStores();
    await a.create(ADHOC_JOB);
    const found = await b.get('job-adhoc');
    expect(Object.keys(found!.job).sort()).toEqual([
      'businessName',
      'createdAt',
      'jobId',
      'status',
    ]);
  });

  it('failed-stage mapping round-trips', async () => {
    const { a, b } = supabaseStores();
    await a.create(PROCESSING_JOB);
    await a.save({
      ...PROCESSING_JOB,
      status: 'failed',
      error: '[heygen-avatar] render failed',
      failedStage: 'heygen-avatar',
    });
    const found = await b.get('job-1');
    expect(found!.job.status).toBe('failed');
    expect(found!.job.error).toBe('[heygen-avatar] render failed');
    expect(found!.job.failedStage).toBe('heygen-avatar');
    expect(found!.job.result).toBeUndefined();
  });

  it('resume context persists across instances, JSON round-tripped', async () => {
    const { a, b } = supabaseStores();
    await a.create(PROCESSING_JOB);
    await a.saveResume('job-1', RESUME);
    const found = await b.get('job-1');
    expect(found!.resume).toEqual(RESUME);
  });

  it('save() never touches resume_context; only saveResume manages it', async () => {
    const { a, b } = supabaseStores();
    await a.create(PROCESSING_JOB);
    await a.saveResume('job-1', RESUME);
    await a.save(COMPLETE_JOB);
    expect((await b.get('job-1'))!.resume).toEqual(RESUME);
    await a.saveResume('job-1', null);
    expect((await b.get('job-1'))!.resume).toBeNull();
  });

  it('continuation claim round-trips across instances', async () => {
    const { a, b } = supabaseStores();
    const claim: JobProgress = {
      checkpoints: {
        input: {
          businessName: 'Tech Ridge Dental',
          overallScore: 91,
          mentionedCount: 10,
          totalPlatforms: 12,
          platforms: [],
        },
      },
      continuationActive: true,
      continuationSince: 1793071800000,
      lastCheckpointAt: 1793071800000,
    };
    await a.create(PROCESSING_JOB);
    await a.saveResume('job-1', claim);
    expect((await b.get('job-1'))!.resume).toEqual(claim);
  });

  it('list is newest-first across instances', async () => {
    const { a, b } = supabaseStores();
    await a.create(PROCESSING_JOB);
    await a.create(ADHOC_JOB);
    expect((await b.list()).map((j) => j.jobId)).toEqual(['job-adhoc', 'job-1']);
  });

  it('missing job reads null, not an error (route answers 404)', async () => {
    const { a } = supabaseStores();
    expect(await a.get('nope')).toBeNull();
  });
});

describe('Supabase job store: unavailable store is explicit, never silent', () => {
  it('table-missing (migration not run) throws StoreUnavailable on every op', async () => {
    const { table, a } = supabaseStores();
    table.error = {
      code: 'PGRST205',
      message: 'Could not find the table public.video_jobs in the schema cache',
    };
    await expect(a.create(PROCESSING_JOB)).rejects.toThrow(StoreUnavailable);
    await expect(a.get('job-1')).rejects.toThrow(StoreUnavailable);
    await expect(a.list()).rejects.toThrow(StoreUnavailable);
    await expect(a.saveResume('job-1', RESUME)).rejects.toThrow(StoreUnavailable);
  });

  it('unreachable store (thrown transport error) throws StoreUnavailable', async () => {
    const throwing = {
      from: () => {
        throw new Error('fetch failed');
      },
    } as unknown as SupabaseClient;
    const store = createSupabaseJobStore(throwing);
    await expect(store.get('job-1')).rejects.toThrow(StoreUnavailable);
  });
});

describe('Memory job store (local-only path)', () => {
  it('round-trips create/get/list/resume with the same shapes', async () => {
    const store = createMemoryJobStore();
    await store.create(PROCESSING_JOB);
    await store.saveResume('job-1', RESUME);
    const found = await store.get('job-1');
    expect(found!.job).toEqual(PROCESSING_JOB);
    expect(found!.resume).toEqual(RESUME);
    await store.save(COMPLETE_JOB);
    expect((await store.list()).map((j) => j.jobId)).toEqual(['job-1']);
    expect((await store.get('job-1'))!.job.result!.videoUrl).toBe('https://example.com/v.mp4');
  });
});

describe('saveResume payload shape (Postgres upsert gotcha, Oct 26)', () => {
  it('upserts ONLY job_id + resume_context + updated_at — never job columns', async () => {
    const captured: Record<string, unknown>[] = [];
    const capturing = {
      from: () => ({
        async upsert(row: Record<string, unknown>) {
          captured.push(row);
          return { data: row, error: null };
        },
      }),
    } as unknown as SupabaseClient;
    const store = createSupabaseJobStore(capturing);
    await store.saveResume('job-1', RESUME);
    expect(captured).toHaveLength(1);
    expect(Object.keys(captured[0]).sort()).toEqual([
      'job_id',
      'resume_context',
      'updated_at',
    ]);
    expect(captured[0].job_id).toBe('job-1');
    expect(captured[0].resume_context).toEqual(RESUME);
    // The shape above is WHY video_jobs.status needs a DEFAULT: Postgres
    // validates NOT NULL on the proposed upsert row even for updates, so
    // this minimal payload failed on every saveResume until migration
    // 20261027044800 added DEFAULT 'processing'. The fix lives in the
    // schema, not here — this test pins the payload so nobody "fixes" a
    // constraint error by stuffing status in and breaking the column
    // separation.
  });
});

describe('migration file', () => {
  it('exists, is rerun-safe, enables RLS with a service-role-only policy', () => {
    const files = readdirSync(join(process.cwd(), 'supabase/migrations')).filter((f) =>
      f.endsWith('_video_jobs.sql'),
    );
    expect(files).toHaveLength(1);
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations', files[0]), 'utf8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.video_jobs');
    expect(sql).toContain('job_id text PRIMARY KEY');
    expect(sql).toContain('resume_context jsonb');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('TO service_role');
    expect(sql).not.toContain('TO anon');
    expect(sql).not.toContain('TO authenticated');
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });
});

describe('video_jobs status-default migration (Oct 26 upsert gotcha)', () => {
  it('adds DEFAULT processing to status and reloads the schema cache', () => {
    const files = readdirSync(join(process.cwd(), 'supabase/migrations')).filter((f) =>
      f.endsWith('_video_jobs_status_default.sql'),
    );
    expect(files).toHaveLength(1);
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations', files[0]), 'utf8');
    expect(sql).toContain("ALTER COLUMN status SET DEFAULT 'processing'");
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
