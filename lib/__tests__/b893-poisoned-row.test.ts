import { describe, it, expect } from 'vitest';
import { getTrustedBusinessContact } from '@/lib/enrichment';

// b893/b87d — the REAL poisoned staging row (businesses table,
// read Oct 20, 2026): a Dallas slug carrying a Flower Mound
// address/phone/website from a wrong Places match. The merged
// render guard must publish NONE of it.
const POISONED_ROW = {
  city: 'Dallas, TX',
  address: '4900 Long Prairie Rd #300, Flower Mound, TX 75028, USA',
  website: 'https://www.britesmilesdentistry.com/',
  phone: '+1 469-549-4800',
};

describe('b893 — the poisoned row publishes no NAP', () => {
  it('all contact fields are withheld for the Flower Mound row', () => {
    expect(getTrustedBusinessContact(POISONED_ROW)).toEqual({ address: null, phone: null, website: null });
  });

  it('a matching-city row keeps its contact details', () => {
    const good = { city: 'Dallas, TX', address: '123 Main St, Dallas, TX 75001, USA', website: 'https://example.com/', phone: '+1 214-555-0100' };
    const out = getTrustedBusinessContact(good);
    expect(out.address).toContain('Dallas');
    expect(out.phone).toBe('+1 214-555-0100');
  });
});

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

describe('b893 — bogus business slug gets a way forward', () => {
  it('a segment not-found exists with exits', () => {
    const p = join(process.cwd(), 'app/business/[slug]/not-found.tsx');
    expect(existsSync(p)).toBe(true);
    const src = readFileSync(p, 'utf8');
    expect(src).toContain('href="/leaderboard"');
    expect(src).toContain('href="/"');
  });
});
