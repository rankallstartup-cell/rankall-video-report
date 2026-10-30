// b8b0 — /pricing: every founder tier visible, one "Scan Free" destination.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FOUNDER_PRICING_USD, tierPrice } from '@/lib/publicStats';

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8');

describe('/pricing completeness (b8b0)', () => {
  it('Enterprise $499 is displayed (price from founder pricing, not a literal)', () => {
    expect(tierPrice('Enterprise')).toBe(499);
    const page = read('app/pricing/PricingClient.tsx');
    expect(page).toContain("tierPrice('Enterprise')");
    expect(page).toContain('Contact Us');
  });

  it('the four card-less founder tiers appear in a More plans section', () => {
    const page = read('app/pricing/PricingClient.tsx');
    expect(page).toContain('More plans');
    expect(page).toContain('tierPrice(t.name)');
    for (const name of ['Product Pro', 'SEO', 'Government', 'Global Brand Intelligence']) {
      expect(page).toContain(`{ name: '${name}'`);
      expect(FOUNDER_PRICING_USD.some(t => t.name === name)).toBe(true);
    }
    expect(tierPrice('Product Pro')).toBe(45);
    expect(tierPrice('SEO')).toBe(39);
    expect(tierPrice('Government')).toBe(1200);
    expect(tierPrice('Global Brand Intelligence')).toBe(999);
    // Contact-led tiers have no signup ?plan= key — they go to /contact.
    expect(page).toContain("href: '/signup?plan=product_pro'");
  });

  it('"Scan Free" goes to the scan form everywhere (header + footer)', () => {
    // Header + footer: components/SiteChrome.tsx. Every "Scan Free" goes
    // to the scan form; "Sign up" is its own separate link.
    const chrome = read('components/SiteChrome.tsx');
    const scanFree = chrome.match(/<Link href="([^"]+)"[^>]*>Scan Free/g) ?? [];
    expect(scanFree.length).toBe(2);
    for (const l of scanFree) expect(l).toContain('href="/#scan"');
  });
});
