// b8be — unsubscribe must never mutate on GET or on page load.
// Mutation happens only via POST with an explicit submit + valid token;
// tokenless POST sends a confirmation link (only to listed addresses).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/outreachGuard', () => ({
  verifyUnsubscribeToken: vi.fn((email: string, token: string) => token === 'valid-token'),
  generateUnsubscribeToken: vi.fn(() => 'new-token'),
  addToDoNotContact: vi.fn(async () => {}),
}));
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock('@/lib/emailTemplates', () => ({ sendEmail: vi.fn(async () => true) }));
vi.mock('@/lib/publicFormGuard', () => ({
  isHoneypotTripped: (body: unknown) => !!(body as Record<string, unknown>)?.website_url,
  clientIp: vi.fn(() => '198.51.100.1'),
  allowByDbLimit: vi.fn(async () => true),
}));

import { GET, POST } from '@/app/api/unsubscribe/route';
import { verifyUnsubscribeToken, addToDoNotContact } from '@/lib/outreachGuard';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendEmail } from '@/lib/emailTemplates';
import { allowByDbLimit } from '@/lib/publicFormGuard';

const mockedAdmin = getSupabaseAdmin as unknown as ReturnType<typeof vi.fn>;
const mockedSend = sendEmail as unknown as ReturnType<typeof vi.fn>;
const mockedAllow = allowByDbLimit as unknown as ReturnType<typeof vi.fn>;
const mockedAdd = addToDoNotContact as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown, method = 'POST') {
  return new NextRequest('http://localhost/api/unsubscribe', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('unsubscribe API (b8be)', () => {
  // Default: address IS on the outreach list.
  function adminWithListed(listed: boolean) {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: listed ? { id: '1' } : null }),
            }),
          }),
        }),
      }),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockedAllow.mockResolvedValue(true);
    mockedAdmin.mockReturnValue(adminWithListed(true));
  });

  it('GET never mutates (405) even with a valid token', async () => {
    const res = await GET();
    expect(res.status).toBe(405);
    expect(mockedAdd).not.toHaveBeenCalled();
  });

  it('POST with a valid token unsubscribes', async () => {
    const res = await POST(req({ email: 'a@b.com', token: 'valid-token' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(mockedAdd).toHaveBeenCalledWith('a@b.com', 'Unsubscribed via email link', 'unsubscribe');
  });

  it('POST with an invalid token does not unsubscribe (400)', async () => {
    const res = await POST(req({ email: 'a@b.com', token: 'bad-token' }));
    expect(res.status).toBe(400);
    expect(mockedAdd).not.toHaveBeenCalled();
  });

  it('POST without a token sends a confirmation link to a listed address', async () => {
    const res = await POST(req({ email: 'a@b.com' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, checkInbox: true });
    expect(mockedSend).toHaveBeenCalledOnce();
    const html = mockedSend.mock.calls[0][0].html as string;
    expect(html).toContain('/unsubscribe?email=a%40b.com&token=new-token');
    expect(html).toContain('Transactional emails');
    expect(mockedAdd).not.toHaveBeenCalled();
  });

  it('POST without a token sends nothing for an unlisted address (same reply, no enumeration)', async () => {
    mockedAdmin.mockReturnValue(adminWithListed(false));
    const res = await POST(req({ email: 'stranger@b.com' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, checkInbox: true });
    expect(mockedSend).not.toHaveBeenCalled();
    expect(mockedAdd).not.toHaveBeenCalled();
  });

  it('honeypot trips get a silent fake success and no send', async () => {
    const res = await POST(req({ email: 'a@b.com', website_url: 'http://spam.example' }));
    expect(res.status).toBe(200);
    expect(mockedSend).not.toHaveBeenCalled();
    expect(mockedAdd).not.toHaveBeenCalled();
  });

  it('rate limit returns 429; invalid email returns 400', async () => {
    mockedAllow.mockResolvedValue(false);
    const limited = await POST(req({ email: 'a@b.com', token: 'valid-token' }));
    expect(limited.status).toBe(429);
    mockedAllow.mockResolvedValue(true);
    const bad = await POST(req({ email: 'not-an-email' }));
    expect(bad.status).toBe(400);
  });
});
