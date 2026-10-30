// Slice 2: video jobs dashboard + self-serve front door.
// Pure helper tests (formatJobCost) + repo-style source assertions for the
// surfaces that need the Next.js runtime to render (gating, noindex,
// tier-agnostic copy, endpoint wiring).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatJobCost } from '../video/videoJobs';
import type { PipelineCosts } from '../video/pipeline';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

function costs(over: Partial<PipelineCosts>): PipelineCosts {
  return {
    heygenWalletBeforeUsd: null,
    heygenWalletAfterUsd: null,
    heygenSpentUsd: null,
    elevenlabsCharacters: 0,
    projectedTotalUsd: null,
    budgetWarnUsd: 2,
    overBudget: false,
    ...over,
  };
}

describe('formatJobCost', () => {
  it('prefers the projected total when measurable', () => {
    expect(formatJobCost(costs({ projectedTotalUsd: 0.81, heygenSpentUsd: 0.5 }))).toBe('$0.81');
  });
  it('falls back to HeyGen spend when no projected total exists', () => {
    expect(formatJobCost(costs({ heygenSpentUsd: 0.29 }))).toBe('$0.29 spent');
  });
  it('never invents a number when nothing is measurable', () => {
    expect(formatJobCost(costs({}))).toBe('not measured');
    expect(formatJobCost(undefined)).toBe('not measured');
  });
  it('renders a zero total as $0.00, not "not measured"', () => {
    expect(formatJobCost(costs({ projectedTotalUsd: 0 }))).toBe('$0.00');
  });
});

describe('job route exposes a jobs listing', () => {
  const route = read('app/api/hackathon/video-report/route.ts');
  it('exports listVideoJobs for the dashboard + jobs API', () => {
    // Async since the durable-store slice: reads go through Supabase,
    // not module memory. The jobs page + jobs API await it.
    expect(route).toContain('export async function listVideoJobs');
  });
  it('answers an explicit 503 when the job store is unavailable', () => {
    expect(route).toContain('job_store_unavailable');
    expect(route).toContain('StoreUnavailable');
  });
  it('JobRecord carries the scan link + display label', () => {
    expect(route).toContain('scanId?: string');
    expect(route).toContain('businessName?: string');
  });
});

describe('jobs API route', () => {
  const jobsRoute = read('app/api/hackathon/video-report/jobs/route.ts');
  it('is gated by the same flag as the job route', () => {
    expect(jobsRoute).toContain("HACKATHON_VIDEO_REPORT_ENABLED !== '1'");
  });
  it('lists via listVideoJobs', () => {
    expect(jobsRoute).toContain('listVideoJobs()');
  });
});

describe('jobs dashboard + front door: gating, noindex, tier breadth', () => {
  const jobsPage = read('app/hackathon/video-report/jobs/page.tsx');
  const frontDoor = read('app/hackathon/video-report/page.tsx');
  const form = read('app/hackathon/video-report/front-door-form.tsx');

  it('both pages are gated and noindexed like the delivery page', () => {
    for (const src of [jobsPage, frontDoor]) {
      expect(src).toContain("HACKATHON_VIDEO_REPORT_ENABLED !== '1'");
      expect(src).toContain('index: false');
    }
  });
  it('front door names the full range, not one vertical', () => {
    expect(frontDoor).toContain('personal brands');
    expect(frontDoor).toContain('products');
    expect(frontDoor).toContain('agencies');
    expect(frontDoor).toContain('enterprises');
    expect(frontDoor).toContain('government programs');
    expect(frontDoor).toContain('global brands');
  });
  it('no surface presents the product as dentist-only', () => {
    for (const src of [jobsPage, frontDoor, form]) {
      expect(src.toLowerCase()).not.toContain('dentist');
    }
  });
  it('front door wires both scan paths into a video job', () => {
    expect(form).toContain("'/api/scan'");
    expect(form).toContain("'/api/scan-personal'");
    expect(form).toContain("'/api/hackathon/video-report'");
    expect(form).toContain('identityConfirmed: true');
  });
  it('jobs dashboard offers regenerate + a front-door primary action', () => {
    expect(jobsPage).toContain('RegenerateButton');
    expect(jobsPage).toContain('/hackathon/video-report');
  });
});
