import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { assertPublicUrl } from '../../../lib/ssrf';

// ax89: SSRF — the trust engine fetched user-supplied website URLs
// (and ${origin}/robots.txt) with no private-IP block and
// redirect: 'follow', so http://169.254.169.254 or a redirect to it
// was fetched server-side.
//
// BUILD LESSON: lib/trust.ts is imported by a CLIENT component
// (report page), so the guard had to split — lib/ssrf.ts is pure /
// client-bundle-safe (no Node imports); the DNS-checked half lives
// in lib/ssrf-server.ts (server-only), and the fetching entry
// (detectTrustSignals) lives in lib/trustServer.ts.
describe('ax89 SSRF guard', () => {
  it('rejects loopback, link-local (cloud metadata), localhost, mapped v6', async () => {
    await expect(assertPublicUrl('http://127.0.0.1/robots.txt')).rejects.toThrow();
    await expect(assertPublicUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow();
    await expect(assertPublicUrl('http://localhost/admin')).rejects.toThrow();
    await expect(assertPublicUrl('http://10.0.0.5/')).rejects.toThrow();
    await expect(assertPublicUrl('http://192.168.1.1/')).rejects.toThrow();
    await expect(assertPublicUrl('http://[::1]/')).rejects.toThrow();
    await expect(assertPublicUrl('http://[::ffff:127.0.0.1]/')).rejects.toThrow();
  });

  it('rejects non-http(s) schemes', async () => {
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow();
    await expect(assertPublicUrl('ftp://example.com/x')).rejects.toThrow();
  });

  it('server fetch paths use the DNS-checked guard; trust.ts stays client-safe', () => {
    const trust = readFileSync(join(process.cwd(), 'lib/trust.ts'), 'utf8');
    const trustServer = readFileSync(join(process.cwd(), 'lib/trustServer.ts'), 'utf8');
    const crawler = readFileSync(join(process.cwd(), 'lib/crawlerCheck.ts'), 'utf8');
    const ssrfServer = readFileSync(join(process.cwd(), 'lib/ssrf-server.ts'), 'utf8');
    expect(trustServer).toContain('fetchPublicUrlWithDns');
    expect(crawler).toContain('fetchPublicUrlWithDns');
    expect(ssrfServer).toContain('dns/promises');
    // trust.ts is client-bundled: no Node imports, no server guard import.
    expect(trust).not.toContain('dns/promises');
    expect(trust).not.toContain('ssrf');
  });

  it('directory matching uses word boundaries, not raw substring', () => {
    const trust = readFileSync(join(process.cwd(), 'lib/trust.ts'), 'utf8');
    expect(trust).toContain('wordMatch');
    expect(trust).toContain('(?<!'); 
    expect(trust).toContain('escapeRegExp(key)');
    expect(trust).not.toContain('toLowerCase().includes(lower)');
  });
});
