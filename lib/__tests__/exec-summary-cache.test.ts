import { describe, it, expect } from 'vitest';
import {
  execSummaryCacheKey, legacyExecSummaryCacheKey, readExecSummaryCache,
  shouldRequestExecSummary, EXEC_SUMMARY_CACHE_VERSION, EXEC_SUMMARY_TTL_MS,
} from '../execSummaryCache';

// Item 7: versioned exec-summary cache + only summarise fully-loaded data.
describe('exec summary cache key', () => {
  it('is keyed by version + scan id', () => {
    expect(execSummaryCacheKey('scan-1')).toBe(`rankall_exec_summary_${EXEC_SUMMARY_CACHE_VERSION}_scan-1`);
    expect(execSummaryCacheKey('scan-1', 'v9')).toBe('rankall_exec_summary_v9_scan-1');
  });

  it('a version bump changes the key, so older summaries are never read', () => {
    expect(execSummaryCacheKey('scan-1', 'v1')).not.toBe(execSummaryCacheKey('scan-1', 'v2'));
    expect(execSummaryCacheKey('scan-1')).not.toBe(legacyExecSummaryCacheKey('scan-1'));
  });

  it('different scans never share a key', () => {
    expect(execSummaryCacheKey('a')).not.toBe(execSummaryCacheKey('b'));
  });
});

describe('readExecSummaryCache', () => {
  const now = 1_800_000_000_000;
  const entry = (bullets: unknown, ts: unknown) => JSON.stringify({ bullets, ts });

  it('returns fresh bullets', () => {
    expect(readExecSummaryCache(entry(['a', 'b'], now - 1000), now)).toEqual(['a', 'b']);
  });
  it('drops expired, future-dated, empty, malformed and non-string entries', () => {
    expect(readExecSummaryCache(entry(['a'], now - EXEC_SUMMARY_TTL_MS), now)).toBeNull();
    expect(readExecSummaryCache(entry(['a'], now + 60_000), now)).toBeNull();
    expect(readExecSummaryCache(entry([], now), now)).toBeNull();
    expect(readExecSummaryCache(entry([1, 2], now), now)).toBeNull();
    expect(readExecSummaryCache(entry(['a'], 'yesterday'), now)).toBeNull();
    expect(readExecSummaryCache('{not json', now)).toBeNull();
    expect(readExecSummaryCache(null, now)).toBeNull();
  });
});

describe('shouldRequestExecSummary', () => {
  it('waits for platform results and the fix queue', () => {
    expect(shouldRequestExecSummary({ resultsLoaded: false, platformError: false, fixesSettled: true })).toBe(false);
    expect(shouldRequestExecSummary({ resultsLoaded: true, platformError: false, fixesSettled: false })).toBe(false);
    expect(shouldRequestExecSummary({ resultsLoaded: true, platformError: true, fixesSettled: true })).toBe(false);
    expect(shouldRequestExecSummary({ resultsLoaded: true, platformError: false, fixesSettled: true })).toBe(true);
  });
});
