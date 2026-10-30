import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SOCIAL_PROFILES, SOCIAL_PROFILE_URLS } from '@/lib/socialLinks';

// b86p — the footer social links were the single S6 failure on
// ~25 page tests: LinkedIn/X/YouTube 404, Facebook/Instagram
// never verifiable. All five URLs lived in FOUR places (shared
// footer, homepage footer, Organization sameAs, llms.txt) —
// they now come from ONE canonical list, empty until the
// profiles actually exist. The /leaderboard page also rendered
// the footer twice (layout + its own import).

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('b86p — no dead social links anywhere', () => {
  it('the canonical list is the only source, and it is empty until profiles exist', () => {
    expect(SOCIAL_PROFILES).toEqual([]);
    expect(SOCIAL_PROFILE_URLS).toEqual([]);
    expect(read('components/SiteChrome.tsx')).toContain("from '@/lib/socialLinks'");
    expect(read('app/layout.tsx')).toContain('SOCIAL_PROFILE_URLS');
    expect(read('app/llms.txt/route.ts')).toContain('SOCIAL_PROFILES');
    expect(read('components/SiteChrome.tsx')).toContain('SOCIAL_PROFILES.map');
  });

  it('no surface hardcodes the dead profile URLs anymore', () => {
    for (const f of ['components/Footer.tsx', 'app/layout.tsx', 'app/llms.txt/route.ts', 'app/page.tsx']) {
      const src = read(f);
      expect(src).not.toContain('linkedin.com/company/rankall-io');
      expect(src).not.toContain('x.com/rankall_io');
      expect(src).not.toContain('youtube.com/@rankall-io');
      expect(src).not.toContain('instagram.com/rankall.io');
      expect(src).not.toContain('facebook.com/rankall.io');
    }
  });

  it('the leaderboard renders the footer once (the layout’s)', () => {
    const board = read('app/leaderboard/page.tsx');
    expect(board).not.toContain("from '@/components/Footer'");
    expect(board).not.toContain('<Footer />');
  });

  it('the hero product tour opens the demo modal like every Watch Demo control', () => {
    expect(read('app/page.tsx')).toContain('onClick={(e) => { e.preventDefault(); setV2VideoOpen(true); }}');
  });
});
