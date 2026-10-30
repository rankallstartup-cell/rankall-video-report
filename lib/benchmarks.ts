// lib/benchmarks.ts
// Real peer benchmarks from stored scans, with a minimum sample. Replaces
// hardcoded "averages" (dashboard INDUSTRY_BENCHMARK = 45, market-index
// DEFAULT_NATIONAL = 52 and a static top-industries table) that were shown
// as if measured. Below the minimum sample, there is no benchmark (null).

// b89y: ONE canonical publication rule for the index, shared with the
// public /market-index page (its MIN_GROUP_SCANS): a group average is
// published only with at least 5 scans — the privacy rule that keeps a
// single customer's score from being identifiable — over the last 12
// months (the window is applied by the API query). This constant was
// 20 while the public page said 5, so the two pages stated different
// rules for the same index.
export const BENCHMARK_MIN_SAMPLE = 5;

export interface Benchmark { avg: number; count: number }

export function aggregateScores(
  scores: ReadonlyArray<number | null | undefined>,
  minSample: number = BENCHMARK_MIN_SAMPLE,
): Benchmark | null {
  const valid = scores.filter((s): s is number => typeof s === 'number' && Number.isFinite(s));
  if (valid.length < minSample) return null;
  const avg = Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
  return { avg, count: valid.length };
}

/** Share (0-100) of the sample strictly below `score`; null below the min sample. */
export function percentileOf(
  score: number | null | undefined,
  scores: ReadonlyArray<number | null | undefined>,
  minSample: number = BENCHMARK_MIN_SAMPLE,
): number | null {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  const valid = scores.filter((s): s is number => typeof s === 'number' && Number.isFinite(s));
  if (valid.length < minSample) return null;
  return Math.round((valid.filter(v => v < score).length / valid.length) * 100);
}

/** Per-industry averages, only for industries meeting the min sample. */
export function industryAverages(
  rows: ReadonlyArray<{ industry: string | null; overall_score: number | null }>,
  minSample: number = BENCHMARK_MIN_SAMPLE,
): Array<{ industry: string } & Benchmark> {
  const by = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.industry || typeof r.overall_score !== 'number') continue;
    const arr = by.get(r.industry) ?? [];
    arr.push(r.overall_score);
    by.set(r.industry, arr);
  }
  const out: Array<{ industry: string } & Benchmark> = [];
  for (const [industry, scores] of by) {
    const b = aggregateScores(scores, minSample);
    if (b) out.push({ industry, ...b });
  }
  return out.sort((a, b) => b.avg - a.avg);
}
