import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  isProdRankallDeployment,
  parseAdminEmailList,
  stagingAdminEmails,
  isAdminUser,
  ADMIN_EMAILS,
} from '../planConfig';

// Ticket 14ypkw1b33n — staging admin parity.
afterEach(() => { vi.unstubAllEnvs(); });

describe('isProdRankallDeployment', () => {
  it('treats any rankall.io production domain or app URL as prod', () => {
    expect(isProdRankallDeployment('rankall.io', undefined)).toBe(true);
    expect(isProdRankallDeployment('www.rankall.io', undefined)).toBe(true);
    expect(isProdRankallDeployment(undefined, 'https://rankall.io')).toBe(true);
    expect(isProdRankallDeployment('rankall-staging.vercel.app', 'https://www.rankall.io/')).toBe(true);
  });
  it('treats the staging project as non-prod', () => {
    expect(isProdRankallDeployment('rankall-staging.vercel.app', 'https://rankall-staging.vercel.app')).toBe(false);
    expect(isProdRankallDeployment(undefined, undefined)).toBe(false);
  });
  it('is not fooled by look-alike hosts', () => {
    expect(isProdRankallDeployment('rankall.io.evil.com', undefined)).toBe(false);
    expect(isProdRankallDeployment('notrankall.io', undefined)).toBe(false);
  });
});

describe('staging admin list', () => {
  it('parses, trims, lowercases and drops junk', () => {
    expect(parseAdminEmailList(' QA@Example.com, ,not-an-email, second@test.dev ')).toEqual(['qa@example.com', 'second@test.dev']);
    expect(parseAdminEmailList(undefined)).toEqual([]);
  });
  it('is ignored on prod, honoured on staging', () => {
    expect(stagingAdminEmails('qa@example.com', true)).toEqual([]);
    expect(stagingAdminEmails('qa@example.com', false)).toEqual(['qa@example.com']);
  });
});

describe('isAdminUser with the staging list', () => {
  it('grants the staging account admin on a staging build', () => {
    vi.stubEnv('NEXT_PUBLIC_STAGING_ADMIN_EMAILS', 'staging-qa@example.com');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL', 'rankall-staging.vercel.app');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://rankall-staging.vercel.app');
    expect(isAdminUser('Staging-QA@example.com ')).toBe(true);
    expect(isAdminUser('random@example.com')).toBe(false);
  });
  it('never grants it on the prod project, even if the variable is mis-set there', () => {
    vi.stubEnv('NEXT_PUBLIC_STAGING_ADMIN_EMAILS', 'staging-qa@example.com');
    vi.stubEnv('NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL', 'rankall.io');
    expect(isAdminUser('staging-qa@example.com')).toBe(false);
  });
  it('keeps every prod admin an admin everywhere (parity baseline)', () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL', 'rankall.io');
    for (const e of ADMIN_EMAILS) expect(isAdminUser(e)).toBe(true);
    vi.stubEnv('NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL', 'rankall-staging.vercel.app');
    for (const e of ADMIN_EMAILS) expect(isAdminUser(e)).toBe(true);
    expect(isAdminUser('nandish@rankall.io')).toBe(true); // ax77
  });
});

// Parity: every admin gate must use the canonical isAdminUser (directly or via
// useAdminGuard / getAdminUser / getUserRole), so a staging admin reaches every
// admin feature a prod admin does. Fails if a route grows its own allowlist.
describe('every admin gate uses the canonical check', () => {
  const ROOT = join(__dirname, '..', '..');
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(ts|tsx)$/.test(name)) out.push(p);
    }
    return out;
  }
  const files = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'lib')), ...walk(join(ROOT, 'components')), join(ROOT, 'proxy.ts')];
  it('no admin page or admin API route is ungated', () => {
    const adminFiles = files.filter(f => /[\\/]app[\\/](admin|api[\\/]admin)[\\/]/.test(f) && /(page|route)\.tsx?$/.test(f));
    expect(adminFiles.length).toBeGreaterThan(10);
    const ungated = adminFiles.filter(f => {
      const src = readFileSync(f, 'utf8');
      return !/isAdminUser\(|useAdminGuard\(|getAdminUser\(|cronAuthFailure\(|isCronRequest\(/.test(src);
    });
    // Admin pages that render a client child may gate in that child or rely on
    // the proxy.ts /admin gate (which itself uses isAdminUser) — list them.
    const proxySrc = readFileSync(join(ROOT, 'proxy.ts'), 'utf8');
    expect(proxySrc).toMatch(/pathname\.startsWith\('\/admin'\) && !isAdminUser\(/);
    const apiUngated = ungated.filter(f => /api[\\/]admin/.test(f));
    expect(apiUngated).toEqual([]);
  });
  it('no second hardcoded admin email allowlist exists outside planConfig', () => {
    const offenders = files.filter(f => {
      if (/lib[\\/]planConfig\.tsx$/.test(f)) return false;
      const src = readFileSync(f, 'utf8');
      // An allowlist = an email-array literal used directly as a membership
      // check (`[...].includes(x)`), or a named email-array constant (other
      // than the canonical ADMIN_EMAILS) used with `.includes(`. A test that
      // asserts ADMIN_EMAILS contents (`[...].every(e => ADMIN_EMAILS...)`)
      // is not a gate.
      const EMAIL_ARRAY = String.raw`\[\s*['"][^'"\]]+@[^'"\]]+['"](?:\s*,\s*['"][^'"\]]+@[^'"\]]+['"])*\s*,?\s*\]`;
      if (new RegExp(EMAIL_ARRAY + String.raw`\s*\.(?:includes|indexOf|some)\(`).test(src)) return true;
      const named = [...src.matchAll(new RegExp(String.raw`(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*` + EMAIL_ARRAY, 'g'))].map(m => m[1]);
      return named.some(n => n !== 'ADMIN_EMAILS' && new RegExp(String.raw`\b` + n + String.raw`\.(?:includes|indexOf|some)\(`).test(src));
    });
    expect(offenders.map(f => f.replace(ROOT, ''))).toEqual([]);
  });
});
