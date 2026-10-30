import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b896 — /cities minor flags that are this page's own: the
// Washington entry rendered "Washington DC DC" (label already ends
// with the region), and the subhead/metadata claimed "every city"
// while the list deliberately includes districts/neighbourhoods.

const page = readFileSync(join(process.cwd(), 'app/cities/page.tsx'), 'utf8');

describe('b896 — /cities labels', () => {
  it('never prints the region twice', () => {
    expect(page).toContain("cit.label.endsWith(` ${cit.country ?? cit.state}`)");
  });

  it('the claim matches the list: cities and districts', () => {
    expect(page).toContain('Every city and district Rankall tracks');
    expect(page).toContain('in every city and district we track');
    expect(page).not.toContain('Every city Rankall tracks');
  });
});
