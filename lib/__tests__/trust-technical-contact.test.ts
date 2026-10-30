import { describe, it, expect, vi, afterEach } from 'vitest';
import { detectTrustSignals } from '../trustServer';

// Offline: the SSRF guard (lib/ssrf-server.ts) resolves the hostname
// before fetching. Mock the resolver with a PUBLIC answer so these tests
// never touch real DNS — the production guard is unchanged (private
// answers are still rejected; see ssrf-guard tests).
vi.mock('dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}));

// azzy: phone was US-only NANP (a UK/AU business with a valid local
// number got 'No phone number found'); address was markup-only (a
// plain-text footer address got 'No address found' even though the
// address IS on the page).
const BIZ = 'Brite Smiles Dentistry';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubSite(body: string) {
  const html = `<html><head><title>${BIZ}</title></head><body>${body}</body></html>`;
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => html })));
}

async function contactSignals() {
  const report = await detectTrustSignals(
    {
      businessInput: BIZ,
      websiteUrl: 'https://example.com',
      scanResults: [],
      citationSources: [],
      enrichment: null,
    },
    'US',
  );
  const byName = (name: string) => report.technical.find((s) => s.name === name)!;
  return { phone: byName('Phone number on page'), address: byName('Address on page') };
}

describe('trust technical contact checks — azzy international phone + plain-text address', () => {
  it('UK international phone (+44) counts', async () => {
    stubSite('<p>Call us on +44 20 7946 0958</p><p>45 High Street, London</p>');
    const { phone } = await contactSignals();
    expect(phone.status).toBe('good');
  });

  it('UK local phone (020 …) counts', async () => {
    stubSite('<p>Call us on 020 7946 0958</p><p>45 High Street, London</p>');
    const { phone } = await contactSignals();
    expect(phone.status).toBe('good');
  });

  it('AU local phone ((02) …) counts', async () => {
    stubSite('<p>Call (02) 9374 4000</p><p>12 George Street, Sydney</p>');
    const { phone } = await contactSignals();
    expect(phone.status).toBe('good');
  });

  it('plain-text footer address counts with no markup', async () => {
    stubSite('<footer>Visit us at 45 High Street, London</footer><p>Call 020 7946 0958</p>');
    const { address } = await contactSignals();
    expect(address.status).toBe('good');
  });

  it('US phone still counts (regression)', async () => {
    stubSite('<p>Call (555) 123-4567</p><p>123 Main Street, Dallas</p>');
    const { phone, address } = await contactSignals();
    expect(phone.status).toBe('good');
    expect(address.status).toBe('good');
  });

  it('a timestamp is not a phone number', async () => {
    stubSite('<p>Posted 2026-01-15 10:30:00</p>');
    const { phone } = await contactSignals();
    expect(phone.status).toBe('missing');
  });

  it('neither phone nor address present scores both missing', async () => {
    stubSite('<p>Welcome to our clinic</p>');
    const { phone, address } = await contactSignals();
    expect(phone.status).toBe('missing');
    expect(address.status).toBe('missing');
  });
});
