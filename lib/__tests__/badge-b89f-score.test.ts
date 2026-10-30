import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { badgeScore, badgeGrade } from '@/lib/badgeScore';

// b89f — the badge (dashboard preview AND the public SVG customers
// embed) preferred trust_signals.overall over overall_score, so a
// business with AI Visibility 2 and Trust 50 published
// "50/100 AI Visibility Score". The badge number is now always the
// visibility score, and its word is the canonical grade.

describe('b89f — badgeScore', () => {
  it('returns overall_score even when a Trust overall exists', () => {
    expect(badgeScore({ overall_score: 2 })).toBe(2);
    expect(badgeScore({ overall_score: 84 })).toBe(84);
    expect(badgeScore({ overall_score: null })).toBe(0);
  });

  it('grades with the canonical bands', () => {
    expect(badgeGrade(2)).toBe('Not Visible');
    expect(badgeGrade(50)).toBe('Emerging');
    expect(badgeGrade(84)).toBe('Strong');
  });
});

const page = readFileSync(join(process.cwd(), 'app/dashboard/badge/page.tsx'), 'utf8');
const api = readFileSync(join(process.cwd(), 'app/api/badge/[scanId]/route.ts'), 'utf8');

describe('b89f — both surfaces use the helper', () => {
  it('neither surface reads trust overall for the badge number', () => {
    expect(page).toContain('badgeScore(scan)');
    expect(api).toContain('badgeScore(scan)');
    expect(api).not.toContain('trust_signals as { overall?: number } | null)?.overall ?? scan.overall_score');
    expect(page).not.toContain('trust_signals as any)?.overall ?? scan.overall_score');
  });

  it('the SVG pill uses the canonical grade, not Strong/Moderate/Weak', () => {
    expect(api).toContain('badgeGrade(score)');
    expect(api).not.toContain("'Moderate'");
  });

  it('the page dates the score and separates Trust explicitly', () => {
    expect(page).toContain('From your latest scan');
    expect(page).toContain('Your Trust Score is a separate number');
  });

  it('the unsupported recommendation claim is gone', () => {
    expect(page).not.toContain('Shows that ChatGPT, Gemini, and Perplexity recommend your business');
  });

  it('signed-out visitors get a sign-in state, not "No scan found"', () => {
    expect(page).toContain('Sign in to view your score badge.');
    expect(page).toContain('/login?next=/dashboard/badge');
  });
});
