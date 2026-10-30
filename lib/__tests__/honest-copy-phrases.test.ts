import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { CASES } from '../constants';
import { canonicalFixImpact } from '../fixIntelligence';

// Fix round 3 (truthful copy): phrases that were invented numbers, fake
// testimonials or unkept promises must never come back in user-facing code.
// Comments and tests are allowed to mention them (they explain the history).

const ROOT = process.cwd();
const SCAN_DIRS = ['app', 'components', 'lib', 'public'];
const EXTS = /\.(tsx?|jsx?|html|txt|json|md)$/;

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[] = [];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXTS.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

// Drop block comments, then whole-line // and JSX {/* */} comment lines.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(l => !/^\s*(\/\/|\*|\{\s*\/\*)/.test(l))
    .join('\n');
}

const BANNED: Array<string | RegExp> = [
  /60 seconds/i, /60-second/i, '60+', '#1 signal', '#1 trust signal', '3×', '3x more',
  '78%', '94%', '95% of', /30[–-]60 days/, /Days 30[–-]60/, /30[–-]45 days/,
  /weekly rescan/i, /rescan your business weekly/i, /monitored every day/i,
  '$599', '$169', '$199', '$15,000', '$50,000', '+47', /38 DAYS/i,
  '94% confidence', /\+18 ?pts predicted/, 'Businesses that fixed their AI visibility',
  'Real example scan',
];

describe('no invented numbers or unkept promises in user-facing code', () => {
  const files = SCAN_DIRS.flatMap(d => walk(join(ROOT, d)));

  it('scans a meaningful set of files', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('none of the banned phrases appear outside comments/tests', () => {
    const hits: string[] = [];
    for (const f of files) {
      const lines = stripComments(readFileSync(f, 'utf-8')).split('\n');
      lines.forEach((line, i) => {
        for (const b of BANNED) {
          const hit = typeof b === 'string' ? line.includes(b) : b.test(line);
          if (hit) hits.push(`${relative(ROOT, f)}:${i + 1} ${String(b)}`);
        }
      });
    }
    expect(hits).toEqual([]);
  });
});

describe('homepage examples use the canonical numbers', () => {
  const page = readFileSync(join(ROOT, 'app/page.tsx'), 'utf-8');

  it('per-fix mockup numbers come from canonicalFixImpact, not literals', () => {
    expect(canonicalFixImpact('faq_schema')).toBe(8);
    expect(canonicalFixImpact('local_business_schema')).toBe(10);
    expect(page).toMatch(/examplePts\('faq_schema'\)/);
    expect(page).toMatch(/examplePts\('local_business_schema'\)/);
    expect(page).not.toMatch(/\+1[2468] ?pts/);
  });

  it('category-search cards use the responded denominator', () => {
    expect(page).not.toContain('{topMentions} of 11');
    expect(page).not.toContain('{userMentions}/{PLATFORMS.length} platform visibility');
    expect(page).toContain('AI platforms that answered');
  });

  it('illustrative case studies only use known fix types', () => {
    for (const c of CASES) for (const f of c.fixes) expect(canonicalFixImpact(f.fixType)).not.toBeNull();
  });
});

describe('client portal uses the shared grade bands', () => {
  it('imports gradeLabel and has no private A–F thresholds', () => {
    const src = readFileSync(join(ROOT, 'app/dashboard/client/page.tsx'), 'utf-8');
    expect(src).toContain("import { gradeLabel } from '@/lib/projection'");
    expect(src).not.toMatch(/score >= (80|65|50|35)\)/);
  });
});

describe('fix timelines make no AI-platform timing promises', () => {
  // We cannot see or control when AI platforms re-crawl / refresh, so fix
  // timelines used to promise things we never kept ("Indexed by AI within
  // 24–72 hours", "Changes propagate to AI in 14–30 days", "Score improves
  // … in ~45 days"). They now use lib/aiRefreshCopy (AI platforms refresh on
  // their own schedules — Rankall verifies on the rescan). Implementation
  // effort estimates ("2-3 hours setup") and user-action advice ("reply
  // within 48 hours") are fine.
  const FILES = [
    'app/report/[id]/page.tsx',
    'app/dashboard/trust/page.tsx',
    'lib/fixQuality.ts',
    'lib/trustSignals.ts',
    'lib/aiRefreshCopy.ts',
  ];
  const AI_TIMING: RegExp[] = [
    // "indexed / picked up / propagates / re-crawled … (within) 24–72 hours"
    /(index(ed)?|picks? (it )?up|picked up|propagat\w*|re-?crawl\w*|re-?evaluat\w*|reflect\w*|register\w*|recogni[sz]ed|show up in AI|appear\w* in AI|AI data)[^'"`]{0,40}?\b\d+\s*[–-]\s*\d+\s*(hours|hrs|days|weeks)/i,
    // "within 14–30 days … AI / indexed"
    /\b(within|in) \d+\s*[–-]\s*\d+ (hours|hrs|days|weeks)\b[^'"`]{0,40}\b(AI|ChatGPT|index)/i,
    // "AI picks it up within 30 days"
    /\b(AI|indexed)\b[^'"`]{0,60}\bwithin \d+ (hours|days|weeks)/i,
    // "Takes 24–48 hours to index / to be picked up / to update" (a third
    // party's own step such as "postcard takes 5–7 days" is not matched)
    /\btakes \d+\s*[–-]\s*\d+ (hours|hrs|days|weeks)( after adding| to (index|be|update|show|register|reflect))/i,
    // "Score improves … in ~45 days" (a Rankall rescan "in ~7 days" is ours to keep)
    /\bin ~?45 days\b/,
    /\d+[–-]\d+ weeks for Google to process/,
  ];

  it.each(FILES)('%s has no AI-effect timing promises', (f) => {
    const lines = stripComments(readFileSync(join(ROOT, f), 'utf-8')).split('\n');
    const hits: string[] = [];
    lines.forEach((line, i) => {
      for (const re of AI_TIMING) if (re.test(line)) hits.push(`${f}:${i + 1} ${String(re)}`);
    });
    expect(hits).toEqual([]);
  });

  it('timelines use the shared honest note', () => {
    for (const f of ['app/report/[id]/page.tsx', 'app/dashboard/trust/page.tsx']) {
      const src = readFileSync(join(ROOT, f), 'utf-8');
      expect(src).toContain("from '@/lib/aiRefreshCopy'");
      expect(src).not.toMatch(/timeline: ['"]/);
    }
  });

  it('the patterns catch the old copy', () => {
    const old = [
      "timeline: 'Indexed by AI within 24–72 hours'",
      "timeline: 'Changes propagate to AI in 14–30 days'",
      "timeline: 'Publication 2–6 weeks. AI picks up within 30 days of publishing'",
      "timeline: 'Takes 24–48 hours to be recognised'",
      "timeline: 'Citations appear in AI data within 14–30 days'",
      "Score improves from {currentScore} to {predictedScore} in ~45 days",
    ];
    for (const s of old) expect(AI_TIMING.some(re => re.test(s))).toBe(true);
  });
});
