// ── Hackathon video-report: director review pass (agentic layer) ───────
// The director checks a draft script against the scan aggregates BEFORE
// anything is narrated or rendered. It catches exactly the failure class
// the Day 1 spike produced: the model turned "rarely mentioned" into
// "zero AI referrals" and "hundreds of high-value patients" — neither
// number was in the data. Every number in the script must be traceable
// to a scan aggregate, or the draft is rejected for repair.
//
// The director never rewrites silently: it returns issues, and the
// pipeline either repairs via the script writer or falls back to the
// rule-based script (which is constructed from numbers, so it passes
// by construction). Scene notes always carry the no-text suffix — the
// Day 1 spike taught us that rendered signage invents wrong business
// names, so prompts must never invite text, signage, or logos.
import type { VideoScript, VideoScriptSection } from './types';
import type { ScanVideoInput } from './script';

export interface DirectorIssue {
  severity: 'error' | 'warning';
  section: string;
  message: string;
}

export interface SceneNote {
  sectionId: string;
  /** Image/B-roll prompt. Never contains the business name (signage risk). */
  prompt: string;
}

export interface DirectorReport {
  passed: boolean;
  issues: DirectorIssue[];
  sceneNotes: SceneNote[];
  /** Every digit-number found in the script (for audit trails). */
  checkedNumbers: number[];
}

/** Mandatory suffix on every image/B-roll prompt (spike lesson). */
export const NO_TEXT_SUFFIX = 'no text, no signage, no logos';

// Vague magnitudes are never verifiable from scan data — "hundreds of
// patients" is not a number the scan contains, whatever the true count.
const VAGUE_MAGNITUDES = /\b(hundreds|thousands|millions|billions|dozens)\b/gi;
const ABSOLUTE_ZERO = /\bzero\b/gi;
const ABSOLUTE_NEVER = /\b(never|nobody|no one)\b/gi;
const DIGIT_NUMBER = /\b\d[\d,]*(\.\d+)?\b/g;
// CTA language the director expects (warning, not error, when absent).
const CTA_LANGUAGE = /\b(free|report|claim|click|sign up|signup)\b/i;

function collectAllowedNumbers(input: ScanVideoInput): Set<number> {
  const allowed = new Set<number>();
  const add = (n: number | null | undefined) => {
    if (n != null && Number.isFinite(n)) allowed.add(n);
  };
  add(input.overallScore);
  add(input.mentionedCount);
  add(input.totalPlatforms);
  if (input.mentionedCount != null && input.totalPlatforms != null) {
    add(input.totalPlatforms - input.mentionedCount); // missed count
  }
  add(input.competitorScore);
  add(input.rating);
  add(input.reviewCount);
  for (const p of input.platforms ?? []) {
    add(p.score);
    add(p.rank);
  }
  // Structural constants: 60 = target runtime, 100 = score scale (only
  // when a score exists — otherwise "out of 100" implies a score claim).
  allowed.add(60);
  if (input.overallScore != null) allowed.add(100);
  return allowed;
}

function closeEnough(found: number, allowed: Set<number>): boolean {
  for (const a of allowed) {
    if (Math.abs(found - a) < 0.01) return true;
  }
  return false;
}

function allSections(script: VideoScript): VideoScriptSection[] {
  return [script.hook, ...script.findings, script.cta];
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function scenePromptFor(section: VideoScriptSection, input: ScanVideoInput): string {
  const place = [input.industry, input.location].filter(Boolean).join(', ');
  const setting =
    section.id === 'hook'
      ? 'a customer asking a phone assistant for a recommendation, worried expression'
      : section.id === 'cta'
        ? 'a happy customer leaving a modern clinic, sunny exterior'
        : 'a bright modern clinic interior, professional staff at work';
  return `${setting}${place ? `, ${place}` : ''}, photorealistic, ${NO_TEXT_SUFFIX}`;
}

/**
 * Review a draft script against the scan aggregates. Pure function —
 * no I/O, fully unit-testable. passed === true only when there are no
 * error-severity issues (warnings do not block).
 */
export function reviewScript(script: VideoScript, input: ScanVideoInput): DirectorReport {
  const issues: DirectorIssue[] = [];
  const checkedNumbers: number[] = [];
  const allowed = collectAllowedNumbers(input);
  const sections = allSections(script);

  for (const section of sections) {
    const text = `${section.onScreenText}\n${section.narration}`;

    // 1. Every digit-number must be a scan aggregate (or 60/100 structural).
    for (const match of text.matchAll(DIGIT_NUMBER)) {
      const value = Number(match[0].replace(/,/g, ''));
      checkedNumbers.push(value);
      if (!closeEnough(value, allowed)) {
        issues.push({
          severity: 'error',
          section: section.id,
          message: `Number ${match[0]} is not in the scan data — remove it or replace it with a real aggregate.`,
        });
      }
    }

    // 2. Vague magnitudes are unverifiable by construction.
    for (const match of text.matchAll(VAGUE_MAGNITUDES)) {
      issues.push({
        severity: 'error',
        section: section.id,
        message: `Vague magnitude "${match[0]}" cannot be verified from the scan — use the exact scan number or drop the claim.`,
      });
    }

    // 3. Absolute zero claims need mentionedCount === 0 in the data.
    if (ABSOLUTE_ZERO.test(text)) {
      ABSOLUTE_ZERO.lastIndex = 0;
      if (input.mentionedCount !== 0) {
        issues.push({
          severity: 'error',
          section: section.id,
          message: `"zero" claim is not supported: the scan does not show zero mentions (mentionedCount is ${input.mentionedCount ?? 'unknown'}).`,
        });
      }
    }
    ABSOLUTE_ZERO.lastIndex = 0;

    // 4. Absolute never/nobody claims need mentionedCount === 0.
    if (ABSOLUTE_NEVER.test(text)) {
      ABSOLUTE_NEVER.lastIndex = 0;
      if (input.mentionedCount !== 0) {
        issues.push({
          severity: 'error',
          section: section.id,
          message: `Absolute "${text.match(ABSOLUTE_NEVER)?.[0] ?? 'never'}" claim is not supported: mentionedCount is ${input.mentionedCount ?? 'unknown'}, not zero.`,
        });
      }
    }
    ABSOLUTE_NEVER.lastIndex = 0;
  }

  // 5. Weak-hook check: the hook must name the business and carry weight.
  const hookWords = wordCount(script.hook.narration);
  if (hookWords < 15) {
    issues.push({
      severity: 'error',
      section: 'hook',
      message: `Hook is too weak (${hookWords} words) — a 60-second video needs a hook that names the loss.`,
    });
  }
  if (!script.hook.narration.toLowerCase().includes(input.businessName.toLowerCase())) {
    issues.push({
      severity: 'error',
      section: 'hook',
      message: 'Hook does not name the business — the video must be about THIS business.',
    });
  }

  // 6. CTA language (warning only — a CTA without an action is weak, not dishonest).
  const ctaText = `${script.cta.onScreenText}\n${script.cta.narration}`;
  if (!CTA_LANGUAGE.test(ctaText)) {
    issues.push({
      severity: 'warning',
      section: 'cta',
      message: 'CTA has no clear action (free report / claim / click) — consider strengthening it.',
    });
  }

  const sceneNotes: SceneNote[] = sections.map((s) => ({
    sectionId: s.id,
    prompt: scenePromptFor(s, input),
  }));

  return {
    passed: issues.every((i) => i.severity !== 'error'),
    issues,
    sceneNotes,
    checkedNumbers,
  };
}
