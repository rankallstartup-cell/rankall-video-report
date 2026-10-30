// b8b0-adjacent / b8az — /press: honest empty state, true word counts,
// sourced stats, per-story pitch mailtos, honest copy confirmation.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8');

// The boilerplates are built from the same constants the page uses.
import { PLATFORMS_SCANNED, MARKETS_COVERED } from '@/lib/publicStats';

const SHORT = `Rankall.io is the AI visibility platform for local businesses. We scan ${PLATFORMS_SCANNED} AI platforms across ${MARKETS_COVERED} countries to show businesses why ChatGPT, Gemini, and ${PLATFORMS_SCANNED - 2} other AI systems recommend their competitor instead of them — and how to fix it.`;
const LONG = `Rankall.io is an AI visibility platform built specifically for local businesses. As AI platforms like ChatGPT, Gemini, and Perplexity become the primary way consumers discover local services, Rankall helps businesses understand and improve how they appear in AI recommendations. Our platform scans ${PLATFORMS_SCANNED} AI systems across ${MARKETS_COVERED} countries, provides actionable fix recommendations, and verifies improvements — giving local businesses the tools to compete in the AI-first discovery era. Rankall serves dentists, lawyers, HVAC companies, restaurants, and other local service businesses.`;

const wc = (s: string) => s.split(/\s+/).filter(Boolean).length;

describe('/press honesty (b8az)', () => {
  it('word-count labels are computed from the real text (40 / 80, not 50 / 100)', () => {
    expect(wc(SHORT)).toBe(40);
    expect(wc(LONG)).toBe(80);
    const page = read('app/press/PressPageClient.tsx');
    expect(page).not.toContain('Short (50 words)');
    expect(page).not.toContain('Long (100 words)');
    expect(page).toContain('SHORT_BOILERPLATE.split');
    expect(page).toContain('LONG_BOILERPLATE.split');
  });

  it('states the honest empty state: no press coverage yet', () => {
    const page = read('app/press/PressPageClient.tsx');
    expect(page).toContain('No press coverage yet');
  });

  it('sources the Key Statistics (platform config, October 2026)', () => {
    const page = read('app/press/PressPageClient.tsx');
    expect(page).toContain('platform configuration, October 2026');
  });

  it('each pitch link names its story in subject + body', () => {
    const page = read('app/press/PressPageClient.tsx');
    expect(page).toContain('Story pitch: ${a.title}');
    expect(page).toContain("I'd like to cover: ${a.title}");
  });

  it('Copy buttons only claim success on a real clipboard write', () => {
    const page = read('app/press/PressPageClient.tsx');
    expect(page).toContain('navigator.clipboard.writeText(text).then');
  });
});
