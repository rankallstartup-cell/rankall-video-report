import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { coreBusinessName } from '../trust';

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('responsive pass (phones)', () => {
  it('two-column layouts stack instead of overflowing', () => {
    expect(src('app/dashboard/roi/page.tsx')).toContain("repeat(auto-fit, minmax(min(320px, 100%), 1fr))");
    expect(src('app/[industry]/[city]/page.tsx')).toContain('minmax(min(200px,100%),1fr)');
    expect(src('app/dashboard/simulator/page.tsx')).toContain("flex: '0 1 auto', minWidth: 0, maxWidth: '100%'");
    expect(src('app/dashboard/url-intelligence/page.tsx')).toContain("marginBottom: 12, flexWrap: 'wrap'");
  });
  it('dashboard leaves room for the chat button on phones', () => {
    expect(src('app/dashboard/layout.tsx')).toContain('padding-bottom: 88px');
  });
  it('report page survives a scan with no business name', () => {
    expect(coreBusinessName(undefined)).toBe('');
    expect(coreBusinessName('Royal Lane Dental - Best Dentist')).toBe('Royal Lane Dental');
  });
});
