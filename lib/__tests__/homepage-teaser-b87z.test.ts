import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// b87z (visitor free-scan journey) — the post-scan teaser
// presented the CATEGORY LEADER's numbers as "YOUR" visibility,
// called a 1-of-11 tie "Outranking you", and showed an
// unexplained simulator (78 -> 85, $4,476/yr). The teaser has
// since been rebuilt on HEAD to derive from the scan subject's
// OWN coverage (ax7w) with the simulator on the canonical
// revenue model — what remained: the tie wording and the
// unlabelled revenue estimate.

const page = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8');

describe('b87z — homepage teaser honesty', () => {
  it('a tie is a tie — "outranking" requires strictly more mentions', () => {
    expect(page).toContain('competitorMentions > scanSubjectMentions');
    expect(page).toContain('Tied with you:');
    expect(page).toContain('You lead');
  });

  it('the simulator labels its estimates', () => {
    expect(page).toContain('Projected (estimate)');
    expect(page).toContain('Estimated revenue recovery:');
  });

  it('the teaser derives from the subject’s own scan (ax7w invariants intact)', () => {
    expect(page).toContain('scanSubjectMentions == null');
    expect(page).toContain('competitorScore: null, // never invented');
    expect(page).toContain('revenueGapForScan({');
  });
});
