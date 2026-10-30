import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AGENCY_EMAIL_TEMPLATE } from '@/lib/outreachTemplates';

// azxh residual: the agency outreach email quoted a stale $599/month
// while the founder-set Agency price is $259/month. The price now
// reads from lib/publicStats.ts (single source of truth).
describe('azxh agency outreach price truth', () => {
  it('agency outreach quotes the founder-set $259/month, never $599', () => {
    expect(AGENCY_EMAIL_TEMPLATE.body).toContain('$259/month');
    expect(AGENCY_EMAIL_TEMPLATE.body).not.toContain('$599');
  });
  it('the price is derived from publicStats, not a second hardcoded copy', () => {
    const src = readFileSync(join(process.cwd(), 'lib/outreachTemplates.ts'), 'utf-8');
    expect(src).toContain("FOUNDER_PRICING_USD.find((t) => t.name === 'Agency')");
    expect(src).not.toContain('$599');
  });
});
