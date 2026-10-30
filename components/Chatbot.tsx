'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { CHAT_MAX_MESSAGE_CHARS } from '@/lib/chatInput';
import type { ChatBlock } from '@/lib/alinaTools';
import { loadChatState, saveChatState, clearChatState } from '@/lib/alinaChatStorage';
import PricingCard from '@/components/PricingCard';
import LeadForm from '@/components/LeadForm';
import ScanCard from '@/components/ScanCard';
import FixPlanCard from '@/components/FixPlanCard';
import DraftCard from '@/components/DraftCard';
import VerificationCard from '@/components/VerificationCard';
import AlinaMessage from '@/components/AlinaMessage';

const C = {
  bg:      '#FFFFFF',
  surface: '#F8FAFC',
  border:  '#E2E8F0',
  navy:    '#0F172A',
  blue:    '#2563EB',
  green:   '#059669',
  gray:    '#64748B',
  lgray:   '#94A3B8',
  userMsg: '#2563EB',
  asstMsg: '#F1F5F9',
};

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Server-computed structured blocks (A3: PricingCard). Rendered under the text. */
  blocks?: ChatBlock[];
}

const GREETING = "Hi, I'm Alina\n\nAsk me anything about AI visibility, your trust score, or how Rankall works.";

const SUGGESTED = [
  'Why isn\'t my business showing in ChatGPT?',
  'How do I improve my AI trust score?',
  'What\'s the difference between trust score and coverage?',
  'How long until fixes work?',
];

// A9: contextual chips. Homepage is scan-first; report pages offer the
// scan's own questions (the scan ID travels as request context, so the
// visitor never types it).
const HOMEPAGE_CHIPS = [
  'Scan my business',
  'How much is Agency?',
  'What does Rankall check?',
];
const REPORT_CHIPS = [
  'Explain my score',
  'What should I fix first?',
  'How is my score calculated?',
];

function genId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export default function Chatbot() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // A5: per-page-load session id for chat_sessions logging (A9 persists
  // it across pages in sessionStorage). Generated once per mount; never
  // sent to the model.
  const [sessionId, setSessionId] = useState(() => genId());
  const [messages, setMessages] = useState<Message[]>([
    { id: genId(), role: 'assistant', content: GREETING },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  // A9: true once the first streamed token arrives (typing dots stop);
  // status line shown while tools run (e.g. a scan).
  const [streamed, setStreamed] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const hydratedRef = useRef(false);

  // A9: restore the conversation + session id from sessionStorage, so a
  // refresh or a trip to /pricing does not lose the chat.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = loadChatState(window.sessionStorage);
    if (stored) {
      setMessages(stored.messages.map((m) => ({ ...m, id: genId() })));
      setSessionId(stored.sessionId);
    }
    hydratedRef.current = true;
  }, []);

  // A9: persist on every change (after hydration). Only messages +
  // sessionId are stored — never credentials (the chat has none).
  useEffect(() => {
    if (!hydratedRef.current || typeof window === 'undefined') return;
    saveChatState(window.sessionStorage, { version: 1, sessionId, messages });
  }, [messages, sessionId]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  // A9: scan/report ID from the URL — the route uses it as PAGE CONTEXT
  // so report-page questions resolve without the visitor typing an ID.
  const reportScanId =
    (pathname.startsWith('/report/') || pathname.startsWith('/reports/'))
      ? pathname.split('/')[2] || ''
      : '';
  const chips = pathname === '/' ? HOMEPAGE_CHIPS : reportScanId ? REPORT_CHIPS : SUGGESTED;

  function clearChat() {
    if (typeof window !== 'undefined') clearChatState(window.sessionStorage);
    setMessages([{ id: genId(), role: 'assistant', content: GREETING }]);
    setSessionId(genId());
    setStatusText(null);
    setStreamed(false);
  }

  async function send(text?: string) {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');
    setStatusText(null);
    setStreamed(false);
    const userMsg: Message = { id: genId(), role: 'user', content: msg };
    const nextMessages: Message[] = [...messages, userMsg];
    setMessages(nextMessages);
    setLoading(true);
    // A9: append the assistant message now — streamed deltas fill it in.
    const assistantId = genId();
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }]);
    const setAssistant = (patch: Partial<Message>) => {
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)));
    };
    try {
      // Server proxy (app/api/chat) — the API key never reaches the browser.
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
          // A5: session logging (page + session id). Never sent to the model.
          sessionId,
          page: pathname,
          // A9: report-page scan context + streaming request.
          ...(reportScanId ? { scanId: reportScanId } : {}),
          stream: true,
        }),
      });
      const contentType = res.headers.get('content-type') ?? '';
      if (contentType.includes('text/event-stream') && res.body) {
        // A9: streaming path — deltas append live; done carries blocks.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let replyText = '';
        let sawDone = false;
        for (;;) {
          const { done: streamDone, value } = await reader.read();
          if (streamDone) break;
          buffer += decoder.decode(value, { stream: true });
          let boundary = buffer.indexOf('\n\n');
          while (boundary >= 0) {
            const raw = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const line = raw.split('\n').find((l) => l.startsWith('data: '));
            if (line) {
              try {
                const ev = JSON.parse(line.slice(6)) as { type?: string; delta?: unknown; text?: unknown; reply?: unknown; blocks?: unknown; error?: unknown };
                if (ev.type === 'text' && typeof ev.delta === 'string') {
                  replyText += ev.delta;
                  setStreamed(true);
                  const snapshot = replyText;
                  setAssistant({ content: snapshot });
                } else if (ev.type === 'status' && typeof ev.text === 'string') {
                  setStatusText(ev.text);
                } else if (ev.type === 'done') {
                  sawDone = true;
                  const blocks = Array.isArray(ev.blocks) ? (ev.blocks as ChatBlock[]) : [];
                  if (typeof ev.reply === 'string' && ev.reply) {
                    setAssistant({ content: ev.reply, blocks });
                  } else {
                    setAssistant({ blocks });
                  }
                  setStatusText(null);
                } else if (ev.type === 'error') {
                  setAssistant({ content: typeof ev.error === 'string' ? ev.error : 'Sorry, I had trouble responding. Please try again.' });
                  setStatusText(null);
                }
              } catch {
                // Ignore a malformed event — the stream continues.
              }
            }
            boundary = buffer.indexOf('\n\n');
          }
        }
        if (!sawDone && !replyText) {
          setAssistant({ content: 'Sorry, I had trouble responding. Please try again.' });
        }
      } else {
        // Non-SSE (rate limit / no-key / error JSON) — same as before A9.
        const data = await res.json().catch(() => ({}));
        const reply = (res.ok && typeof data.reply === 'string' && data.reply)
          || (typeof data.error === 'string' && data.error)
          || 'Sorry, I had trouble responding. Please try again.';
        // A3: blocks are server-computed ground truth — render them even on
        // an error reply, so a pricing question still gets the true price
        // when the model is down.
        const blocks = Array.isArray(data.blocks) ? (data.blocks as ChatBlock[]) : [];
        setAssistant({ content: reply, blocks });
      }
    } catch {
      setAssistant({ content: 'Sorry, I\'m having trouble connecting. Email hello@rankall.io' });
    }
    setLoading(false);
    setStatusText(null);
  }

  // Hidden on the fullscreen demo tour so it can't overlay the player controls.
  if (pathname === '/demo' || pathname.startsWith('/r/')) return null;

  return (
    <>
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; } 50% { opacity: 0.4; }
        }
      `}</style>

      {/* Pill trigger */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 500,
            display: 'flex', alignItems: 'center', gap: 8,
            background: C.navy, border: 'none', borderRadius: 100,
            padding: '10px 18px 10px 14px',
            boxShadow: '0 4px 20px rgba(0,0,0.18)',
            cursor: 'pointer', fontFamily: 'inherit',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(0,0,0.22)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0.18)'; }}
        >
          <div style={{ position: 'relative', width: 20, height: 20 }}>
            <span style={{ fontSize: 18, lineHeight: 1, display: 'inline-flex' }}><svg viewBox="0 0 512 512" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M512 240c0 114.9-114.6 208-256 208c-37.1 0-72.3-6.4-104.1-17.9c-11.9 8.7-31.3 20.6-54.3 30.6C73.6 471.1 44.7 480 16 480c-6.5 0-12.3-3.9-14.8-9.9c-2.5-6-1.1-12.8 3.4-17.4c0 0 0 0 0 0s0 0 0 0s0 0 0 0c0 0 0 0 0 0l.3-.3c.3-.3 .7-.7 1.3-1.4c1.1-1.2 2.8-3.1 4.9-5.7c4.1-5 9.6-12.4 15.2-21.6c10-16.6 19.5-38.4 21.4-62.9C17.7 326.8 0 285.1 0 240C0 125.1 114.6 32 256 32s256 93.1 256 208z"/></svg></span>
            <div style={{ position: 'absolute', top: -1, right: -1, width: 7, height: 7, borderRadius: '50%', background: C.green, border: '1.5px solid ' + C.navy, animation: 'blink 2s infinite' }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>Ask Alina</span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 500,
          width: 380, maxWidth: 'calc(100vw - 32px)',
          height: 480, maxHeight: 'calc(100vh - 48px)',
          background: C.bg, border: `1.5px solid ${C.border}`,
          borderRadius: 16, display: 'flex', flexDirection: 'column',
          overflow: 'hidden', boxShadow: '0 16px 48px rgba(0,0,0.14)',
          animation: 'slideUp 0.2s ease',
        }}>

          {/* Header */}
          <div style={{
            padding: '12px 16px', borderBottom: `1px solid ${C.border}`,
            display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
            background: C.bg,
          }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: C.surface, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}><svg viewBox="0 0 640 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M320 0c17.7 0 32 14.3 32 32l0 64 120 0c39.8 0 72 32.2 72 72l0 272c0 39.8-32.2 72-72 72l-304 0c-39.8 0-72-32.2-72-72l0-272c0-39.8 32.2-72 72-72l120 0 0-64c0-17.7 14.3-32 32-32zM208 384c-8.8 0-16 7.2-16 16s7.2 16 16 16l32 0c8.8 0 16-7.2 16-16s-7.2-16-16-16l-32 0zm96 0c-8.8 0-16 7.2-16 16s7.2 16 16 16l32 0c8.8 0 16-7.2 16-16s-7.2-16-16-16l-32 0zm96 0c-8.8 0-16 7.2-16 16s7.2 16 16 16l32 0c8.8 0 16-7.2 16-16s-7.2-16-16-16l-32 0zM264 256a40 40 0 1 0 -80 0 40 40 0 0 80 0zm152 40a40 40 0 1 0 0-80 40 40 0 1 0 0 80zM48 224l16 0 0 192-16 0c-26.5 0-48-21.5-48-48l0-96c0-26.5 21.5-48 48-48zm544 0c26.5 0 48 21.5 48 48l0 96c0 26.5 21.5-48 48-48l-16 0 0-192 16 0z"/></svg></div>
              <div style={{ position: 'absolute', bottom: 0, right: 0, width: 9, height: 9, borderRadius: '50%', background: C.green, border: `2px solid ${C.bg}` }} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: C.navy, lineHeight: 1 }}>Alina · AI Assistant</p>
              <p style={{ fontSize: 11, color: C.green, fontWeight: 600, marginTop: 2 }}>● Online</p>
            </div>
            {/* A9: visible Clear chat — wipes messages + storage + session. */}
            <button
              onClick={clearChat}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 8px', borderRadius: 6, color: C.gray, fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}
              onMouseEnter={e => { e.currentTarget.style.background = C.surface; e.currentTarget.style.color = C.navy; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = C.gray; }}
            >
              Clear chat
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, borderRadius: 6, color: C.lgray, fontSize: 16, lineHeight: 1, fontFamily: 'inherit' }}
              onMouseEnter={e => { e.currentTarget.style.background = C.surface; e.currentTarget.style.color = C.navy; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = C.lgray; }}
            >
              <svg viewBox="0 0 384 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 12.5 32.8 0 45.3s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.map((m) => (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '80%',
                  background: m.role === 'user' ? C.userMsg : C.asstMsg,
                  borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  padding: '9px 13px',
                  fontSize: 13, color: m.role === 'user' ? '#fff' : C.navy,
                  lineHeight: 1.6, whiteSpace: 'pre-wrap',
                }}>
                  {m.role === 'assistant' ? <AlinaMessage text={m.content} /> : m.content}
                </div>
                {/* A3/A4: structured blocks under the assistant's text. */}
                {m.blocks?.map((b, bi) => (
                  <div key={bi} style={{ width: '100%' }}>
                    {b.kind === 'pricing' ? (
                      <PricingCard block={b} />
                    ) : b.kind === 'scan' ? (
                      <ScanCard block={b} />
                    ) : b.kind === 'fix_plan' ? (
                      <FixPlanCard block={b} />
                    ) : b.kind === 'draft' ? (
                      <DraftCard block={b} />
                    ) : b.kind === 'verification' ? (
                      <VerificationCard block={b} />
                    ) : (
                      <LeadForm block={b} sessionId={sessionId} page={pathname} />
                    )}
                  </div>
                ))}
              </div>
            ))}

            {/* A9: typing dots only until the first streamed token. */}
            {loading && !streamed && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ background: C.asstMsg, borderRadius: '16px 16px 16px 4px', padding: '10px 14px', display: 'flex', gap: 4, alignItems: 'center' }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: C.lgray, animation: `blink 1.2s ${i * 0.2}s infinite` }} />
                  ))}
                </div>
              </div>
            )}
            {statusText && (
              <div style={{ fontSize: 12, color: C.gray, fontStyle: 'italic', paddingLeft: 4 }}>{statusText}</div>
            )}

            {messages.length === 1 && !loading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 4 }}>
                {chips.map(q => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 12px', fontSize: 12, color: C.gray, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', transition: 'all 0.12s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = C.blue; e.currentTarget.style.color = C.navy; e.currentTarget.style.background = '#EFF6FF'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.gray; e.currentTarget.style.background = C.surface; }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '10px 12px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, flexShrink: 0, background: C.bg }}>
            <input aria-label="Type your message"
              maxLength={CHAT_MAX_MESSAGE_CHARS}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="Message Alina…"
              style={{ flex: 1, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: '9px 13px', fontSize: 13, color: C.navy, outline: 'none', fontFamily: 'inherit' }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              style={{ background: input.trim() && !loading ? C.blue : C.border, border: 'none', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() && !loading ? 'pointer' : 'not-allowed', flexShrink: 0, transition: 'background 0.15s' }}
            >
              <span style={{ fontSize: 14, color: '#fff' }}>↑</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
