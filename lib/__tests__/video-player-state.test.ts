// Player state machine (lib/video/playerState.ts): polling states, stall
// threshold, URL safety, elapsed formatting — all pure, all tested.
import { describe, it, expect } from 'vitest';
import {
  POLL_INTERVAL_MS,
  STALL_AFTER_MS,
  formatElapsed,
  isSafeVideoUrl,
  isStalled,
  playerStatusFor,
} from '@/lib/video/playerState';

describe('isSafeVideoUrl', () => {
  it('accepts http(s) only', () => {
    expect(isSafeVideoUrl('https://cdn.heygen.com/v.mp4')).toBe(true);
    expect(isSafeVideoUrl('http://example.com/v.mp4')).toBe(true);
    expect(isSafeVideoUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeVideoUrl('data:text/html,<script>')).toBe(false);
    expect(isSafeVideoUrl('')).toBe(false);
    expect(isSafeVideoUrl(null)).toBe(false);
    expect(isSafeVideoUrl(undefined)).toBe(false);
    expect(isSafeVideoUrl('not a url')).toBe(false);
  });
});

describe('formatElapsed', () => {
  it('formats seconds and minutes, never a percentage', () => {
    expect(formatElapsed(0)).toBe('0s');
    expect(formatElapsed(45000)).toBe('45s');
    expect(formatElapsed(150000)).toBe('2m 30s');
    expect(formatElapsed(-100)).toBe('0s');
    expect(formatElapsed(90000)).not.toContain('%');
  });
});

describe('stall detection', () => {
  it('polls every 15s and stalls at 15 minutes', () => {
    expect(POLL_INTERVAL_MS).toBe(15_000);
    expect(STALL_AFTER_MS).toBe(15 * 60 * 1000);
    expect(isStalled(STALL_AFTER_MS - 1)).toBe(false);
    expect(isStalled(STALL_AFTER_MS)).toBe(true);
  });
});

describe('playerStatusFor', () => {
  it('maps job records to player states, honestly', () => {
    expect(playerStatusFor({ status: 'processing' }, 60_000)).toBe('preparing');
    expect(playerStatusFor({ status: 'processing' }, STALL_AFTER_MS)).toBe('stalled');
    expect(playerStatusFor({ status: 'failed' }, 0)).toBe('failed');
    expect(
      playerStatusFor({ status: 'complete', videoUrl: 'https://cdn.heygen.com/v.mp4' }, 0),
    ).toBe('ready');
    // Complete WITHOUT a usable URL is a failure, never a broken player.
    expect(playerStatusFor({ status: 'complete', videoUrl: null }, 0)).toBe('failed');
    expect(playerStatusFor({ status: 'complete' }, 0)).toBe('failed');
    expect(
      playerStatusFor({ status: 'complete', videoUrl: 'javascript:alert(1)' }, 0),
    ).toBe('failed');
  });
});
