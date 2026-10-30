'use client';

import { useState } from 'react';
import Link from 'next/link';
import { HONEYPOT_FIELD } from '@/lib/publicFormGuardShared';

// V2 design tokens (matches landing page)
const INK = '#0A0A14';
const BLUE = '#1B17FF';
const BODY = '#55556A';
const BG = '#F6F6FB';
const CARD = '#FFFFFF';
const BORDER = '#EDEDF4';
const DIM = '#8A8AA3';

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', company: '', message: '', type: 'demo' });
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Hidden honeypot (/api/contact rejects a filled one) — humans never see it.
  const [trap, setTrap] = useState('');
  const f = (k: string, v: string) => setForm(x => ({ ...x, [k]: v }));

  const handleSubmit = async () => {
    if (!valid || sending) return;
    setSending(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, [HONEYPOT_FIELD]: trap }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Never show the success screen on a failed send — that was the old bug.
        setSubmitError(data?.error || 'We could not send your message. Please try again or email hello@rankall.io directly.');
        return;
      }
      setSent(true);
    } catch {
      setSubmitError('We could not send your message. Please check your connection and try again, or email hello@rankall.io directly.');
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

  const valid = form.name.trim() && form.email.includes('@');

  return (
    <div style={{ background: BG, minHeight: '100vh', fontFamily: "'Geist','Inter','Helvetica Neue',Arial,sans-serif" }}>
      {/* Hero */}
      <section style={{ padding: '88px 24px 40px' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: BLUE, background: '#EEF0FF', borderRadius: 999, padding: '8px 20px' }}>Get in touch</span>
          <h1 style={{ margin: 0, fontSize: 'clamp(40px,5.5vw,64px)', fontWeight: 700, color: INK, letterSpacing: '-0.045em', lineHeight: 1.02 }}>Let's talk about your <span style={{ color: BLUE }}>AI visibility</span></h1>
          <p style={{ margin: 0, fontSize: 18, color: BODY, lineHeight: 1.6, maxWidth: 640 }}>
            Whether you want a demo, have a pricing question, or want to explore Agency or Enterprise — we respond within 24 hours.
          </p>
        </div>
      </section>

      {/* Content */}
      <section style={{ padding: '20px 24px 120px' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(380px,100%),1fr))', gap: 24, alignItems: 'start' }}>

          {/* LEFT — contact methods */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { icon: <svg viewBox="0 0 512 512" width="20" height="20" fill="#fff" aria-hidden="true"><path d="M48 64C21.5 64 0 85.5 0 112c0 15.1 7.1 29.3 19.2 38.4L236.8 313.6c11.4 8.5 27 8.5 38.4 0L492.8 150.4c12.1-9.1 19.2-23.3 19.2-38.4c0-26.5-21.5-48-48-48L48 64zM0 176L0 384c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-208L294.4 339.2c-22.8 17.1-54 17.1-76.8 0L0 176z"/></svg>, label: 'Email', value: 'hello@rankall.io', href: 'mailto:hello@rankall.io' },
              { icon: <svg viewBox="0 0 448 512" width="20" height="20" fill="#fff" aria-hidden="true"><path d="M128 0c17.7 0 32 14.3 32 32l0 32 128 0 0-32c0-17.7 14.3-32 32-32s32 14.3 32 32l0 32 48 0c26.5 0 48 21.5 48 48l0 48L0 160l0-48C0 85.5 21.5 64 48 64l48 0 0-32c0-17.7 14.3-32 32-32zM0 192l448 0 0 272c0 26.5-21.5 48-48 48L48 512c-26.5 0-48-21.5-48-48L0 192zm64 80l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0c-8.8 0-16 7.2-16 16zm128 0l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0c-8.8 0-16 7.2-16 16zm144-16c-8.8 0-16 7.2-16 16l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0zM64 400l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0c-8.8 0-16 7.2-16 16zm144-16c-8.8 0-16 7.2-16 16l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0zm112 16l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0c-8.8 0-16 7.2-16 16z"/></svg>, label: 'Book a demo', value: '15-minute platform walkthrough', href: '/demo' },
              { icon: <svg viewBox="0 0 384 512" width="20" height="20" fill="#fff" aria-hidden="true"><path d="M48 0C21.5 0 0 21.5 0 48L0 464c0 26.5 21.5 48 48 48l96 0 0-80c0-26.5 21.5-48 48-48s48 21.5 48 48l0 80 96 0c26.5 0 48-21.5 48-48l0-416c0-26.5-21.5-48-48-48L48 0zM64 240c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32zm112-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16zm80 16c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32zM80 96l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16zm80 16c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32zM272 96l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16z"/></svg>, label: 'Agency enquiries', value: 'hello@rankall.io — subject: Agency', href: 'mailto:hello@rankall.io?subject=Agency enquiry' },
              { icon: <svg viewBox="0 0 512 512" width="20" height="20" fill="#fff" aria-hidden="true"><path d="M240.1 4.2c9.8-5.6 21.9-5.6 31.8 0l171.8 98.1L448 104l0 .9 47.9 27.4c12.6 7.2 18.8 22 15.1 36s-16.4 23.8-30.9 23.8L32 192c-14.5 0-27.2-9.8-30.9-23.8s2.5-28.8 15.1-36L64 104.9l0-.9 4.4-1.6L240.1 4.2zM64 224l64 0 0 192 40 0 0-192 64 0 0 192 48 0 0-192 64 0 0 192 40 0 0-192 64 0 0 196.3c.6 .3 1.2 .7 1.8 1.1l48 32c11.7 7.8 17 22.4 12.9 35.9S494.1 512 480 512L32 512c-14.1 0-26.5-9.2-30.6-22.7s1.1-28.1 12.9-35.9l48-32c.6-.4 1.2-.7 1.8-1.1L64 224z"/></svg>, label: 'Enterprise', value: 'hello@rankall.io — subject: Enterprise', href: 'mailto:hello@rankall.io?subject=Enterprise enquiry' },
            ].map((item, i) => (
              <a key={i} href={item.href} style={{ display: 'flex', gap: 16, alignItems: 'center', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '20px 22px', textDecoration: 'none' }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0, boxShadow: '0 8px 24px rgba(27,23,255,0.3)' }}>{item.icon}</div>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>{item.label}</p>
                  <p style={{ fontSize: 15, color: INK, fontWeight: 600, margin: 0 }}>{item.value}</p>
                </div>
              </a>
            ))}

            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '24px' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 14px' }}>Quick links</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[
                  { label: 'See Pricing', href: '/pricing' },
                  { label: 'Agency Plans', href: '/agency' },
                  { label: 'Case Studies', href: '/case-studies' },
                ].map(l => (
                  <Link key={l.href} href={l.href} style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 999, padding: '10px 18px', fontSize: 14, fontWeight: 600, color: INK, textDecoration: 'none' }}>
                    {l.label} <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true" style={{verticalAlign: '-2px', marginLeft: 4}}><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT — form */}
          {!sent ? (
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: '36px 32px', boxShadow: '0 20px 48px -24px rgba(10,10,20,0.18)' }}>
              <h2 style={{ fontSize: 24, fontWeight: 700, color: INK, letterSpacing: '-0.03em', margin: '0 0 24px' }}>Send us a message</h2>

              <div style={{ marginBottom: 16 }}>
                <label style={label}>What can we help with?</label>
                <select value={form.type} onChange={e => f('type', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                  <option value="demo">Book a product demo</option>
                  <option value="agency">Agency white-label enquiry</option>
                  <option value="enterprise">Enterprise or Compliance</option>
                  <option value="support">Technical support</option>
                  <option value="other">Something else</option>
                </select>
              </div>

              <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
                <label htmlFor="contact-website-url">Leave this field empty</label>
                <input id="contact-website-url" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" value={trap} onChange={e => setTrap(e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={label}>Your name</label>
                  <input style={inp} value={form.name} onChange={e => f('name', e.target.value)} placeholder="Jane Smith" />
                </div>
                <div>
                  <label style={label}>Email</label>
                  <input style={inp} type="email" value={form.email} onChange={e => f('email', e.target.value)} placeholder="you@company.com" />
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={label}>Company or Website</label>
                <input style={inp} value={form.company} onChange={e => f('company', e.target.value)} placeholder="yourcompany.com" />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={label}>Message</label>
                <textarea style={{ ...inp, resize: 'vertical', minHeight: 110 }} rows={4} value={form.message} onChange={e => f('message', e.target.value)} placeholder="Tell us what you are looking for…" />
              </div>

              {submitError && (
                <p role="alert" style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: 12, padding: '12px 16px', fontSize: 14, fontWeight: 600, margin: '0 0 16px' }}>
                  {submitError}
                </p>
              )}
              <button
                onClick={handleSubmit}
                disabled={!valid || sending}
                style={{
                  width: '100%', background: valid && !sending ? BLUE : '#E7E7F0', border: 'none', borderRadius: 999,
                  padding: '16px', fontSize: 16, fontWeight: 700, color: '#fff',
                  cursor: valid && !sending ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                  boxShadow: valid && !sending ? '0 12px 32px rgba(27,23,255,0.35)' : 'none',
                  opacity: valid && !sending ? 1 : 0.6,
                }}
              >
                {sending ? 'Sending…' : 'Send Message'} <svg viewBox="0 0 448 512" width="14" height="14" fill="#fff" aria-hidden="true" style={{verticalAlign: '-2px', marginLeft: 6}}><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
              </button>
              <p style={{ textAlign: 'center', fontSize: 13, color: DIM, marginTop: 14 }}>We respond within 24 hours on business days.</p>
            </div>
          ) : (
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: '56px 40px', textAlign: 'center', boxShadow: '0 20px 48px -24px rgba(10,10,20,0.18)' }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#E8F9F0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto 20px' }}><svg viewBox="0 0 448 512" width="28" height="28" fill="#059669" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg></div>
              <p style={{ fontSize: 26, fontWeight: 700, color: INK, letterSpacing: '-0.03em', margin: '0 0 10px' }}>Message received</p>
              <p style={{ fontSize: 15, color: BODY, margin: '0 0 28px' }}>We'll get back to you at <strong style={{ color: INK }}>{form.email}</strong> within 24 hours.</p>
              <Link href="/" style={{ display: 'inline-block', border: `1px solid ${BORDER}`, borderRadius: 999, padding: '13px 28px', fontSize: 14, fontWeight: 600, color: INK, textDecoration: 'none' }}>
                Back to Home
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
