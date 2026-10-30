import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as marketing } from '@/app/api/og/marketing/route';
import { GET as report } from '@/app/api/og/report/route';

// b87f: both OG endpoints returned HTTP 500 because a <div> with two
// children lacked display:flex (Satori rejects it). Render them for real.
describe('OG image routes — b87f', () => {
  it('marketing card renders a PNG', async () => {
    const res = await marketing(new NextRequest('https://rankall.io/api/og/marketing?title=Hello&subtitle=World'));
    const buf = await res.arrayBuffer();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(buf.byteLength).toBeGreaterThan(1000);
  }, 60000);
  it('report card renders a PNG', async () => {
    const res = await (report as (r: NextRequest) => Promise<Response>)(new NextRequest('https://rankall.io/api/og/report?score=42&name=Test%20Dental&industry=Dentist'));
    const buf = await res.arrayBuffer();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(buf.byteLength).toBeGreaterThan(1000);
  }, 60000);
});

import { readFileSync } from 'fs';
import { join } from 'path';

describe('staging robots meta — b87f', () => {
  it('root metadata is indexable only on the production project', () => {
    const src = readFileSync(join(process.cwd(), 'app/layout.tsx'), 'utf8');
    expect(src).toContain('robots: isKnownNonProdDeployment()');
    expect(src).toContain('if (!productionUrl) return false;');
  });
});
