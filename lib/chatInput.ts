// Input caps for the public Alina chatbot route (/api/chat). Pure.
// A9: history raised to 20 messages / 10,000 total chars (was 12 / 6,000)
// so a longer conversation survives. Per-message cap, same-role merging,
// and last-turn-must-be-user are UNCHANGED.
export const CHAT_MAX_MESSAGES = 20;          // history sent to the model
export const CHAT_MAX_MESSAGE_CHARS = 1000;   // per message
export const CHAT_MAX_TOTAL_CHARS = 10000;    // whole history

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

/**
 * Normalise client-sent history into something safe to forward:
 * - only {role: 'user'|'assistant', content: string} items are kept,
 * - each message trimmed and capped, empty ones dropped,
 * - leading assistant turns dropped (the API requires a user turn first;
 *   the widget opens with an assistant greeting),
 * - consecutive same-role turns merged so roles alternate,
 * - only the most recent CHAT_MAX_MESSAGES / CHAT_MAX_TOTAL_CHARS kept.
 * Returns null when nothing usable remains or the last turn is not the
 * user's (nothing to answer).
 */
export function sanitizeChatMessages(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw)) return null;
  const cleaned: ChatMessage[] = [];
  for (const m of raw.slice(-50)) {
    if (!m || typeof m !== 'object') continue;
    const role = (m as { role?: unknown }).role;
    const content = (m as { content?: unknown }).content;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') continue;
    const text = content.trim().slice(0, CHAT_MAX_MESSAGE_CHARS);
    if (!text) continue;
    const prev = cleaned[cleaned.length - 1];
    if (prev && prev.role === role) {
      prev.content = `${prev.content}\n\n${text}`.slice(0, CHAT_MAX_MESSAGE_CHARS);
    } else {
      cleaned.push({ role, content: text });
    }
  }
  // Keep the most recent turns within both caps.
  let kept: ChatMessage[] = [];
  let total = 0;
  for (let i = cleaned.length - 1; i >= 0 && kept.length < CHAT_MAX_MESSAGES; i--) {
    total += cleaned[i].content.length;
    if (total > CHAT_MAX_TOTAL_CHARS) break;
    kept.unshift(cleaned[i]);
  }
  while (kept.length && kept[0].role !== 'user') kept = kept.slice(1);
  if (!kept.length || kept[kept.length - 1].role !== 'user') return null;
  return kept;
}
