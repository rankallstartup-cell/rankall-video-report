import { describe, it, expect } from 'vitest';
import {
  shouldRetrySparkScript, SparkRetryPending, SPARK_MAX_ATTEMPTS,
} from '../video/pipeline';

const EMPTY = 'Spark returned empty content — this is the known reasoning-token gotcha; max_tokens must stay at 4000';
const WRAPPED = `[script] ${EMPTY}`;

describe('shouldRetrySparkScript (Day 7 bounded cross-invocation retries)', () => {
  it('retries an empty-content failure while attempts remain', () => {
    expect(shouldRetrySparkScript(EMPTY, 0)).toEqual({ retry: true, attempts: 1 });
    expect(shouldRetrySparkScript(EMPTY, 1)).toEqual({ retry: true, attempts: 2 });
  });

  it('matches the wrapped "[script] ..." pipeline error text', () => {
    expect(shouldRetrySparkScript(WRAPPED, 0)).toEqual({ retry: true, attempts: 1 });
  });

  it('stops retrying once the cap is reached and falls back instead', () => {
    expect(shouldRetrySparkScript(EMPTY, SPARK_MAX_ATTEMPTS - 1)).toEqual({
      retry: false,
      attempts: SPARK_MAX_ATTEMPTS,
    });
    expect(shouldRetrySparkScript(EMPTY, SPARK_MAX_ATTEMPTS)).toEqual({
      retry: false,
      attempts: SPARK_MAX_ATTEMPTS + 1,
    });
  });

  it('never retries non-empty failures (auth, quota, network)', () => {
    expect(shouldRetrySparkScript('Spark request failed: 401 unauthorized', 0)).toEqual({
      retry: false,
      attempts: 1,
    });
    expect(shouldRetrySparkScript('fetch failed', 0)).toEqual({ retry: false, attempts: 1 });
  });

  it('honors a custom cap', () => {
    expect(shouldRetrySparkScript(EMPTY, 0, 1)).toEqual({ retry: false, attempts: 1 });
    expect(shouldRetrySparkScript(EMPTY, 0, 2)).toEqual({ retry: true, attempts: 1 });
  });
});

describe('SparkRetryPending', () => {
  it('carries the incremented attempt count and reads as an Error', () => {
    const err = new SparkRetryPending(2);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('SparkRetryPending');
    expect(err.attempts).toBe(2);
  });
});
