// b8ay — /personal: no unsourced 2.5B claim, example labelled in the
// heading, all 12 platforms in the example grid, estimate ranges
// attributed to the fix generator, trial CTAs named as trials.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8');

const PLATFORMS = [
  'ChatGPT', 'Gemini', 'Google AI', 'Copilot', 'Perplexity',
  'Grok', 'Claude', 'DeepSeek', 'Mistral', 'Kimi', 'Groq', 'Meta AI',
];

describe('/personal honesty (b8ay)', () => {
  it('carries no unsourced 2.5B / 2.5 billion claim', () => {
    const page = read('app/personal/PersonalClient.tsx');
    expect(page).not.toContain('2.5 billion');
    expect(page).not.toContain('2.5B');
  });

  it('labels the example in the heading itself, not only the subline', () => {
    const page = read('app/personal/PersonalClient.tsx');
    expect(page).toContain('Example report: Dr. Sarah Johnson');
    expect(page).not.toContain("Here's what we found for");
  });

  it('shows all 12 platforms in the example grid, not a 6-name subset', () => {
    const page = read('app/personal/PersonalClient.tsx');
    for (const name of PLATFORMS) {
      expect(page).toContain(`name: '${name}'`);
    }
  });

  it('attributes the estimate ranges to the fix generator, not measured results', () => {
    const page = read('app/personal/PersonalClient.tsx');
    expect(page).toContain('Est. +10–18 pts');
    expect(page).toContain('Est. +6–12 pts');
    expect(page).toContain('Est. +8–15 pts');
    expect(page).toContain('Est. +8–20 pts');
    expect(page).toContain('projections, not measured results');
    const generator = read('app/api/personal-fix/route.ts');
    expect(generator).toContain('Expected score improvement: +10 to +18 points');
    expect(generator).toContain('Expected score improvement: +6 to +12 points');
    expect(generator).toContain('Expected score improvement: +8 to +15 points');
    expect(generator).toContain('+8 to +20 points');
  });

  it('trial CTAs are named trials, not free scans (the flow needs a card)', () => {
    const page = read('app/personal/PersonalClient.tsx');
    expect(page).not.toContain('Scan My Name Free');
    expect(page).not.toContain('Get My Personal AI Report');
    expect(page).toContain('Start Free Trial');
  });
});
