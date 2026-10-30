import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getTrustedBusinessContact } from '../enrichment';
import { filterReportScan } from '../reportPayload';

describe('wrong-business NAP — b87d', () => {
  it('drops address, phone and website when the address is in another city', () => {
    expect(getTrustedBusinessContact({
      city: 'Dallas', address: '2600 Cross Timbers Rd, Flower Mound, TX 75028', phone: '(972) 555-0100', website: 'https://brite.example',
    })).toEqual({ address: null, phone: null, website: null });
  });
  it('keeps contact details that match the city', () => {
    expect(getTrustedBusinessContact({
      city: 'Dallas', address: '100 Main St, Dallas, TX 75201', phone: '(214) 555-0100', website: 'https://bright.example',
    })).toEqual({ address: '100 Main St, Dallas, TX 75201', phone: '(214) 555-0100', website: 'https://bright.example' });
  });
  it('with no address there is nothing to contradict phone/website', () => {
    expect(getTrustedBusinessContact({ city: 'Dallas', address: null, phone: '1', website: 'w' })).toEqual({ address: null, phone: '1', website: 'w' });
  });
  it('the report payload drops untrusted stored Google data', () => {
    const out = filterReportScan({
      input: 'Bright Smile Dental', location: 'Dallas',
      enrichment: { google: { name: 'Brite Smiles Dentistry', address: '2600 Cross Timbers Rd, Flower Mound, TX', rating: 4.9, reviewCount: 300 } },
    }, 'member');
    expect((out.enrichment as Record<string, unknown>).google).toBeUndefined();
  });
  it('the profile page renders only trusted contact fields', () => {
    const src = readFileSync(join(process.cwd(), 'app/business/[slug]/page.tsx'), 'utf8');
    expect(src).toContain('getTrustedBusinessContact(business)');
    expect(src).not.toMatch(/business\.(phone|address|website)\b/);
  });
});
