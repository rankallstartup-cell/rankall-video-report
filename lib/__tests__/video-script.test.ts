import { describe, it, expect } from 'vitest';
import { buildVideoScript } from '../video/script';
import { reviewScript } from '../video/director';

// Hackathon scaffold: the 60-second video script builder is pure and
// provider-agnostic — rule-based now, AI-narration-swappable later.

describe('buildVideoScript', () => {
  const base = {
    businessName: 'Brite Smiles',
    industry: 'Dentist',
    location: 'Austin, TX',
    overallScore: 34,
    mentionedCount: 3,
    totalPlatforms: 12,
    competitorName: 'Smile Bright Co',
    competitorScore: 71,
  };

  it('builds hook + findings + cta with wound-first hook', () => {
    const script = buildVideoScript(base);
    expect(script.version).toBe(1);
    expect(script.targetDurationSeconds).toBe(60);
    expect(script.hook.narration).toContain('Brite Smiles');
    expect(script.hook.narration).toContain('9 out of 12'); // invisible loss
    expect(script.findings.length).toBeGreaterThanOrEqual(2);
    expect(script.findings.length).toBeLessThanOrEqual(3);
    expect(script.findings[1].narration).toContain('Smile Bright Co'); // competitor callout
    expect(script.cta.narration).toMatch(/free/i);
    expect(script.fullNarration).toContain(script.hook.narration);
  });

  it('handles a scan with no competitor and no mentions gracefully', () => {
    const script = buildVideoScript({
      businessName: 'Acme Plumbing',
      overallScore: 0,
      mentionedCount: 0,
      totalPlatforms: 12,
    });
    expect(script.hook.onScreenText).toBeTruthy();
    expect(script.findings.length).toBeGreaterThanOrEqual(2);
    // no crash on missing optional fields; narration never empty
    for (const s of [script.hook, ...script.findings, script.cta]) {
      expect(s.narration.length).toBeGreaterThan(10);
    }
  });

  it('clamps out-of-range scores and counts', () => {
    const script = buildVideoScript({ ...base, overallScore: 140, mentionedCount: 99 });
    expect(script.findings[0].onScreenText).toContain('100/100');
    expect(script.findings[0].narration).toContain('mentioned on 12 of them');
  });

  // Regression: the Oct 26 preview video job failed at the director stage
  // because the rule-based fallback script contained absolute "never"
  // claims while mentionedCount was 10. The fallback must pass the
  // director by construction for any mentionedCount > 0.
  it('passes director review when mentioned on most platforms (no competitor)', () => {
    const input = {
      businessName: 'Tech Ridge Dental',
      industry: 'Dentist',
      location: 'Austin, TX',
      overallScore: 89,
      mentionedCount: 10,
      totalPlatforms: 12,
      platforms: [
        { platform: 'ChatGPT', score: 90, mentioned: true, sentiment: 'positive' as const, rank: 1 },
        { platform: 'Mistral', score: 0, mentioned: false, sentiment: 'neutral' as const, rank: null },
        { platform: 'Kimi', score: 0, mentioned: false, sentiment: 'neutral' as const, rank: null },
      ],
    };
    const script = buildVideoScript(input);
    expect(script.fullNarration).not.toMatch(/\bnever\b/i);
    expect(script.findings[1].narration).toContain("didn't mention Tech Ridge Dental in this scan");
    const report = reviewScript(script, input);
    expect(report.passed).toBe(true);
    expect(report.issues.filter(i => i.severity === 'error')).toEqual([]);
  });

  it('passes director review when mentioned on most platforms (with competitor)', () => {
    const script = buildVideoScript({ ...base, mentionedCount: 10, totalPlatforms: 12 });
    expect(script.fullNarration).not.toMatch(/\bnever\b/i);
    const report = reviewScript(script, { ...base, mentionedCount: 10, totalPlatforms: 12 });
    expect(report.passed).toBe(true);
  });

  it('keeps the never line only when mentionedCount is 0 — and still passes', () => {
    const input = {
      businessName: 'Acme Plumbing',
      overallScore: 0,
      mentionedCount: 0,
      totalPlatforms: 12,
    };
    const script = buildVideoScript(input);
    expect(script.hook.narration).toContain('you never knew you lost');
    const report = reviewScript(script, input);
    expect(report.passed).toBe(true);
  });

  it('passes director review when counts are unknown (mentionNote path)', () => {
    const input = {
      businessName: 'Brite Smiles',
      industry: 'Dentist',
      overallScore: null,
      mentionedCount: null,
      totalPlatforms: null,
      mentionNote: 'rarely mentioned',
    };
    const script = buildVideoScript(input);
    expect(script.fullNarration).not.toMatch(/\bnever\b/i);
    const report = reviewScript(script, input);
    expect(report.passed).toBe(true);
  });
});
