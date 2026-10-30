import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b878 — the report's diagnosis prose fabricated a competitor
// stat: "DTX Dental Studio appears across 7 sources including
// Google, Yelp, Healthgrades, and Facebook" — those were the
// BUSINESS'S OWN citation_sources (7 in the scan row), handed
// to the model unlabeled ("Citation sources found:") inside a
// prompt whose paragraph 1 demanded a competitor comparison
// for which NO competitor measurement exists. The prompt now
// labels ownership and forbids competitor figures outright.

const route = readFileSync(join(process.cwd(), 'app/api/gap-narrative/route.ts'), 'utf8');

describe('b878 — gap narrative cannot misattribute', () => {
  it('citation sources are labelled as the business’s own', () => {
    expect(route).toContain('Citation sources where THIS business was found:');
    expect(route).toContain('these belong to the business above, NEVER to the competitor');
    expect(route).not.toContain('Citation sources found: ${citationSources');
  });

  it('the absence of competitor measurement is stated as a hard rule', () => {
    expect(route).toContain('no competitor scan exists');
    expect(route).toContain('Do not state ANY number, count, source list, or presence claim for the competitor');
    expect(route).toContain('Never attribute this business');
  });

  it('paragraph 1 no longer demands an unmeasured competitor comparison', () => {
    expect(route).not.toContain('how many platforms mention the competitor vs them');
    expect(route).toContain('No competitor figures exist, so none may be stated.');
  });
});
