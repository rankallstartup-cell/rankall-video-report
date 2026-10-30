// A1 — Alina Phase 0: ONE prompt only + snapshot test.
//
// The builder in lib/constants.ts (buildAlinaPrompt), fed by
// lib/publicStats.ts, is the ONLY prompt source. An older workspace snapshot
// held a hard-coded ALINA_PROMPT string claiming 12 platforms, an
// "SEO Autopilot" tier, and case-study numbers as key results — that string
// must never come back. Repo-wide grep on staging HEAD (Oct 19, 2026)
// confirmed: ALINA_PROMPT appears only in app/api/chat/route.ts as the
// const holding the builder's output; no second hard-coded prompt copy
// exists anywhere in the tree.
//
// This test pins the prompt's pricing truth: it builds the prompt exactly
// the way the chat route does and asserts every founder price (hard-coded
// here, so drift in EITHER direction fails loudly), the injected counts,
// the earned truth rules, and the absence of every stale/second-prompt
// marker.
import { describe, it, expect } from 'vitest';
import { buildAlinaPrompt } from '@/lib/constants';
import {
  FOUNDER_PRICING_USD,
  PLATFORMS_SCANNED,
  TRUST_SIGNALS_LABEL,
  SCAN_TIME_LABEL,
} from '@/lib/publicStats';

// Built exactly the way app/api/chat/route.ts builds it.
function buildPrompt(): string {
  return buildAlinaPrompt({
    tiers: FOUNDER_PRICING_USD,
    platformsScanned: PLATFORMS_SCANNED,
    trustSignalsLabel: TRUST_SIGNALS_LABEL,
    scanTimeLabel: SCAN_TIME_LABEL,
  });
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

// Founder-set USD pricing (Oct 2026) — the snapshot. If Nandish changes a
// founder price, update BOTH lib/publicStats.ts and this list together.
const EXPECTED_PRICING_LINES = [
  '- Local Pro: $39/mo',
  '- Personal Brand Pro: $15/mo',
  '- Product Pro: $45/mo',
  '- Agency: $259/mo',
  '- Enterprise: $499/mo',
  '- Government: $1,200/mo',
  '- SEO: $39/mo',
  '- Global Brand Intelligence: $999/mo',
];

describe('Alina prompt snapshot (A1)', () => {
  it('has exactly one pricing line per founder tier, each exactly once', () => {
    const prompt = buildPrompt();
    expect(FOUNDER_PRICING_USD).toHaveLength(8);
    for (const line of EXPECTED_PRICING_LINES) {
      expect(countOccurrences(prompt, line)).toBe(1);
    }
    // Exactly one PRICING block — a duplicated prompt body would double it.
    expect(countOccurrences(prompt, 'PRICING (USD')).toBe(1);
  });

  it('contains no stale prices', () => {
    const prompt = buildPrompt();
    for (const stale of ['$599', '$119', '$129']) {
      expect(prompt).not.toContain(stale);
    }
    // "$49" needs a digit boundary — a plain substring check would false
    // -positive on the real Enterprise price "$499".
    expect(prompt).not.toMatch(/\$49(?!\d)/);
  });

  it('contains the injected counts, not literals from a second copy', () => {
    const prompt = buildPrompt();
    // Canonical count is 12 (Meta is the 12th); derive from
    // PLATFORMS_SCANNED instead of hardcoding the old 11.
    expect(prompt).toContain(`${PLATFORMS_SCANNED} major AI platforms`);
    expect(prompt).toContain('30+ trust signals');
    expect(prompt).toContain('about 90 seconds');
  });

  it('contains no second-prompt markers', () => {
    const prompt = buildPrompt();
    expect(prompt).not.toContain('12 platforms');
    expect(prompt).not.toContain('SEO Autopilot');
    expect(prompt).not.toContain('key results');
  });

  it('keeps every earned truth rule word-for-word', () => {
    const prompt = buildPrompt();
    expect(prompt).toContain('7-day free trial');
    expect(prompt).toContain('A card is required upfront');
    expect(prompt).toContain('verification rescan about 7 days later');
    // A2: Appendix A wording — "Never promise…", not "Do not promise…".
    expect(prompt).toContain('Never promise weekly or automatic rescans');
    expect(prompt).toContain('NO verified customer results');
    expect(prompt).toContain('illustrative composites, not real customers');
    expect(prompt).toContain('hello@rankall.io');
  });

  it('is the Appendix A prompt (A2): job-first, tools, style by intent', () => {
    const prompt = buildPrompt();
    expect(prompt).toContain('YOUR JOB');
    expect(prompt).toContain('TOOLS — USE THEM, DO NOT GUESS');
    expect(prompt).toContain('get_pricing');
    expect(prompt).toContain('start_free_scan');
    expect(prompt).toContain('get_fix_plan');
    expect(prompt).toContain('capture_lead');
    expect(prompt).toContain('Simple questions get 2–4 short sentences');
    expect(prompt).toContain('One next step, not three');
    expect(prompt).toContain('There is also a Free plan');
    expect(prompt).toContain('Meta AI support is coming soon — never say it is live');
    expect(prompt).toContain('Missing data is "not checked"');
  });
});
