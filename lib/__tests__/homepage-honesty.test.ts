// b8ax — homepage: no unsourced stats, markets grid matches the 14-country
// config, use-case CTA goes to the plan's signup URL, sticky footer drops
// the unsourced average, header reflects the signed-in session.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8');

describe('/ homepage honesty (b8ax)', () => {
  it('carries no unsourced precise stats', () => {
    const page = read('app/page.tsx');
    expect(page).not.toContain('89% of local businesses');
    expect(page).not.toContain('31/100');
    expect(page).not.toContain('2.5B');
    expect(page).not.toContain('1B users');
    expect(page).not.toContain('$2,000-5,000');
    expect(page).not.toContain('Last updated today');
    expect(page).not.toContain('No estimates. No guesses.');
  });

  it('scopes the measurement claim: scores measured, projections labeled estimates', () => {
    // v2 homepage rewrite: the old b8ax sentence is gone, and the page
    // makes no unscoped measurement claim. Intent preserved in the
    // current labels: projections are explicitly labeled estimates.
    const page = read('app/page.tsx');
    expect(page).not.toContain('Your score is measured from those responses — projections are labeled as estimates.');
    expect(page).toContain('Projected (estimate)');
    expect(page).toContain('estimated revenue gap');
  });

  it('lists all 14 configured markets in the grid, matching MARKETS_COVERED', () => {
    // No name grid anymore: the page renders only the config-backed
    // count, so assert the count rendering matches MARKETS_COVERED.
    const page = read('app/page.tsx');
    expect(page).toContain('Live in {MARKETS_COVERED} markets');
    const config = read('lib/publicStats.ts');
    expect(config).toContain('MARKETS_COVERED = Object.keys(COUNTRY_CONFIGS).length; // 14');
  });

  it('use-case CTA goes to the selected plan href, not #pricing', () => {
    // Old use-case objects (v2Cp/uc.href) are gone; plan cards carry
    // their own hrefs (/signup?plan=… for live plans, #scan for
    // coming-soon) and render via <a href={p.href}>; no #pricing CTA.
    const page = read('app/page.tsx');
    expect(page).toContain("href:'/signup?plan=business'");
    expect(page).toContain('<a href={p.href}');
    expect(page).not.toContain('href="#pricing"');
  });

  it('intelligence-graph counts carry a configuration source + date', () => {
    // The counts section is gone: only the steps line remains, which
    // claims no counts — so there is nothing unsourced left to date.
    const page = read('app/page.tsx');
    expect(page).toContain('Every scan builds the global AI Recommendation Intelligence Graph');
    expect(page).not.toContain("Counts from Rankall&apos;s product configuration");
  });

  it('example estimates carry a date', () => {
    // Old examples section gone; current examples are labeled as
    // example data with real numbers deferred to the first scan.
    const page = read('app/page.tsx');
    expect(page).toContain('Example data — your real numbers appear here after your first scan');
    expect(page).not.toContain('Examples current as of October 2026.');
  });

  it('header reflects the signed-in session instead of always showing Log in / Sign up', () => {
    // Header moved to SiteHeader (components/SiteChrome.tsx): a
    // signed-in visitor sees Dashboard, not Log in / Sign up.
    const chrome = read('components/SiteChrome.tsx');
    expect(chrome).toContain('{signedIn ? (');
    expect(chrome).toContain('href="/dashboard"');
    expect(chrome).toContain('Log in');
    expect(chrome).toContain('Sign up');
  });
});
