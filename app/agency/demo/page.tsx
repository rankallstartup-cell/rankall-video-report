'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DEMO_BOOKING_URL } from '@/lib/demoBooking';
import { HONEYPOT_FIELD } from '@/lib/publicFormGuardShared';

// Agency demo door (b28m) — a real demo-request form, not a dead button.
// Submits to the existing contact pipeline (/api/contact, type 'agency_demo'),
// which emails the request to hello@rankall.io. The self-serve trial path
// stays untouched and equally visible: demo is an ALONGSIDE option, never a
// gate in front of the trial. No response-time promise is made here — the
// confirmation only says we will reply to the email given.

// V2 design tokens (matches landing / contact pages)
const INK = '#0A0A14';
const BLUE = '#1B17FF';
const BODY = '#55556A';
const BG = '#F6F6FB';
const CARD = '#FFFFFF';
const BORDER = '#EDEDF4';
const DIM = '#8A8AA3';

export default function AgencyDemoPage() {
  const [form, setForm] = useState({ name: '', email: '', company: '', message: '' });
  // Honeypot (hidden from humans + assistive tech); bots that fill every
  // input get silently dropped by /api/contact.
  const [trap, setTrap] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const f = (k: string, v: string) => setForm(x => ({ ...x, [k]: v }));

  const handleSubmit = async () => {
    if (!valid || sending) return;
    setSending(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, type: 'agency_demo', [HONEYPOT_FIELD]: trap }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Never show the success screen on a failed send.
        setSubmitError(data?.error || 'We could not send your demo request. Please try again or email hello@rankall.io directly.');
        return;
      }
      setSent(true);
    } catch {
      setSubmitError('We could not send your demo request. Please check your connection and try again, or email hello@rankall.io directly.');
    } finally {
      setSending(false);
    }
  };

  const inp: React.CSSProperties = {
    background: BG, border: `1px solid ${BORDER}`, borderRadius: 12,
    padding: '14px 16px', fontSize: 15, color: INK, width: '100%',
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  };
  const label: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, color: BODY, textTransform: 'uppercase',
    letterSpacing: '0.08em', display: 'block', marginBottom: 8,
  };

  const valid = form.name.trim() && form.email.includes('@') && form.company.trim() && form.message.trim();

  return (
    <div style={{ background: BG, minHeight: '100vh', fontFamily: "'Geist','Inter','Helvetica Neue',Arial,sans-serif" }}>
      <section style={{ padding: '88px 24px 40px' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: BLUE, background: '#EEF0FF', borderRadius: 999, padding: '8px 20px' }}>For Marketing Agencies</span>
          <h1 style={{ margin: 0, fontSize: 'clamp(36px,5vw,56px)', fontWeight: 700, color: INK, letterSpacing: '-0.045em', lineHeight: 1.02 }}>Book an <span style={{ color: BLUE }}>Agency demo</span></h1>
          <p style={{ margin: 0, fontSize: 18, color: BODY, lineHeight: 1.6, maxWidth: 560 }}>
            Tell us about your agency and what you want to see. We will walk through the white-label setup together.
          </p>
        </div>
      </section>

      <section style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px 96px' }}>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: '36px 32px', boxShadow: '0 8px 24px rgba(10,10,20,0.06)' }}>
          {sent ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <p style={{ fontSize: 22, fontWeight: 700, color: INK, margin: '0 0 12px' }}>Thanks — your demo request is in.</p>
              <p style={{ fontSize: 15, color: BODY, lineHeight: 1.6, margin: '0 0 28px' }}>
                We will reply to <strong style={{ color: INK }}>{form.email}</strong> to schedule your demo.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                {DEMO_BOOKING_URL && (
                  <a href={DEMO_BOOKING_URL} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 999, padding: '14px 28px', fontSize: 15, fontWeight: 600, color: INK, textDecoration: 'none', display: 'inline-block' }}>
                    Or pick a time yourself
                  </a>
                )}
                <Link href="/signup?plan=agency" style={{ background: BLUE, borderRadius: 999, padding: '14px 28px', fontSize: 15, fontWeight: 700, color: '#fff', textDecoration: 'none', display: 'inline-block' }}>
                  Start Agency Trial
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
                  <label htmlFor="demo-website-url">Leave this field empty</label>
                  <input id="demo-website-url" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" value={trap} onChange={e => setTrap(e.target.value)} />
                </div>
                <div>
                  <label style={label} htmlFor="demo-name">Your name</label>
                  <input id="demo-name" style={inp} value={form.name} onChange={e => f('name', e.target.value)} placeholder="Alex Rivera" maxLength={200} />
                </div>
                <div>
                  <label style={label} htmlFor="demo-email">Work email</label>
                  <input id="demo-email" style={inp} type="email" value={form.email} onChange={e => f('email', e.target.value)} placeholder="you@youragency.com" maxLength={320} />
                </div>
                <div>
                  <label style={label} htmlFor="demo-company">Agency / business name</label>
                  <input id="demo-company" style={inp} value={form.company} onChange={e => f('company', e.target.value)} placeholder="Rivera Marketing" maxLength={300} />
                </div>
                <div>
                  <label style={label} htmlFor="demo-message">What do you want to see?</label>
                  <textarea id="demo-message" style={{ ...inp, minHeight: 120, resize: 'vertical' }} value={form.message} onChange={e => f('message', e.target.value)} placeholder="e.g. White-label reports for 20 clients, proposal builder, client dashboard…" maxLength={5000} />
                </div>
              </div>

              {submitError && (
                <div role="alert" style={{ marginTop: 20, background: '#FDECEC', border: '1px solid #F5C2C2', borderRadius: 12, padding: '14px 18px', fontSize: 14, color: '#8B1A1A', lineHeight: 1.6 }}>
                  {submitError}
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={!valid || sending}
                style={{ marginTop: 24, width: '100%', background: valid ? BLUE : BORDER, border: 'none', borderRadius: 999, padding: '16px', fontSize: 16, fontWeight: 700, color: valid ? '#fff' : DIM, cursor: valid ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}
              >
                {sending ? 'Sending…' : 'Request a demo'}
              </button>

              <p style={{ fontSize: 14, color: BODY, textAlign: 'center', margin: '20px 0 0', lineHeight: 1.6 }}>
                {DEMO_BOOKING_URL ? (
                  <>
                    Prefer to pick a time yourself?{' '}
                    <a href={DEMO_BOOKING_URL} style={{ color: BLUE, fontWeight: 600 }}>Book directly on our calendar</a>
                    {' '}— or{' '}
                  </>
                ) : (
                  <>Don&apos;t need a call?{' '}</>
                )}
                <Link href="/signup?plan=agency" style={{ color: BLUE, fontWeight: 600 }}>start the Agency trial</Link>
                {' '}now, no call needed.
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
