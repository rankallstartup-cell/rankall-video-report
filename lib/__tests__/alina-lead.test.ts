// A4 — capture_lead + LeadForm data. The lead goes through the same
// pipeline as /api/contact: sendEmail (Resend) to hello@rankall.io.
// captured === false on ANY failure (missing key, Resend rejection,
// unexpected throw) — the widget then shows the hello@rankall.io
// fallback, never a fake confirmation. No response time is ever
// promised, anywhere in this flow.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateLead, captureLead, detectEscalation, getLeadBlock } from '@/lib/alinaTools';
import { sendEmail } from '@/lib/emailTemplates';

vi.mock('@/lib/emailTemplates', () => ({ sendEmail: vi.fn() }));
const mockedSend = sendEmail as unknown as ReturnType<typeof vi.fn>;

const VALID = {
  name: 'Dana Dentist',
  email: 'dana@example.com',
  business: 'Bright Smile Dental',
  summary: 'Wants a demo for her 3-location practice.',
  reason: 'demo' as const,
};

describe('validateLead', () => {
  it('accepts a valid lead', () => {
    expect(validateLead(VALID)).toEqual({ ok: true, lead: VALID });
  });
  it('rejects missing name, bad email, missing summary, bad reason, oversize fields', () => {
    expect(validateLead({ ...VALID, name: '' }).ok).toBe(false);
    expect(validateLead({ ...VALID, email: 'not-an-email' }).ok).toBe(false);
    expect(validateLead({ ...VALID, summary: '' }).ok).toBe(false);
    expect(validateLead({ ...VALID, reason: 'discount' }).ok).toBe(false);
    expect(validateLead({ ...VALID, business: 'x'.repeat(301) }).ok).toBe(false);
    expect(validateLead(null).ok).toBe(false);
  });
});

describe('captureLead', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('sends a lead email to the team inbox and reports captured: true', async () => {
    mockedSend.mockResolvedValue(true);
    await expect(captureLead(VALID)).resolves.toEqual({ captured: true });
    const arg = mockedSend.mock.calls[0][0] as { to: string; subject: string; html: string; replyTo: string };
    expect(arg.to).toBe('hello@rankall.io');
    expect(arg.subject).toContain('Alina lead');
    expect(arg.subject).toContain('Dana Dentist');
    expect(arg.replyTo).toBe('dana@example.com');
    expect(arg.html).toContain('Bright Smile Dental');
    expect(arg.html).toContain('Wants a demo for her 3-location practice.');
    // No response-time promise anywhere in the email.
    expect(arg.html).not.toMatch(/within \d+|24 hours|response time|we.ll get back/i);
  });

  it('escapes HTML in lead fields', async () => {
    mockedSend.mockResolvedValue(true);
    await captureLead({ ...VALID, summary: '<script>alert(1)</script>' });
    const arg = mockedSend.mock.calls[0][0] as { html: string };
    expect(arg.html).not.toContain('<script>');
    expect(arg.html).toContain('&lt;script&gt;');
  });

  it('reports captured: false when sending fails — never a fake confirmation', async () => {
    mockedSend.mockResolvedValue(false);
    await expect(captureLead(VALID)).resolves.toEqual({ captured: false });
  });

  it('reports captured: false even if sendEmail throws', async () => {
    mockedSend.mockRejectedValue(new Error('boom'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(captureLead(VALID)).resolves.toEqual({ captured: false });
    err.mockRestore();
  });
});

describe('escalation detection (interim, until A6 tool loop)', () => {
  it('detects each escalation reason', () => {
    expect(detectEscalation('I want a demo')).toBe('demo');
    expect(detectEscalation('Do you have enterprise options?')).toBe('enterprise');
    expect(detectEscalation('I was charged twice')).toBe('billing');
    expect(detectEscalation('This is broken')).toBe('bug');
    expect(detectEscalation('This is terrible')).toBe('other');
  });

  it('does not fire on pricing or scan questions', () => {
    expect(detectEscalation('How much is Agency?')).toBeNull();
    expect(detectEscalation('Why is my score 41?')).toBeNull();
    expect(detectEscalation('Hello')).toBeNull();
  });
});

describe('getLeadBlock', () => {
  it('returns a lead block with the visitor message as the summary', () => {
    expect(getLeadBlock('I want a demo')).toEqual({
      kind: 'lead',
      reason: 'demo',
      summary: 'I want a demo',
    });
    expect(getLeadBlock('Why is my score 41?')).toBeNull();
  });
});
