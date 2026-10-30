// b8bh — POST /api/waitlist: validation, honeypot, idempotent re-join,
// rate limit, specific errors. The old page inserted straight from the
// browser into a table that never existed, so every join failed.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock('@/lib/publicFormGuard', () => ({
  isHoneypotTripped: (body: unknown) =>
    !!(body as Record<string, unknown>)?.website_url,
  clientIp: vi.fn(() => '198.51.100.1'),
  allowByDbLimit: vi.fn(async () => true),
}));

import { POST } from '@/app/api/waitlist/route';
import { getSupabaseAdmin } from '@/lib/supabase';
import { allowByDbLimit } from '@/lib/publicFormGuard';

const mockedAdmin = getSupabaseAdmin as unknown as ReturnType<typeof vi.fn>;
const mockedAllow = allowByDbLimit as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new NextRequest('http://localhost/api/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/waitlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAllow.mockResolvedValue(true);
    mockedAdmin.mockReturnValue({
      from: () => ({ insert: async () => ({ error: null }) }),
    });
  });

  it('accepts a valid signup and inserts email + plan_type', async () => {
    const insert = vi.fn(async () => ({ error: null }));
    mockedAdmin.mockReturnValue({ from: () => ({ insert }) });
    const res = await POST(req({ email: ' Test@Example.com ', business_name: 'Acme', plan_type: 'product_pro' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, already: false });
    expect(insert).toHaveBeenCalledWith({ email: 'test@example.com', business_name: 'Acme', plan_type: 'product_pro' });
  });

  it('accepts the :annual interval suffix and rejects unknown plans', async () => {
    const res = await POST(req({ email: 'a@b.com', plan_type: 'agency_seo:annual' }));
    expect(res.status).toBe(200);
    const bad = await POST(req({ email: 'a@b.com', plan_type: 'made_up' }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe('Please choose a plan.');
  });

  it('rejects invalid emails and over-long business names', async () => {
    for (const email of ['', 'no-at', 'a@b', 'x'.repeat(321) + '@b.com']) {
      const res = await POST(req({ email, plan_type: 'product_pro' }));
      expect(res.status).toBe(400);
    }
    const res = await POST(req({ email: 'a@b.com', business_name: 'x'.repeat(201), plan_type: 'product_pro' }));
    expect(res.status).toBe(400);
  });

  it('honeypot trips get a silent fake success and no insert', async () => {
    const insert = vi.fn(async () => ({ error: null }));
    mockedAdmin.mockReturnValue({ from: () => ({ insert }) });
    const res = await POST(req({ email: 'bot@b.com', plan_type: 'product_pro', website_url: 'http://spam.example' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, already: false });
    expect(insert).not.toHaveBeenCalled();
  });

  it('duplicate (email, plan) is an idempotent success, not an error', async () => {
    mockedAdmin.mockReturnValue({ from: () => ({ insert: async () => ({ error: { code: '23505' } }) }) });
    const res = await POST(req({ email: 'a@b.com', plan_type: 'product_pro' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, already: true });
  });

  it('rate limit returns 429; other DB errors return a specific 500', async () => {
    mockedAllow.mockResolvedValue(false);
    const limited = await POST(req({ email: 'a@b.com', plan_type: 'product_pro' }));
    expect(limited.status).toBe(429);
    mockedAllow.mockResolvedValue(true);
    mockedAdmin.mockReturnValue({ from: () => ({ insert: async () => ({ error: { code: 'PGRST205', message: 'table missing' } }) }) });
    const failed = await POST(req({ email: 'a@b.com', plan_type: 'product_pro' }));
    expect(failed.status).toBe(500);
    expect((await failed.json()).error).toContain("couldn't save");
  });
});
