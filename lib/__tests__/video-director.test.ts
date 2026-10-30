import { describe, it, expect } from 'vitest';
import { reviewScript, NO_TEXT_SUFFIX } from '../video/director';
import type { VideoScript } from '../video/types';
import type { ScanVideoInput } from '../video/script';

// Director cases: the Day 1 spike invented "zero AI referrals" and
// "hundreds of high-value patients" from "rarely mentioned". Each case
// below pins one rule that must catch that class of error.

const baseInput: ScanVideoInput = {
  businessName: 'Tech Ridge Dental',
  industry: 'Dentist',
  location: 'North Austin',
  overallScore: 34,
  mentionedCount: 3,
  totalPlatforms: 12,
  rating: 5.0,
  reviewCount: 1186,
};

function makeScript(overrides: Partial<VideoScript>): VideoScript {
  const hook = overrides.hook ?? {
    id: 'hook',
    onScreenText: 'AI is recommending everyone but you',
    narration:
      'Tech Ridge Dental in North Austin, you are losing patients every week to competitors AI names first.',
  };
  const findings = overrides.findings ?? [
    {
      id: 'finding-1',
      onScreenText: 'Visibility score: 34/100',
      narration: 'We scanned 12 AI platforms. Tech Ridge Dental scored 34 out of 100, mentioned on 3 of them.',
    },
  ];
  const cta = overrides.cta ?? {
    id: 'cta',
    onScreenText: 'See your full report — free',
    narration: 'Claim your free report today and see every platform and fix.',
  };
  return {
    version: 1,
    title: 'Your AI visibility report — Tech Ridge Dental',
    targetDurationSeconds: 60,
    hook,
    findings,
    cta,
    fullNarration: [hook, ...findings, cta].map((s) => s.narration).join('\n\n'),
  };
}

describe('reviewScript', () => {
  it('rejects the spike overclaim: "zero AI referrals" when mentions exist', () => {
    const report = reviewScript(
      makeScript({
        findings: [
          {
            id: 'finding-1',
            onScreenText: 'Zero AI referrals',
            narration: 'Zero AI referrals, despite having better reviews than the practices that get recommended.',
          },
        ],
      }),
      baseInput,
    );
    expect(report.passed).toBe(false);
    expect(report.issues.some((i) => i.severity === 'error' && /zero/i.test(i.message))).toBe(true);
  });

  it('rejects the spike overclaim: "hundreds of patients"', () => {
    const report = reviewScript(
      makeScript({
        findings: [
          {
            id: 'finding-1',
            onScreenText: 'Patients lost',
            narration: 'That means hundreds of high-value patients are going straight to your competitors.',
          },
        ],
      }),
      baseInput,
    );
    expect(report.passed).toBe(false);
    expect(report.issues.some((i) => i.severity === 'error' && /hundreds/i.test(i.message))).toBe(true);
  });

  it('rejects invented numbers that are not scan aggregates', () => {
    const report = reviewScript(
      makeScript({
        findings: [
          {
            id: 'finding-1',
            onScreenText: 'Huge gap',
            narration: 'Your competitors score 97 while you score 34, a gap of 63 points.',
          },
        ],
      }),
      baseInput,
    );
    expect(report.passed).toBe(false);
    expect(report.issues.some((i) => /97/.test(i.message))).toBe(true);
  });

  it('passes exact scan numbers, including rating, reviews, and missed count', () => {
    const report = reviewScript(
      makeScript({
        hook: {
          id: 'hook',
          onScreenText: 'AI rarely mentions you',
          narration:
            'Tech Ridge Dental holds a 5.0-star rating with 1,186 reviews, yet AI mentions it on only 3 of 12 platforms.',
        },
        findings: [
          {
            id: 'finding-1',
            onScreenText: 'Visibility score: 34/100',
            narration:
              'Tech Ridge Dental scored 34 out of 100, mentioned on 3 of 12 platforms, missing 9 of them in this 60-second report.',
          },
        ],
      }),
      baseInput,
    );
    expect(report.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(report.passed).toBe(true);
  });

  it('rejects "never" when mentions exist, allows it when mentions are zero', () => {
    const neverScript = makeScript({
      findings: [
        {
          id: 'finding-1',
          onScreenText: 'Never mentioned',
          narration: 'ChatGPT never mentions Tech Ridge Dental at all.',
        },
      ],
    });
    expect(reviewScript(neverScript, baseInput).passed).toBe(false);
    expect(reviewScript(neverScript, { ...baseInput, mentionedCount: 0 }).passed).toBe(true);
  });

  it('rejects weak hooks that do not name the business', () => {
    const report = reviewScript(
      makeScript({
        hook: { id: 'hook', onScreenText: 'Hello', narration: 'You are losing customers.' },
      }),
      baseInput,
    );
    expect(report.passed).toBe(false);
    expect(report.issues.some((i) => i.section === 'hook')).toBe(true);
  });

  it('warns (does not fail) on a CTA with no action language', () => {
    const report = reviewScript(
      makeScript({
        cta: { id: 'cta', onScreenText: 'Thanks', narration: 'That is the whole story for today.' },
      }),
      baseInput,
    );
    expect(report.passed).toBe(true);
    expect(report.issues.some((i) => i.severity === 'warning' && i.section === 'cta')).toBe(true);
  });

  it('attaches no-text scene notes that never name the business', () => {
    const report = reviewScript(makeScript({}), baseInput);
    expect(report.sceneNotes.length).toBeGreaterThanOrEqual(3);
    for (const note of report.sceneNotes) {
      expect(note.prompt).toContain(NO_TEXT_SUFFIX);
      expect(note.prompt).not.toContain('Tech Ridge Dental');
    }
  });
});
