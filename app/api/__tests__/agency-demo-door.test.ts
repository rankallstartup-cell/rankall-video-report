import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { NextRequest } from 'next/server';

// b28m: Agency demo door — the demo-request form must submit somewhere real
// (the existing /api/contact pipeline, type 'agency_demo'), never fake a
// success, and never gate the self-serve trial.
vi.mock('@/lib/emailTemplates', () => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => { throw new Error('no db in tests'); },
}));
vi.mock('@/lib/rateLimit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 2, limit: 3 })),
}));

import { POST } from '@/app/api/contact/route';
import { sendEmail } from '@/lib/emailTemplates';
import { checkRateLimit } from '@/lib/rateLimit';

const mockedSendEmail = sendEmail as unknown as ReturnType<typeof vi.fn>;
const mockedRateLimit = checkRateLimit as unknown as ReturnType<typeof vi.fn>;

const demoBody = {
  name: 'Alex Rivera',
  email: 'alex@rivera-marketing.com',
  company: 'Rivera Marketing',
  message: 'Show me white-label reports for 20 clients.',
  type: 'agency_demo',
};

function post(body: unknown) {
  return POST(
    new NextRequest('http://localhost/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
      body: JSON.stringify(body),
    }),
  );
}

describe('agency demo door — submit via /api/contact (type agency_demo)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRateLimit.mockReturnValue({ allowed: true, remaining: 2, limit: 3 });
    mockedSendEmail.mockResolvedValue(true);
  });

  it('a valid agency demo request succeeds and emails the team inbox', async () => {
    const res = await post(demoBody);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(mockedSendEmail).toHaveBeenCalledOnce();
    const args = mockedSendEmail.mock.calls[0][0] as Record<string, unknown>;
    expect(args.to).toBe('hello@rankall.io');
    expect(args.subject).toContain('Agency demo request');
    expect(args.subject).toContain('Alex Rivera');
    expect(args.replyTo).toBe('alex@rivera-marketing.com');
    expect(args.html).toContain('Rivera Marketing');
    expect(args.html).toContain('white-label reports for 20 clients');
  });

  it('an invalid email is refused with a human-readable error, never a fake success', async () => {
    const res = await post({ ...demoBody, email: 'not-an-email' });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/valid email/i);
    expect(mockedSendEmail).not.toHaveBeenCalled();
  });

  it('a missing message is refused with a human-readable error', async () => {
    const res = await post({ ...demoBody, message: '   ' });
    expect(res.status).toBe(400);
    expect(mockedSendEmail).not.toHaveBeenCalled();
  });

  it('when the email fails to send, the response is a 500 with a fallback — never a fake success', async () => {
    mockedSendEmail.mockResolvedValueOnce(false);
    const res = await post(demoBody);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toMatch(/hello@rankall\.io directly/);
    expect(data).not.toHaveProperty('success');
  });

  it('when rate-limited, the response is a 429 with a human-readable error', async () => {
    mockedRateLimit.mockReturnValueOnce({ allowed: false, remaining: 0, limit: 3 });
    const res = await post(demoBody);
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toMatch(/too many/i);
    expect(mockedSendEmail).not.toHaveBeenCalled();
  });
});

describe('contact route spam guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRateLimit.mockReturnValue({ allowed: true, remaining: 2, limit: 3 });
    mockedSendEmail.mockResolvedValue(true);
  });

  it('a filled honeypot is dropped silently (no email sent)', async () => {
    const res = await post({ ...demoBody, website_url: 'http://spam.example' });
    expect(res.status).toBe(200);
    expect(mockedSendEmail).not.toHaveBeenCalled();
  });

  it('uses a namespaced in-memory bucket (not the shared scan bucket)', async () => {
    await post(demoBody);
    expect(mockedRateLimit).toHaveBeenCalledWith('contact:203.0.113.7', null);
  });

  it('a missing DB fails open: real messages still go through', async () => {
    const res = await post(demoBody);
    expect(res.status).toBe(200);
    expect(mockedSendEmail).toHaveBeenCalledOnce();
  });
});

describe('agency demo door — wiring (source-level)', () => {
  const demoPage = readFileSync(join(process.cwd(), 'app/agency/demo/page.tsx'), 'utf8');
  const contactRoute = readFileSync(join(process.cwd(), 'app/api/contact/route.ts'), 'utf8');
  const pricing = readFileSync(join(process.cwd(), 'app/pricing/PricingClient.tsx'), 'utf8');
  const homepage = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8');
  const agencyPage = readFileSync(join(process.cwd(), 'app/agency/page.tsx'), 'utf8');

  it('the contact route accepts an agency_demo type with an Agency-specific label', () => {
    expect(contactRoute).toContain("agency_demo: 'Agency demo request'");
  });

  it('the demo form posts to /api/contact with type agency_demo', () => {
    expect(demoPage).toContain("fetch('/api/contact'");
    expect(demoPage).toContain("type: 'agency_demo'");
  });

  it('the demo form asks for name, work email, agency name, and what they want to see', () => {
    expect(demoPage).toContain('Your name');
    expect(demoPage).toContain('Work email');
    expect(demoPage).toContain('Agency / business name');
    expect(demoPage).toContain('What do you want to see?');
  });

  it('a failed submit shows a visible error and never the success screen (no fake success)', () => {
    expect(demoPage).toContain('role="alert"');
    expect(demoPage).toContain('setSubmitError');
    expect(demoPage).toContain('Never show the success screen on a failed send');
  });

  it('success confirms without inventing a response-time promise', () => {
    expect(demoPage).toContain('your demo request is in');
    expect(demoPage).not.toMatch(/within 24 hours|within one business day|in 24 hours/);
  });

  it('the demo page offers the calendar only via env (no hardcoded/dead link) and the self-serve trial', () => {
    // Ticket 11: the Cal.com URL was hardcoded; it now comes from
    // NEXT_PUBLIC_DEMO_BOOKING_URL and is hidden when unset (the form is
    // the fallback booking path).
    expect(demoPage).not.toContain('https://cal.com/rankall.io/demo');
    expect(demoPage).toContain('DEMO_BOOKING_URL &&');
    expect(demoPage).toContain('/signup?plan=agency');
  });

  it('the demo form carries the honeypot field', () => {
    expect(demoPage).toContain('[HONEYPOT_FIELD]: trap');
  });

  it('pricing Agency card has Book a demo alongside the untouched trial CTA', () => {
    expect(pricing).toContain("demoHref: '/agency/demo'");
    expect(pricing).toContain('Book a demo');
    expect(pricing).toContain("href: '/signup?plan=agency'");
    expect(pricing).toContain('Start Agency Trial');
  });

  it('homepage Agency card has Book a demo alongside the untouched trial CTA', () => {
    expect(homepage).toContain("demoHref:'/agency/demo'");
    expect(homepage).toContain("Book a demo");
    expect(homepage).toContain("href:'/signup?plan=agency'");
  });

  it('the agency page keeps a demo door (both doors coexist) and routes it through /agency/demo, never a hardcoded calendar', () => {
    // The calendar URL lives in NEXT_PUBLIC_DEMO_BOOKING_URL (lib/demoBooking);
    // a hardcoded Cal.com link dies silently if the calendar is renamed.
    expect(agencyPage).toContain('href="/agency/demo"');
    expect(agencyPage).not.toContain('cal.com/rankall.io');
    expect(agencyPage).toContain('Book Agency Demo');
  });
});
