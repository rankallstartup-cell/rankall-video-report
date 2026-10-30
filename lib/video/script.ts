// ── Hackathon video-report: scan → structured 60-second video script ─────
// Provider-agnostic: every video provider consumes this JSON. Builds the
// "wound-first" narrative Rankall uses everywhere — hook on the invisible
// loss, 2–3 concrete findings (their mentions vs. competitors), one CTA.
//
// This is intentionally rule-based for the scaffold so the pipeline works
// with zero AI calls. Days 3–5 of the build can swap the narration writer
// for Meta's Muse Spark while keeping this exact JSON shape.
import type { VideoScript, VideoScriptSection } from './types';

/** Mirrors the real scan schema: rankall_scans columns + platform results. */
export interface PlatformFinding {
  platform: string;
  score: number;
  mentioned: boolean;
  sentiment: 'positive' | 'neutral' | 'negative';
  rank: number | null;
}

export interface ScanVideoInput {
  businessName: string;
  industry?: string | null;
  location?: string | null;
  /**
   * rankall_scans.overall_score. NULL means unknown — never backfilled.
   * The script then states no score instead of inventing one.
   */
  overallScore: number | null;
  /** rankall_scans.mentioned_count — platforms that named the business. NULL = unknown. */
  mentionedCount: number | null;
  /** total platforms the scan ran on. NULL = unknown. */
  totalPlatforms: number | null;
  competitorName?: string | null;
  competitorScore?: number | null;
  /** rankall_platform_results rows, best-first preferred */
  platforms?: PlatformFinding[];
  /** 1–3 trust-signal highlights in plain words, e.g. "missing FAQ schema" */
  signalHighlights?: string[];
  /** Single highest-impact fix, plain words */
  topFix?: string | null;
  /** Where the video's CTA should send the viewer */
  reportUrl?: string;
  /** Public review rating, e.g. 5.0 — from the business's public profile, not the scan. */
  rating?: number | null;
  /** Public review count, e.g. 1186. */
  reviewCount?: number | null;
  /**
   * Qualitative mention descriptor when counts are unknown, e.g.
   * "rarely mentioned". Used verbatim in the hook — it must describe the
   * scan, never a magnitude the data does not support.
   */
  mentionNote?: string | null;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function section(id: string, onScreenText: string, narration: string): VideoScriptSection {
  return { id, onScreenText, narration };
}

export function buildVideoScript(input: ScanVideoInput): VideoScript {
  const biz = input.businessName || 'your business';
  const hasCounts =
    input.mentionedCount != null && input.totalPlatforms != null && input.totalPlatforms > 0;
  const mentioned = hasCounts
    ? clamp(input.mentionedCount as number, 0, Math.max(input.totalPlatforms as number, 1))
    : null;
  const total = hasCounts ? Math.max(input.totalPlatforms as number, 1) : null;
  const score = input.overallScore != null ? clamp(input.overallScore, 0, 100) : null;
  const competitor = input.competitorName?.trim() || null;
  const industry = input.industry?.trim() || null;
  const category = industry ? `${industry.toLowerCase()}s` : 'businesses';
  const mentionNote = input.mentionNote?.trim() || null;

  // ── Hook: the invisible loss, quantified when the data allows ─────────
  // When counts are unknown, the hook uses the qualitative mentionNote
  // verbatim — it never converts "rarely mentioned" into a number.
  const missed = mentioned != null && total != null ? total - mentioned : null;
  let hookNarration: string;
  let hookOnScreen: string;
  if (missed != null && missed > 0) {
    // The director rejects absolute never/nobody claims unless
    // mentionedCount === 0, so the "never knew you lost" line is only
    // legal when the business is mentioned nowhere. Otherwise the wound
    // is share-based and uses only the missed count: customers on those
    // platforms did not reach this business.
    hookNarration =
      input.mentionedCount === 0
        ? `Right now, when customers ask AI for a ${industry ?? 'local business'}, ${biz} goes unmentioned on ${missed} out of ${total} AI platforms. Every one of those is a customer you never knew you lost.`
        : `Right now, when customers ask AI for a ${industry ?? 'local business'}, ${biz} goes unmentioned on ${missed} out of ${total} AI platforms. Every one of those is a customer you didn't reach.`;
    hookOnScreen = 'AI is recommending everyone but you';
  } else if (missed === 0) {
    hookNarration =
      score != null
        ? `${biz} is showing up across AI platforms — but your visibility score of ${score} out of 100 means competitors are still stealing your customers.`
        : `${biz} is showing up across AI platforms — but competitors are still stealing your customers.`;
    hookOnScreen = 'AI is recommending your competitors';
  } else if (mentionNote) {
    hookNarration =
      `Right now, when customers ask AI for a ${industry ?? 'local business'}, ${biz} is ${mentionNote}. Every missed mention is a customer you didn't reach.`;
    hookOnScreen = 'AI rarely mentions you';
  } else {
    hookNarration =
      `Right now, when customers ask AI for a ${industry ?? 'local business'}, ${biz} is losing customers it doesn't know about.`;
    hookOnScreen = 'AI is recommending your competitors';
  }
  const hook = section('hook', hookOnScreen, hookNarration);

  // ── Findings: their mentions vs. the competition ──────────────────────
  const findings: VideoScriptSection[] = [];

  if (score != null && mentioned != null && total != null) {
    findings.push(section(
      'finding-1',
      `Visibility score: ${score}/100`,
      `We scanned ${total} AI platforms. ${biz} scored ${score} out of 100, mentioned on ${mentioned} of them.`,
    ));
  } else if (mentioned != null && total != null) {
    findings.push(section(
      'finding-1',
      `Mentioned on ${mentioned}/${total} platforms`,
      `We scanned ${total} AI platforms. ${biz} was mentioned on ${mentioned} of them.`,
    ));
  } else if (score != null) {
    findings.push(section(
      'finding-1',
      `Visibility score: ${score}/100`,
      `${biz} scored ${score} out of 100 for AI visibility.`,
    ));
  } else if (input.rating != null) {
    const reviews = input.reviewCount != null
      ? ` with ${input.reviewCount.toLocaleString('en-US')} reviews`
      : '';
    findings.push(section(
      'finding-1',
      `${input.rating}-star rated`,
      `${biz} holds a ${input.rating}-star rating${reviews} — real trust that AI answers are not surfacing.`,
    ));
  } else {
    findings.push(section(
      'finding-1',
      'Invisible where it counts',
      `We checked where AI answers point customers — and ${biz} is not the name they hear.`,
    ));
  }

  if (competitor) {
    const compLine = input.competitorScore != null
      ? `${competitor} scored ${clamp(input.competitorScore, 0, 100)} — and when AI answers, customers hear their name first.`
      : `When AI platforms answer, they name ${competitor} — not you.`;
    findings.push(section('finding-2', `${competitor} is winning the AI answer`, compLine));
  } else {
    const worst = (input.platforms ?? [])
      .filter(p => p.mentioned === false)
      .slice(0, 2)
      .map(p => p.platform);
    // Never an absolute "never mention" claim: the director rejects it
    // unless mentionedCount === 0. Scope the claim to this scan instead —
    // these platforms' rows say mentioned=false, so "didn't mention in
    // this scan" is exactly what the data supports.
    const line = worst.length
      ? `${worst.join(' and ')} didn't mention ${biz} in this scan.`
      : `Your weakest spots are the platforms where customers ask first — and you're invisible there.`;
    findings.push(section('finding-2', 'Invisible where it counts', line));
  }

  const highlight = input.signalHighlights?.filter(Boolean).slice(0, 2);
  if (highlight && highlight.length) {
    findings.push(section(
      'finding-3',
      `Fix: ${highlight[0]}`,
      `The fixes are concrete: ${highlight.join(', ')}. ${category} that fix these get recommended more — and we can prove it with a rescan.`,
    ));
  } else {
    findings.push(section(
      'finding-3',
      'The fixes are concrete',
      `The fixes are concrete — missing directory listings, weak reviews, no AI-readable content. Fix them, and a rescan proves you moved.`,
    ));
  }

  // ── CTA: their own report, one action ─────────────────────────────────
  const reportLine = input.reportUrl
    ? `Your full report is ready at ${input.reportUrl.replace(/^https?:\/\//, '')} — your score, every platform, and the exact fixes in order.`
    : `Your full report is ready — your score, every platform, and the exact fixes in order.`;
  const cta = section(
    'cta',
    'See your full report — free',
    `${reportLine} It's free, and it takes two minutes. Don't let AI keep recommending everyone but you.`,
  );

  const all = [hook, ...findings, cta];
  return {
    version: 1,
    title: `Your AI visibility report — ${biz}`,
    targetDurationSeconds: 60,
    hook,
    findings,
    cta,
    fullNarration: all.map(s => s.narration).join('\n\n'),
  };
}
