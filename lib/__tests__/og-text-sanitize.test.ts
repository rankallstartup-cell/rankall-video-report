import { describe, it, expect } from 'vitest';
import { sanitizeOgText } from '../ogText';

describe('ticket 12: /api/og/marketing input sanitizer', () => {
  it('falls back on missing, empty or absurdly long input', () => {
    expect(sanitizeOgText(null, 60, 'D')).toBe('D');
    expect(sanitizeOgText('', 60, 'D')).toBe('D');
    expect(sanitizeOgText('x'.repeat(301), 60, 'D')).toBe('D');
    expect(sanitizeOgText('\u0000\u200B  ', 60, 'D')).toBe('D');
  });
  it('strips control, zero-width and bidi-override characters', () => {
    expect(sanitizeOgText('Hi\u0007 there\u202E evil\u2066', 60, 'D')).toBe('Hi there evil');
    expect(sanitizeOgText('line1\nline2\tx', 60, 'D')).toBe('line1 line2 x');
  });
  it('truncates by code point with an ellipsis', () => {
    expect(sanitizeOgText('abcdefghij', 5, 'D')).toBe('abcde…');
    expect(sanitizeOgText('😀😀😀😀', 2, 'D')).toBe('😀😀…');
    expect(sanitizeOgText('short', 60, 'D')).toBe('short');
  });
});
