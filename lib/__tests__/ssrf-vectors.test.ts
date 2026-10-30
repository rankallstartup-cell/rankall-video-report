import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isPrivateIp, assertPublicUrl } from '../ssrf';

// Offline: DNS is mocked for the server guard.
const lookupMock = vi.fn();
vi.mock('dns/promises', () => ({ lookup: (...a: unknown[]) => lookupMock(...a) }));

describe('isPrivateIp — IPv6 embeddings and reserved ranges', () => {
  it.each([
    '::1', '::', '0:0:0:0:0:0:0:1',
    '::7f00:1',            // [::127.0.0.1] after URL normalisation
    '::127.0.0.1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '0:0:0:0:0:ffff:a9fe:a9fe',
    '::ffff:0:7f00:1',     // SIIT
    '::ffff:0:127.0.0.1',
    '64:ff9b::7f00:1',     // NAT64 → 127.0.0.1
    '64:ff9b::a9fe:a9fe',  // NAT64 → 169.254.169.254
    '64:ff9b::10.0.0.1',
    '64:ff9b:1::1',        // local-use NAT64
    '2002:7f00:1::1',      // 6to4 → 127.0.0.1
    '2002:a00:1::',        // 6to4 → 10.0.0.1
    '2002:c0a8:101::1',    // 6to4 → 192.168.1.1
    '2001:0:4136:e378::1', // Teredo
    '2001:db8::1',
    'fec0::1', 'feff::1',  // site-local fec0::/10
    'fe80::1', 'febf::1',
    'fc00::1', 'fd12:3456::1',
    'ff02::1',
    '100::1',
  ])('blocks %s', (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });

  it.each([
    '2606:4700:4700::1111', '2001:4860:4860::8888', '64:ff9b::808:808', '2002:808:808::1', '::ffff:8.8.8.8',
  ])('allows public %s', (ip) => {
    expect(isPrivateIp(ip)).toBe(false);
  });

  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.0.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '198.18.0.1', '224.0.0.1'])(
    'blocks v4 %s', (ip) => expect(isPrivateIp(ip)).toBe(true),
  );
  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1'])('allows v4 %s', (ip) => expect(isPrivateIp(ip)).toBe(false));
});

describe('assertPublicUrl — URL-level vectors', () => {
  it.each([
    'http://[::127.0.0.1]/',
    'http://[::ffff:0:7f00:1]/',
    'http://[64:ff9b::7f00:1]/',
    'http://[2002:7f00:1::]/',
    'http://[fec0::1]/',
    'http://2130706433/',      // decimal 127.0.0.1 (URL parser normalises)
    'http://0x7f.1/',
    'http://0177.0.0.1/',
    'http://127.1/',
    'http://example.com:8080/',
    'http://example.com:22/',
    'https://example.com:6379/',
    'http://user:pass@example.com/',
  ])('rejects %s', async (u) => {
    await expect(assertPublicUrl(u)).rejects.toThrow();
  });

  it.each(['https://example.com/', 'http://example.com:80/x', 'https://example.com:443/'])('accepts %s', async (u) => {
    await expect(assertPublicUrl(u)).resolves.toBeInstanceOf(URL);
  });
});

describe('server guard — DNS + per-hop redirects', () => {
  beforeEach(() => { lookupMock.mockReset(); vi.unstubAllGlobals(); });

  it('blocks a hostname that resolves to any private address', async () => {
    const { assertPublicUrlWithDns } = await import('../ssrf-server');
    lookupMock.mockResolvedValue([{ address: '93.184.216.34' }, { address: '::ffff:10.0.0.1' }]);
    await expect(assertPublicUrlWithDns('https://rebind.example/')).rejects.toThrow(/private/);
  });

  it('re-checks redirect targets and refuses a hop to metadata', async () => {
    const { fetchPublicUrlWithDns } = await import('../ssrf-server');
    lookupMock.mockResolvedValue([{ address: '93.184.216.34' }]);
    const fetchMock = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchPublicUrlWithDns('https://public.example/')).rejects.toThrow(/Private IP/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as unknown[])[1]).toMatchObject({ redirect: 'manual' });
  });

  it('refuses a redirect to a non-default port', async () => {
    const { fetchPublicUrlWithDns } = await import('../ssrf-server');
    lookupMock.mockResolvedValue([{ address: '93.184.216.34' }]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 301, headers: { location: 'http://public.example:2375/' } })));
    await expect(fetchPublicUrlWithDns('https://public.example/')).rejects.toThrow(/ports/);
  });

  it('seo-audit and url-intelligence route user URLs through the guard', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    for (const f of ['app/api/seo-audit/route.ts', 'app/api/url-intelligence/route.ts']) {
      const src = readFileSync(join(process.cwd(), f), 'utf8');
      expect(src).toContain('fetchPublicUrlWithDns');
      expect(src).toContain('assertPublicUrlWithDns');
    }
  });
});
