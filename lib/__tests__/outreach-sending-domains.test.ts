// Outreach #4: cold sending on dedicated sending domains.
// Pins: env parsing, deterministic per-recipient rotation, paused-domain
// skip, all-paused blocks (NEVER silently falls back to rankall.io),
// unconfigured -> today's rankall.io behaviour, and product mail isolation
// (only the two cold routes import the cold-domain module).
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  getConfiguredColdDomains,
  buildColdFromAddress,
  orderDomainsForRecipient,
  selectColdSendingDomain,
  LEGACY_COLD_DOMAIN,
  COLD_SENDING_DOMAINS_ENV_VAR,
} from '@/lib/outreachSendingDomains';
import type { OutreachGuardResult } from '@/lib/outreachGuard';

const allowed = (domain: string): OutreachGuardResult => ({ allowed: true, domain });
const blocked = (domain: string, reason: string): OutreachGuardResult => ({ allowed: false, reason, domain });

describe('getConfiguredColdDomains', () => {
  it('returns [] when the env var is unset (unconfigured -> today\'s behaviour)', () => {
    expect(getConfiguredColdDomains({})).toEqual([]);
  });
  it('returns [] for an empty value', () => {
    expect(getConfiguredColdDomains({ [COLD_SENDING_DOMAINS_ENV_VAR]: '' })).toEqual([]);
  });
  it('parses, lowercases, trims and dedupes a comma-separated list', () => {
    expect(
      getConfiguredColdDomains({ [COLD_SENDING_DOMAINS_ENV_VAR]: 'Mail1.Example.com, mail2.example.com ,mail1.example.com' }),
    ).toEqual(['mail1.example.com', 'mail2.example.com']);
  });
  it('drops invalid entries with a warning and keeps the valid ones', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(
      getConfiguredColdDomains({ [COLD_SENDING_DOMAINS_ENV_VAR]: 'not a domain, mail.example.com, https://x.com, a@b.com' }),
    ).toEqual(['mail.example.com']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
  it('all-invalid list -> [] (safe fallback to today\'s behaviour) + warning, never a crash', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getConfiguredColdDomains({ [COLD_SENDING_DOMAINS_ENV_VAR]: '!!!, @@@' })).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('buildColdFromAddress', () => {
  it('builds the branded From header for a cold domain', () => {
    expect(buildColdFromAddress('mail.example.com')).toBe('Rankall.io <outreach@mail.example.com>');
  });
});

describe('orderDomainsForRecipient', () => {
  const domains = ['a.example.com', 'b.example.com', 'c.example.com'];
  it('is deterministic: same recipient -> same order', () => {
    expect(orderDomainsForRecipient(domains, 'Prospect@Biz.com')).toEqual(
      orderDomainsForRecipient(domains, 'prospect@biz.com'),
    );
  });
  it('is a rotation: same set, exactly once each', () => {
    for (const email of ['one@x.com', 'two@y.com', 'three@z.com']) {
      const ordered = orderDomainsForRecipient(domains, email);
      expect([...ordered].sort()).toEqual([...domains].sort());
    }
  });
  it('different recipients start on different domains (rotation spreads load)', () => {
    const starts = new Set(
      Array.from({ length: 20 }, (_, i) => orderDomainsForRecipient(domains, `user${i}@example.com`)[0]),
    );
    expect(starts.size).toBeGreaterThan(1);
  });
});

describe('selectColdSendingDomain', () => {
  it('no domains configured -> tries only rankall.io (today\'s behaviour)', async () => {
    const check = vi.fn(async (domain: string) => allowed(domain));
    const sel = await selectColdSendingDomain('p@biz.com', check, []);
    expect(sel).toMatchObject({ allowed: true, domain: LEGACY_COLD_DOMAIN, from: 'Rankall.io <outreach@rankall.io>' });
    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith(LEGACY_COLD_DOMAIN);
  });

  it('rotates across configured domains: first allowed in recipient order wins', async () => {
    const domains = ['a.example.com', 'b.example.com', 'c.example.com'];
    const check = vi.fn(async (domain: string) => allowed(domain));
    const sel = await selectColdSendingDomain('p@biz.com', check, domains);
    expect(sel.allowed).toBe(true);
    if (sel.allowed) {
      expect(sel.domain).toBe(orderDomainsForRecipient(domains, 'p@biz.com')[0]);
      expect(sel.from).toBe(`Rankall.io <outreach@${sel.domain}>`);
    }
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('paused first domain -> skipped, send goes from a healthy domain', async () => {
    const domains = ['a.example.com', 'b.example.com'];
    const ordered = orderDomainsForRecipient(domains, 'p@biz.com');
    const check = vi.fn(async (domain: string) =>
      domain === ordered[0] ? blocked(domain, 'Domain paused: Spam complaint received') : allowed(domain),
    );
    const sel = await selectColdSendingDomain('p@biz.com', check, domains);
    expect(sel).toMatchObject({ allowed: true, domain: ordered[1] });
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('ALL configured domains paused -> blocked, NEVER falls back to rankall.io', async () => {
    const domains = ['a.example.com', 'b.example.com'];
    const check = vi.fn(async (domain: string) => blocked(domain, 'Domain paused: Spam complaint received'));
    const sel = await selectColdSendingDomain('p@biz.com', check, domains);
    expect(sel).toMatchObject({ allowed: false, allPaused: true, dnc: false });
    expect(check).toHaveBeenCalledTimes(2);
    expect(check).not.toHaveBeenCalledWith(LEGACY_COLD_DOMAIN);
    if (!sel.allowed) expect(sel.reason).toMatch(/All cold sending domains blocked/);
  });

  it('ALL configured domains at daily limit -> blocked, not allPaused (retryable)', async () => {
    const domains = ['a.example.com', 'b.example.com'];
    const check = vi.fn(async (domain: string) => blocked(domain, 'Daily limit reached: 20/20 sent today'));
    const sel = await selectColdSendingDomain('p@biz.com', check, domains);
    expect(sel).toMatchObject({ allowed: false, allPaused: false, dnc: false });
    expect(check).not.toHaveBeenCalledWith(LEGACY_COLD_DOMAIN);
  });

  it('DNC stops immediately — other domains are not even tried', async () => {
    const domains = ['a.example.com', 'b.example.com'];
    const check = vi.fn(async (domain: string) => blocked(domain, 'On do-not-contact list: unsubscribed'));
    const sel = await selectColdSendingDomain('p@biz.com', check, domains);
    expect(sel).toMatchObject({ allowed: false, dnc: true });
    expect(check).toHaveBeenCalledTimes(1);
  });
});

describe('cold-domain module isolation', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
  it('only the two cold routes import the cold-domain module', () => {
    const coldRoutes = [
      'app/api/outreach/send-email/route.ts',
      'app/api/cron/outreach-sequence/route.ts',
    ];
    for (const p of coldRoutes) {
      expect(read(p)).toContain('outreachSendingDomains');
      // No hardcoded cold From header remains (a comment may still mention
      // the legacy address in prose — that is not a send path).
      expect(read(p)).not.toContain('Rankall.io <outreach@rankall.io>');
    }
  });
  it('product/transactional mail routes do NOT import the cold-domain module and still use rankall.io', () => {
    const productRoutes = [
      'app/api/welcome-email/route.ts',
      'app/api/send-report-email/route.ts',
      'app/api/billing/webhook/route.ts',
      'app/api/cancel-subscription/route.ts',
      'app/api/cron/monthly-roi/route.ts',
      'app/api/cron/re-engagement/route.ts',
    ];
    for (const p of productRoutes) {
      const src = read(p);
      expect(src).not.toContain('outreachSendingDomains');
      expect(src).toContain('rankall.io');
    }
  });
  it('no cold From address remains hardcoded anywhere', () => {
    const coldRoutes = [
      'app/api/outreach/send-email/route.ts',
      'app/api/cron/outreach-sequence/route.ts',
    ];
    for (const p of coldRoutes) {
      expect(read(p)).not.toContain('FROM_ADDRESS');
      expect(read(p)).not.toContain('SENDER_DOMAIN');
    }
  });
});
