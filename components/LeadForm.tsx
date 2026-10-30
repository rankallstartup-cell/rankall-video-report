// LeadForm — renders a server-attached LeadBlock (A4) inside the Alina
// widget. The visitor fills name / email / business / summary and the
// form POSTs { lead } to /api/chat, which runs capture_lead.
//
// Honesty rules, enforced here and on the server:
// - Success: "Thanks — the team has your note." NEVER a response time
//   (no staffed response time exists to quote).
// - Delivery failure: an honest fallback pointing at hello@rankall.io,
//   never a fake confirmation. The form stays open so the visitor can
//   retry.
// - Validation errors show inline; the form stays open.
//
// Imported by components/Chatbot.tsx (a client component). This file
// imports only the block TYPE from lib/alinaTools (erased at compile
// time), so no server code enters the client bundle.
'use client';

import { useState } from 'react';
import type { LeadBlock } from '@/lib/alinaTools';

const C = {
  border: '#E2E8F0',
  navy: '#0F172A',
  blue: '#2563EB',
  green: '#059669',
  red: '#DC2626',
  gray: '#64748B',
  surface: '#F8FAFC',
  errorBg: '#FEF2F2',
};

const REASON_TITLES: Record<LeadBlock['reason'], string> = {
  demo: 'Book a demo',
  enterprise: 'Enterprise / Government',
  billing: 'Billing / Refund',
  bug: 'Report a bug',
  other: 'Talk to the team',
};

const FALLBACK = "I couldn't send that — please email hello@rankall.io directly.";

export default function LeadForm({ block, sessionId, page }: { block: LeadBlock; sessionId: string; page: string }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [business, setBusiness] = useState('');
  const [summary, setSummary] = useState(block.summary);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (sending || done) return;
    if (!name.trim()) { setError('Please enter your name.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Please enter a valid email address.'); return; }
    if (!summary.trim()) { setError('Please add a short summary.'); return; }
    setError('');
    setSending(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead: { name: name.trim(), email: email.trim(), business: business.trim(), summary: summary.trim(), reason: block.reason },
          // A5: session logging.
          sessionId,
          page,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' && data.error ? data.error : FALLBACK);
      } else if (data.captured === true) {
        setDone(true);
      } else {
        setError(FALLBACK);
      }
    } catch {
      setError(FALLBACK);
    }
    setSending(false);
  }

  const input = {
    width: '100%',
    background: '#fff',
    border: `1.5px solid ${C.border}`,
    borderRadius: 8,
    padding: '8px 11px',
    fontSize: 13,
    color: C.navy,
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
  };

  if (done) {
    return (
      <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', fontSize: 13, color: C.navy, lineHeight: 1.5 }}>
        <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>✓ Sent</p>
        <p style={{ margin: 0 }}>Thanks — the team has your note.</p>
      </div>
    );
  }

  return (
    <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px', fontSize: 13, color: C.navy, lineHeight: 1.5 }}>
      <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>
        {REASON_TITLES[block.reason]}
      </p>
      <p style={{ fontSize: 12, color: C.gray, margin: '0 0 10px' }}>
        Leave your details and the team will have your note.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input aria-label="Your name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" style={input} />
        <input aria-label="Your email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email" type="email" style={input} />
        <input aria-label="Business (optional)" value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="Business (optional)" style={input} />
        <textarea aria-label="Summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} placeholder="One-line summary" style={{ ...input, resize: 'vertical' }} />
        {error && (
          <p role="alert" style={{ fontSize: 12, color: C.red, background: C.errorBg, borderRadius: 8, padding: '8px 10px', margin: 0 }}>
            {error}
          </p>
        )}
        <button
          onClick={submit}
          disabled={sending}
          style={{
            background: sending ? C.border : C.blue, color: '#fff', border: 'none', borderRadius: 999,
            padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: sending ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
}
