import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Item 17: email-sequence fell back to the anon key; under RLS the claim
// failed and the email never sent.
const createClient = vi.fn(() => { throw new Error('should not be called without the service key'); });
vi.mock('@supabase/supabase-js', () => ({ createClient }));

describe('email-sequence uses the service-role client only', () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-secret';
    process.env.RESEND_API_KEY = 're_test';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    createClient.mockClear();
  });
  afterEach(() => { process.env = { ...env }; });

  it('source has no anon-key fallback', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/email-sequence/route.ts'), 'utf8');
    expect(src).not.toContain('SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY');
  });

  it('fails with a logged error (500) when the service key is missing', async () => {
    vi.resetModules();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { POST } = await import('../email-sequence/route');
    const res = await POST(new NextRequest('https://rankall.io/api/email-sequence', {
      method: 'POST',
      headers: { authorization: 'Bearer cron-secret', 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'u1', email: 'a@b.c', triggerEvent: 'day_1' }),
    }));
    expect(res.status).toBe(500);
    expect(createClient).not.toHaveBeenCalled();
    expect(err.mock.calls.some(c => String(c[0]).includes('SUPABASE_SERVICE_ROLE_KEY'))).toBe(true);
    err.mockRestore();
  });
});
