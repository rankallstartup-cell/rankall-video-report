import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Item 5: HomepageScanVideo renders default numbers (31 / 78 / 4200) with no
// props on the homepage and /demo, so it must read as an illustrative example:
// labelled "Example", no "Verified" claim, no "LIVE SCAN" / "Your … Score".
describe('HomepageScanVideo is a labelled example', () => {
  const src = readFileSync(join(process.cwd(), 'components/HomepageScanVideo.tsx'), 'utf8');
  it('no verified / live / "your" claims', () => {
    expect(src).not.toMatch(/Verified:/);
    expect(src).not.toContain('LIVE SCAN');
    expect(src).not.toContain('Your AI Visibility Score');
    expect(src).not.toContain('Monthly revenue going to competitor');
    expect(src).not.toContain('Estrella Dental');
  });
  it('labels every number as an example / estimate', () => {
    expect(src).toContain('EXAMPLE SCAN (ILLUSTRATIVE NUMBERS)');
    expect(src).toContain('Example AI Visibility Score');
    expect(src).toContain('Example competitor:');
    expect(src).toContain('Example estimated monthly revenue at stake');
    expect(src).toContain('canonicalFixImpact(EXAMPLE_FIX_TYPE)');
  });
});
