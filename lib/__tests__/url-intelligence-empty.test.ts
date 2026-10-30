import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// b8ae: the audit page explains itself before the first audit.
const src = readFileSync(join(process.cwd(), 'app/dashboard/url-intelligence/page.tsx'), 'utf8');

describe('/dashboard/url-intelligence empty state — b8ae', () => {
  it('shows an empty state when no audit is open', () => {
    expect(src).toContain('{!result && !loading && !error && (');
    expect(src).toContain('No audit open yet');
  });
});
