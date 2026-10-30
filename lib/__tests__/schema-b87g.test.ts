import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// b87g — schema gaps: (1) the LocalBusiness NAP issue is FIXED on
// HEAD via getTrustedBusinessContact (verified live Oct 20,
// 2026: the Dallas profile's JSON-LD carries no Flower Mound
// street address, phone, or website); (2) industry HUB pages
// had no FAQ at all; (3) /leaderboard had no ItemList;
// (4) unknown industry/city combos (e.g. the legacy dallas-tx
// variant) got the bare framework 404.

const hub = readFileSync(join(process.cwd(), 'app/[industry]/page.tsx'), 'utf8');
const board = readFileSync(join(process.cwd(), 'app/leaderboard/page.tsx'), 'utf8');
const profile = readFileSync(join(process.cwd(), 'app/business/[slug]/page.tsx'), 'utf8');

describe('b87g — schema coverage', () => {
  it('the hub emits FAQPage schema for a visible FAQ section', () => {
    expect(hub).toContain("'@type': 'FAQPage'");
    expect(hub).toContain('FAQ — {industryPlural(ind.label)}');
    expect(hub).toContain('const faqs = [');
  });

  it('the leaderboard emits an ItemList from its displayed rows', () => {
    expect(board).toContain("'@type': 'ItemList'");
    expect(board).toContain('position: e.rank');
    expect(board).toContain('name: e.businessName');
  });

  it('profile schema still comes from the trusted contact only', () => {
    expect(profile).toContain('getTrustedBusinessContact(business)');
    expect(profile).toContain('...(contact.phone ? { telephone: contact.phone } : {})');
  });

  it('unknown industry/city combos get a way-forward 404', () => {
    const p = join(process.cwd(), 'app/[industry]/[city]/not-found.tsx');
    expect(existsSync(p)).toBe(true);
    expect(readFileSync(p, 'utf8')).toContain('href="/industries"');
  });
});
