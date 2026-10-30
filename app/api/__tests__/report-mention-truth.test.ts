import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// b02a: (1) the competitor-grid "You ✓" meant RESPONDED, not mentioned;
// (2) appearedOn read the stale stored mentioned_count column while the
// breakdown used the live recCount; (3) the exec summary sent the raw
// stored score while the headline shows the derived currentScore.
// Source-level checks: the report page is a large client component.
const src = readFileSync(
  join(process.cwd(), 'app/report/[id]/page.tsx'),
  'utf8',
);

describe('report page mention/count truth — b02a', () => {
  it('grid checkmark + advantage + beats-you all mean MENTIONED', () => {
    expect(src).not.toContain('r.platform === p.platform && r.response_text');
    expect(src).toContain('r.platform === p.platform && r.mentioned');
  });

  it('appearedOn derives from the live recCount, not the stored column', () => {
    expect(src).toContain('const appearedOn = recCount;');
    expect(src).not.toContain('const appearedOn = scan?.mentioned_count');
    // Derivation intact; only the denominator literal was stale
    // (platform count grew 11 -> 12 with Meta).
    expect(src).toContain("value: `${appearedOn} of 12`");
  });

  it('exec summary sends the headline score + live count', () => {
    // runExecSummary is created before recCount/currentScore are
    // declared, so it recomputes the same live values from scan +
    // results (liveMentioned / liveScore) instead of closing over them.
    // b0fm: "responded" comes from hasResponse (server flag; response
    // text is withheld from logged-out viewers) — same semantics.
    expect(src).toContain('const liveMentioned = results.filter(r => hasResponse(r) && r.mentioned).length;');
    expect(src).toContain('const liveScore = liveMentioned === 0 ? 0 : (scan.overall_score || 0);');
    expect(src).toContain('score: liveScore,');
    expect(src).not.toContain('score: scan.overall_score ?? 0');
    expect(src).toContain('mentionedCount: liveMentioned,');
  });
});
