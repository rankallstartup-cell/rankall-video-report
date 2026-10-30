import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ax7w: after a CATEGORY search, the submitted-business section (summary,
// pain, gap, leak, market map, monopoly, window, ownership, cost) must use
// the business's OWN result, never the category-phrase mentionedCount; an
// unchecked business gets an honest "not checked yet" state.
describe('ax7w homepage uses the business\'s own mentions', () => {
  const src = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8');
  const start = src.indexOf('{ownBizMentions == null ? (');
  const end = src.indexOf('{/* Google data — compact */}');
  const section = src.slice(start, end);

  it('the section is gated on the own-business result', () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(section).toContain("We didn&apos;t check {bizName.trim()} yet");
    expect(section).toContain('Run a business scan');
  });

  it('no block in the section reads the phrase-based mentionedCount', () => {
    // comments may mention it; code must not read it
    const code = section.replace(/\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    // (a `mentionedCount:` object key passing the OWN count is fine)
    expect(code).not.toMatch(/\bmentionedCount\b(?!\s*:)/);
    expect(section).not.toContain('scanResults.filter(r => (r.mentionRate ?? 0) > 0)');
  });

  it('own mentions come from the extracted entry or a same-business scan', () => {
    expect(src).toContain('const ownBizMentions: number | null = userBizMatch');
    expect(src).toContain('businessNamesMatch(scannedBizName, bizName.trim())');
    expect(src).toContain('setUserBizMatch(match ?? null)');
  });

  it('top visibility card, results line and simulator teaser use the scan subject, not the phrase', () => {
    const top = src.slice(src.indexOf('{/* Searched business visibility + competitor context */}'), src.indexOf('{/* Queries */}'));
    expect(top).toContain('scanSubjectMentions == null ?');
    expect(top).not.toMatch(/\bmentionedCount\b/);
    expect(top).not.toContain('appears in {mentionedCount}');
    expect(src).toContain('const scanSubjectMentions: number | null = userBizMatch');
    // results line: phrase counts only on a business-name scan
    expect(src).toContain('{scannedBizName && scanMeta && scanMeta.totalOpportunities > 0');
    // teaser: no fallback to the phrase count
    expect(src).not.toContain('userBizMatch?.mentions ?? mentionedCount');
    expect(src).toContain('const effectiveMentions = scanSubjectMentions;');
  });
});
