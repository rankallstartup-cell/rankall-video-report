// lib/platformList.ts
// Item 15: platform-count copy derived from the real scanned list
// (lib/platforms ACTIVE_PLATFORMS, 12 platforms) instead of a hand-written
// "ChatGPT, Gemini, Perplexity, and 9 other" (= 12).

/** "A, B, C, and N other AI platforms" for the given names (named ones first). */
export function platformListSentence(allNames: readonly string[], named: readonly string[]): string {
  const shown = named.filter(n => allNames.includes(n));
  const others = allNames.length - shown.length;
  if (shown.length === 0) return `${allNames.length} AI platforms`;
  if (others <= 0) {
    if (shown.length === 1) return shown[0];
    if (shown.length === 2) return `${shown[0]} and ${shown[1]}`;
    return `${shown.slice(0, -1).join(', ')}, and ${shown[shown.length - 1]}`;
  }
  return `${shown.join(', ')}, and ${others} other AI platform${others === 1 ? '' : 's'}`;
}
