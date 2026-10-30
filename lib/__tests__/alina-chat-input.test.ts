// A9 — raised caps: 20 messages / 10,000 total chars. Per-message cap
// (1,000), same-role merging, and last-turn-must-be-user are unchanged.
import { describe, it, expect } from 'vitest';
import { sanitizeChatMessages, CHAT_MAX_MESSAGES, CHAT_MAX_TOTAL_CHARS, CHAT_MAX_MESSAGE_CHARS } from '@/lib/chatInput';

describe('chatInput caps (A9)', () => {
  it('raised caps are 20 messages / 10,000 total chars', () => {
    expect(CHAT_MAX_MESSAGES).toBe(20);
    expect(CHAT_MAX_TOTAL_CHARS).toBe(10000);
    expect(CHAT_MAX_MESSAGE_CHARS).toBe(1000);
  });

  it('caps history at 20 turns (was 12)', () => {
    // 21 alternating turns ending on the user: the most recent 20 start
    // with an assistant turn, which the (unchanged) leading-user rule
    // trims -> 19 kept, first + last user.
    const raw = Array.from({ length: 21 }, (_, i) => ({
      role: i % 2 ? 'assistant' as const : 'user' as const,
      content: `turn ${i}`,
    }));
    const out = sanitizeChatMessages(raw);
    expect(out).toHaveLength(19);
    expect(out?.[0].role).toBe('user');
    expect(out?.[out.length - 1].role).toBe('user');
    // 25 turns: same cap, same trim.
    const longer = Array.from({ length: 25 }, (_, i) => ({
      role: i % 2 ? 'assistant' as const : 'user' as const,
      content: `turn ${i}`,
    }));
    const out2 = sanitizeChatMessages(longer);
    expect(out2).toHaveLength(19);
    expect(out2?.[0].role).toBe('user');
    expect(out2?.[out2.length - 1].role).toBe('user');
  });

  it('keeps up to 10,000 total chars', () => {
    // 13 turns ending on the user; 13 × 900 = 11,700 > 10,000 → the
    // oldest turns drop (11 kept = 9,900).
    const raw = Array.from({ length: 13 }, (_, i) => ({
      role: i % 2 ? 'assistant' as const : 'user' as const,
      content: 'x'.repeat(900),
    }));
    const out = sanitizeChatMessages(raw);
    const total = (out ?? []).reduce((sum, m) => sum + m.content.length, 0);
    expect(total).toBeLessThanOrEqual(10000);
    expect(total).toBeGreaterThan(9000);
    expect(out?.[out.length - 1].role).toBe('user');
  });

  it('per-message cap, merging, and last-turn rules are unchanged', () => {
    const long = sanitizeChatMessages([{ role: 'user', content: 'y'.repeat(5000) }]);
    expect(long?.[0].content.length).toBe(1000);
    const merged = sanitizeChatMessages([
      { role: 'user', content: 'one' },
      { role: 'user', content: 'two' },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: 'three' },
    ]);
    expect(merged?.map((m) => m.content)).toEqual(['one\n\ntwo', 'reply', 'three']);
    expect(sanitizeChatMessages([{ role: 'user', content: 'q' }, { role: 'assistant', content: 'a' }])).toBeNull();
    expect(sanitizeChatMessages([{ role: 'assistant', content: 'hello' }])).toBeNull();
  });
});
