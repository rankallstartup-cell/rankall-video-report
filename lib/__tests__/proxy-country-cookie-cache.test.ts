import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// b87h: no Set-Cookie on every response (it disabled ISR caching).
const src = readFileSync(join(process.cwd(), 'proxy.ts'), 'utf8');

describe('proxy country cookies — b87h', () => {
  it('writes rankall_country only when the value changes', () => {
    expect(src).toContain("request.cookies.get('rankall_country')?.value !== country");
    expect(src).toContain("request.cookies.get('rankall_country_overridden')?.value !== overriddenFlag");
  });
});
