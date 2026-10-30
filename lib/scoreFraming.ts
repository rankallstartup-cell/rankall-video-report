// ── Score framing ──────────────────────────────────────────────────────────
// Rankall's core promise is an OUTCOME, never a bare number: "Will ChatGPT send
// customers to you or your competitor?" Every score shown to a user must carry
// the business consequence. These helpers keep that sentence identical across
// the report page, dashboard, homepage, emails, and the viral share card.

export const TOTAL_AI_PLATFORMS = 12;

// The canonical outcome sentence. `appearOn` is the number of AI platforms that
// mention the business (presence, mentioned_count) out of `total` (12). `score`
// is the prominence-weighted AI Visibility Score — a business can appear on
// every platform yet rank low on each one, so presence and prominence are kept
// as separate inputs rather than assumed to move together.
//
// b0ff: `responded` is how many of the `total` platforms actually returned an
// answer. The old sentence used `missing = total - on`, so a platform that
// timed out or errored was reported as "recommending competitors instead of
// you" — a claim with no measurement behind it. Only platforms that RESPONDED
// and did not mention you count as recommending someone else now, and the copy
// says "X of Y platforms that responded". When the caller does not know the
// responded count (`responded` omitted) the sentence states presence only and
// makes no competitor claim.
export function outcomeSentence(
  appearOn: number,
  score: number = 0,
  total: number = TOTAL_AI_PLATFORMS,
  responded?: number,
): string {
  if (typeof responded !== 'number' || !Number.isFinite(responded)) {
    const onUnknown = Math.max(0, Math.min(appearOn, total));
    return `You appear on ${onUnknown} of ${total} AI platforms.`;
  }

  const answered = Math.max(0, Math.min(Math.round(responded), total));
  const on = Math.max(0, Math.min(appearOn, answered));
  const notRecommending = answered - on;
  const silent = total - answered;
  const silentNote = silent > 0
    ? ` ${silent} of ${total} platforms didn't respond to this scan.`
    : '';

  if (answered === 0) {
    return `None of the ${total} AI platforms responded to this scan, so it couldn't be measured. Run a new scan for a real result.`;
  }
  if (notRecommending <= 0 && silent === 0) {
    return score >= 70
      ? `You appear prominently on all ${total} AI platforms — AI recommends you over your competitors.`
      : `You appear on all ${total} AI platforms but with low prominence. Improve your score to rank higher in AI recommendations.`;
  }
  if (notRecommending <= 0) {
    return `You appear on all ${answered} AI platforms that responded.${silentNote}`;
  }
  return `You appear on ${on} of ${answered} AI platforms that responded. ${notRecommending} ${notRecommending === 1 ? 'is' : 'are'} recommending competitors instead of you.${silentNote}`;
}

// Compact variant for tight surfaces (dashboard hero, emails, share cards).
export function outcomeShort(appearOn: number, total: number = TOTAL_AI_PLATFORMS): string {
  const on = Math.max(0, Math.min(appearOn, total));
  return `${on} of ${total} AI platforms recommend you`;
}

// Full headline form: "{score}/100 — {outcome}". Used wherever a raw score is
// the focal number and we want the consequence inline.
export function scoreWithOutcome(
  score: number,
  appearOn: number,
  total: number = TOTAL_AI_PLATFORMS,
  responded?: number,
): string {
  return `${score}/100 — ${outcomeSentence(appearOn, score, total, responded)}`;
}
