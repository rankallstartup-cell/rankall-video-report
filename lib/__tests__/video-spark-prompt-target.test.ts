import { describe, it, expect } from 'vitest';
import { SPARK_SCRIPT_PROMPT_TARGET } from '../video/sparkScript';

// RT-126 (Day 7 pacing): the script prompt's total-narration target.
// The code check is this exact prompt value — no tolerance band is set
// for "about" (OQ-RT126-1 decided by main), and no rendered length is
// claimed or measured here (no render leg in RT-126).

describe('SPARK_SCRIPT_PROMPT_TARGET (RT-126)', () => {
  it('RT126-1: reads about 840 characters, exactly as routed', () => {
    expect(SPARK_SCRIPT_PROMPT_TARGET).toBe(
      'Target about 840 characters (about 167 words) of total narration.',
    );
  });

  it('RT126-2: states about 167 words alongside the character target', () => {
    expect(SPARK_SCRIPT_PROMPT_TARGET).toContain('167');
    expect(SPARK_SCRIPT_PROMPT_TARGET).toContain('words');
  });

  it('RT126-7: a missing target fails, never silently defaults', () => {
    expect(typeof SPARK_SCRIPT_PROMPT_TARGET).toBe('string');
    expect(SPARK_SCRIPT_PROMPT_TARGET.length).toBeGreaterThan(0);
  });

  it('RT126-3: pacing arithmetic is a calculation, never a render proof', () => {
    // Routed measurement: 50.44 seconds from 700 characters.
    // 50.44 * 840 / 700 = 60.528, i.e. about 60.5 seconds — the routed
    // "about 60 seconds". This asserts the arithmetic only; it is not
    // a rendered length, and no render is run for it.
    expect(50.44 * 840 / 700).toBeCloseTo(60.53, 1);
  });
});
