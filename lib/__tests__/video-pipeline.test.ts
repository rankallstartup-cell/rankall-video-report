import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../video/pipeline';

describe('withRetry', () => {
  it('returns the value after transient failures', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom 1'))
      .mockRejectedValueOnce(new Error('boom 2'))
      .mockResolvedValue('ok');
    await expect(withRetry(fn, 2, 1)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws the last error after exhausting retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));
    await expect(withRetry(fn, 2, 1)).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
