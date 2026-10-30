'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getBrowserClient } from '@/lib/supabase';
import { isBusinessPlan } from '@/lib/planConfig';
import { usePlan } from '@/lib/usePlan';
import { Geist, Geist_Mono } from 'next/font/google';

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

const supabase = getBrowserClient();

const BG     = '#F6F6FB';
const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#E7E7F0';
const GRAY   = '#55556A';
const LGRAY  = '#94A3B8';
const BLUE   = '#1B17FF';
const GREEN  = '#12A150';
const AMBER  = '#D97706';
const RED    = '#B4232A';
const PURPLE = '#7C3AED';

type Lead = {
  id: string;
  user_id: string;
  business_name: string;
  contact_name: string | null;
  linkedin_url: string | null;
  industry: string | null;
  city: string | null;
  score: number | null;
  scan_id: string | null;
  video_url: string | null;
  report_url: string | null;
  connection_message: string | null;
  followup_message_1: string | null;
  followup_message_2: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  pending:        { label: 'Pending',        bg: '#F1F5F9', color: GRAY  },
  message_sent:   { label: 'Sent',           bg: '#ECEBFF', color: BLUE  },
  connected:      { label: 'Connected',      bg: '#F5F3FF', color: PURPLE },
  replied:        { label: 'Replied',        bg: '#ECFDF5', color: GREEN },
  converted:      { label: 'Converted',      bg: '#ECFDF5', color: GREEN },
  not_interested: { label: 'Not Interested', bg: '#FEF2F2', color: RED   },
  no_response:    { label: 'No Response',    bg: '#FFFBEB', color: AMBER },
};

const TABS: { key: string; label: string; match: string[] }[] = [
  { key: 'all',            label: 'All',            match: [] },
  { key: 'pending',        label: 'Pending',        match: ['pending'] },
  { key: 'sent',           label: 'Sent',           match: ['message_sent'] },
  { key: 'connected',      label: 'Connected',      match: ['connected'] },
  { key: 'replied',        label: 'Replied',        match: ['replied', 'converted'] },
  { key: 'not_interested', label: 'Not Interested', match: ['not_interested'] },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch { /* clipboard unavailable */ }
      }}
      style={{ background: copied ? '#ECFDF5' : W, color: copied ? GREEN : BLUE, border: `1.5px solid ${copied ? GREEN : BORDER}`, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
    >
      {copied ? (<><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>{' '}Copied!</>) : 'Copy'}
    </button>
  );
}

export default function LinkedInQueuePage() {
  const { plan, rawPlan, loading: planLoading, userId } = usePlan();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [leadError, setLeadError] = useState<string | null>(null);

  async function loadLeads(uid: string) {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('linkedin_queue')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });
      setLeads((data as Lead[]) || []);
    } catch {
      setLeads([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (userId) loadLeads(userId);
  }, [userId]);

  const stats = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return {
      pending:   leads.filter(l => l.status === 'pending').length,
      sent:      leads.filter(l => l.status === 'message_sent').length,
      connected: leads.filter(l => l.status === 'connected').length,
      replied:   leads.filter(l => l.status === 'replied' || l.status === 'converted').length,
      week:      leads.filter(l => new Date(l.created_at).getTime() >= weekAgo).length,
    };
  }, [leads]);

  const filtered = useMemo(() => {
    const t = TABS.find(x => x.key === tab);
    if (!t || t.match.length === 0) return leads;
    return leads.filter(l => t.match.includes(l.status));
  }, [leads, tab]);

  async function updateStatus(id: string, status?: string, notes?: string) {
    if (!userId) return;
    setLeadError(null);
    try {
      const res = await fetch('/api/linkedin/update-status', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, userId, status, notes }),
      });
      const data = await res.json().catch(() => ({}));
      // Only apply the local update once the server confirms the write —
      // otherwise the UI shows a status the database does not have.
      if (!res.ok || data.error) {
        setLeadError(data.error || 'Could not save that change. Please try again.');
        return;
      }
      setLeads(prev => prev.map(l => l.id === id ? {
        ...l,
        ...(status !== undefined ? { status } : {}),
        ...(notes !== undefined ? { notes } : {}),
      } : l));
    } catch {
      setLeadError('Could not save that change. Please check your connection and try again.');
    }
  }

  async function generateMessages(lead: Lead) {
    setGenerating(lead.id);
    setLeadError(null);
    try {
      const res = await fetch('/api/linkedin/generate-messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessName: lead.business_name,
          contactName:  lead.contact_name || '',
          industry:     lead.industry || '',
          city:         lead.city || '',
          score:        lead.score || 0,
          reportUrl:    lead.report_url || (lead.scan_id ? `/report/${lead.scan_id}` : 'https://rankall.io'),
          videoUrl:     lead.video_url || 'https://rankall.io',
          queueId:      lead.id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.connection_message) {
        setLeadError(data.message || data.error || 'Could not generate messages. Please try again.');
      } else {
        setLeads(prev => prev.map(l => l.id === lead.id ? {
          ...l,
          connection_message: data.connection_message,
          followup_message_1: data.followup_message_1,
          followup_message_2: data.followup_message_2,
        } : l));
      }
    } catch {
      setLeadError('Could not generate messages. Please check your connection and try again.');
    }
    setGenerating(null);
  }

  async function removeLead(id: string) {
    if (!userId) return;
    if (!confirm('Remove this lead from your queue?')) return;
    setLeadError(null);
    try {
      const { error } = await supabase.from('linkedin_queue').delete().eq('id', id).eq('user_id', userId);
      if (error) {
        setLeadError('Could not remove that lead. Please try again.');
        return;
      }
      setLeads(prev => prev.filter(l => l.id !== id));
    } catch {
      setLeadError('Could not remove that lead. Please check your connection and try again.');
    }
  }

  async function addLead(form: {
    business_name: string; contact_name: string; linkedin_url: string;
    industry: string; city: string; score: string; scan_id: string;
  }) {
    if (!userId) return;
    const row: Record<string, unknown> = {
      user_id: userId,
      business_name: form.business_name.trim(),
      contact_name: form.contact_name.trim() || null,
      linkedin_url: form.linkedin_url.trim() || null,
      industry: form.industry.trim() || null,
      city: form.city.trim() || null,
      score: form.score.trim() ? Number(form.score) : null,
      scan_id: form.scan_id.trim() || null,
      status: 'pending',
    };
    if (form.scan_id.trim()) row.report_url = `/report/${form.scan_id.trim()}`;
    setLeadError(null);
    try {
      const { error } = await supabase.from('linkedin_queue').insert(row);
      if (error) {
        setLeadError('Could not add that lead. Please try again.');
        return;
      }
      setShowModal(false);
      await loadLeads(userId);
    } catch {
      setLeadError('Could not add that lead. Please check your connection and try again.');
    }
  }

  // ── Plan gate ──
  if (planLoading) {
    return <div style={{ padding: 40, color: GRAY, fontFamily: 'system-ui, sans-serif' }}>Loading…</div>;
  }

  // b89x: sign-in gate BEFORE the plan gate. Logged-out visitors have
  // no plan at all — they previously got the Business-plan card (a
  // plan message for a login problem), while the admin test account
  // (plan resolves to enterprise) saw the full queue, making the gate
  // look inconsistent. Order now: signed out -> sign in; signed-in
  // Free -> the plan gate below; admin -> queue + the Admin view note.
  if (!userId) {
    return (
      <div style={{ minHeight: '100vh', background: BG, padding: '60px 24px', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ maxWidth: 520, margin: '0 auto', background: W, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 40, textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 10 }}>LinkedIn Outreach Queue</h1>
          <p style={{ color: GRAY, fontSize: 15, marginBottom: 24, lineHeight: 1.5 }}>
            Sign in to use the LinkedIn Outreach Queue.
          </p>
          <Link href="/login?next=/dashboard/linkedin" style={{ display: 'inline-block', background: PURPLE, color: '#fff', borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (!isBusinessPlan(plan)) {
    return (
      <div className={`${geistSans.variable} ${geistMono.variable}`} style={{ minHeight: '100vh', background: BG, padding: '60px 24px', fontFamily: 'var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif' }}>
        <div style={{ maxWidth: 520, margin: '0 auto', background: W, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}><svg viewBox="0 0 512 512" width="40" height="40" fill="currentColor" aria-hidden="true"><path d="M184 48l144 0c4.4 0 8 3.6 8 8l0 40L176 96l0-40c0-4.4 3.6-8 8-8zm-56 8l0 40L64 96C28.7 96 0 124.7 0 160l0 96 192 0 128 0 192 0 0-96c0-35.3-28.7-64-64-64l-64 0 0-40c0-30.9-25.1-56-56-56L184 0c-30.9 0-56 25.1-56 56zM512 288l-192 0 0 32c0 17.7-14.3 32-32 32l-64 0c-17.7 0-32-14.3-32-32l0-32L0 288 0 416c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-128z"/></svg></div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 10 }}>LinkedIn Outreach Queue</h1>
          <p style={{ color: GRAY, fontSize: 15, marginBottom: 24, lineHeight: 1.5 }}>
            LinkedIn Queue is available on Business plan and above.
          </p>
          <Link href="/pricing" style={{ display: 'inline-block', background: PURPLE, color: '#fff', borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
            Upgrade <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`${geistSans.variable} ${geistMono.variable}`} style={{ minHeight: '100vh', background: BG, padding: '32px 24px', fontFamily: 'var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif' }}>
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .dash-card { animation: fadeInUp 0.5s ease both; transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .dash-card:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(27,23,255,0.15); }
        .card{background:#fff;border:1px solid #E7E7F0;border-radius:16px;padding:22px;min-width:0}
        .lbl{font-family:var(--font-geist-mono),monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#5F5F78}
        .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 18px;border-radius:12px;font-family:inherit;font-weight:600;font-size:14px;border:0;cursor:pointer;white-space:nowrap;text-decoration:none}
        .btn-blue{background:#1B17FF;color:#fff}.btn-blue:hover{background:#1310C4;color:#fff}
        .btn-line{background:#fff;color:#0A0A14;border:1.5px solid #E7E7F0}.btn-line:hover{border-color:#1B17FF;color:#1B17FF}
        .btn-ghost{background:transparent;color:#55556A}
        .pagehead{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}
        @media (max-width:639px){
          .pagehead{flex-direction:column;align-items:stretch}
          .card{padding:18px}
        }
        @media (prefers-reduced-motion:reduce){*{animation:none!important}}
      `}</style>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>

        {/* Header */}
        <header className="pagehead" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.035em', color: NAVY, margin: 0 }}>LinkedIn Outreach Queue</h1>
            <p style={{ color: GRAY, fontSize: 14, margin: 0 }}>Manual workflow — safe and effective</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="btn btn-blue"
          >
            + Add LinkedIn Lead
          </button>
        </header>

        {/* b89x: admins resolve to an upgraded plan in usePlan — label
            the bypass, or the page reads as "Free gets the queue" when
            a real signed-in Free account is gated above. */}
        {plan !== rawPlan && (
          <p style={{ fontSize: 12, color: GRAY, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 14px', margin: '0 0 20px' }}>
            Admin view: your account plan is {rawPlan} — signed-in accounts on that plan see the Business-plan gate for this page.
          </p>
        )}

        {/* Stats bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Pending',   value: stats.pending,   color: GRAY },
            { label: 'Sent',      value: stats.sent,      color: BLUE },
            { label: 'Connected', value: stats.connected, color: PURPLE },
            { label: 'Replied',   value: stats.replied,   color: GREEN },
            { label: 'This Week', value: stats.week,      color: NAVY },
          ].map(s => (
            <div key={s.label} className="card dash-card" style={{ background: W, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontSize: 26, fontWeight: 900, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: LGRAY, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {TABS.map(t => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{ background: active ? NAVY : W, color: active ? '#fff' : GRAY, border: `1.5px solid ${active ? NAVY : BORDER}`, borderRadius: 100, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Lead list */}
        {leadError && (
          <p style={{ fontSize: 13, color: '#DC2626', background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 10, padding: '10px 14px', margin: '0 0 16px' }}>{leadError}</p>
        )}
        {loading ? (
          <p style={{ color: GRAY, fontSize: 14 }}>Loading leads…</p>
        ) : filtered.length === 0 ? (
          <div className="card dash-card" style={{ background: W, border: `1px dashed ${BORDER}`, borderRadius: 14, padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}><svg viewBox="0 0 512 512" width="32" height="32" fill="currentColor" aria-hidden="true"><path d="M121 32C91.6 32 66 52 58.9 80.5L1.9 308.4C.6 313.5 0 318.7 0 323.9L0 416c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-92.1c0-5.2-.6-10.4-1.9-15.5l-57-227.9C446 52 420.4 32 391 32L121 32zm0 64l270 0 48 192-51.2 0c-12.1 0-23.2 6.8-28.6 17.7l-14.3 28.6c-5.4 10.8-16.5 17.7-28.6 17.7l-120.4 0c-12.1 0-23.2-6.8-28.6-17.7l-14.3-28.6c-5.4-10.8-16.5-17.7-28.6-17.7L73 288 121 96z"/></svg></div>
            <p style={{ color: GRAY, fontSize: 15, fontWeight: 600 }}>No leads yet — add your first LinkedIn lead</p>
          </div>
        ) : (
          filtered.map(lead => (
            <LeadCard
              key={lead.id}
              lead={lead}
              generating={generating === lead.id}
              onGenerate={() => generateMessages(lead)}
              onStatus={(s) => updateStatus(lead.id, s)}
              onNotes={(n) => updateStatus(lead.id, undefined, n)}
              onRemove={() => removeLead(lead.id)}
            />
          ))
        )}

        {/* Cadence guidance */}
        <div style={{ background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 14, padding: '20px 22px', marginTop: 28 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: '#6D28D9', margin: '0 0 4px' }}>LinkedIn Best Practices</h3>
          <p style={{ fontSize: 12, color: GRAY, margin: '0 0 12px' }}>General guidance — not measured from your account.</p>
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
            <li style={{ fontSize: 13, color: NAVY }}><svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M128 0c17.7 0 32 14.3 32 32l0 32 128 0 0-32c0-17.7 14.3-32 32-32s32 14.3 32 32l0 32 48 0c26.5 0 48 21.5 48 48l0 48L0 160l0-48C0 85.5 21.5 64 48 64l48 0 0-32c0-17.7 14.3-32 32-32zM0 192l448 0 0 272c0 26.5-21.5 48-48 48L48 512c-26.5 0-48-21.5-48-48L0 192zm64 80l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0c-8.8 0-16 7.2-16 16zm128 0l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0c-8.8 0-16 7.2-16 16zm144-16c-8.8 0-16 7.2-16 16l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0zM64 400l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0c-8.8 0-16 7.2-16 16zm144-16c-8.8 0-16 7.2-16 16l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0zm112 16l0 32c0 8.8 7.2 16 16 16l32 0c8.8 0 16-7.2 16-16l0-32c0-8.8-7.2-16-16-16l-32 0c-8.8 0-16 7.2-16 16z"/></svg> 10-15 connection requests/day</li>
            <li style={{ fontSize: 13, color: NAVY }}><svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M256 0a256 256 0 1 1 0 512A256 256 0 1 1 256 0zM232 120l0 136c0 8 4 15.5 10.7 20l96 64c11 7.4 25.9 4.4 33.3-6.7s4.4-25.9-6.7-33.3L280 243.2 280 120c0-13.3-10.7-24-24-24s-24 10.7-24 24z"/></svg> space 30 min apart</li>
            <li style={{ fontSize: 13, color: NAVY }}><svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M256 0a256 256 0 1 1 0 512A256 256 0 1 1 256 0zM232 120l0 136c0 8 4 15.5 10.7 20l96 64c11 7.4 25.9 4.4 33.3-6.7s4.4-25.9-6.7-33.3L280 243.2 280 120c0-13.3-10.7-24-24-24s-24 10.7-24 24z"/></svg> Tue-Thu 8-10am &amp; 5-6pm</li>
            <li style={{ fontSize: 13, color: NAVY }}><svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg> always personalize</li>
            <li style={{ fontSize: 13, color: NAVY }}><svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M367.2 412.5L99.5 144.8C77.1 176.1 64 214.5 64 256c0 106 86 192 192 192c41.5 0 79.9-13.1 111.2-35.5zm45.3-45.3C434.9 335.9 448 297.5 448 256c0-106-86-192-192-192c-41.5 0-79.9 13.1-111.2 35.5L412.5 367.2zM0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256z"/></svg> never mention AI or automation</li>
            <li style={{ fontSize: 13, color: NAVY }}><svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M32 32c17.7 0 32 14.3 32 32l0 336c0 8.8 7.2 16 16 16l400 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L80 480c-44.2 0-80-35.8-80-80L0 64C0 46.3 14.3 32 32 32zM160 224c17.7 0 32 14.3 32 32l0 64c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32zm128-64l0 160c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-160c0-17.7 14.3-32 32-32s32 14.3 32 32zm64 32c17.7 0 32 14.3 32 32l0 96c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-96c0-17.7 14.3-32 32-32zM480 96l0 224c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-224c0-17.7 14.3-32 32-32s32 14.3 32 32z"/></svg> aim for 30%+ connection rate</li>
          </ul>
        </div>
      </div>

      {showModal && <AddLeadModal onClose={() => setShowModal(false)} onSave={addLead} />}
    </div>
  );
}

function LeadCard({ lead, generating, onGenerate, onStatus, onNotes, onRemove }: {
  lead: Lead;
  generating: boolean;
  onGenerate: () => void;
  onStatus: (status: string) => void;
  onNotes: (notes: string) => void;
  onRemove: () => void;
}) {
  const [notes, setNotes] = useState(lead.notes || '');
  const badge = STATUS_META[lead.status] || STATUS_META.pending;
  const hasMessages = !!lead.connection_message;
  const reportLink = lead.report_url || (lead.scan_id ? `/report/${lead.scan_id}` : null);

  return (
    <div className="card dash-card" style={{ background: W, border: `1px solid ${BORDER}`, borderRadius: 14, padding: 20, marginBottom: 14 }}>
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, color: LGRAY, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{lead.industry || 'Lead'}</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: NAVY, marginTop: 2 }}>
            {lead.linkedin_url
              ? <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ color: NAVY, textDecoration: 'none' }}>{lead.business_name}</a>
              : lead.business_name}
          </div>
          <div style={{ fontSize: 13, color: GRAY, marginTop: 2 }}>
            {[lead.contact_name, lead.city].filter(Boolean).join(' · ') || '—'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {lead.score != null && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: BLUE }}>{lead.score}</div>
              <div style={{ fontSize: 10, color: LGRAY, fontWeight: 700 }}>AI SCORE</div>
            </div>
          )}
          <span style={{ background: badge.bg, color: badge.color, borderRadius: 100, padding: '4px 12px', fontSize: 12, fontWeight: 700 }}>{badge.label}</span>
        </div>
      </div>

      {/* Links row */}
      {(reportLink || lead.video_url) && (
        <div style={{ display: 'flex', gap: 14, marginTop: 12 }}>
          {reportLink && <a href={reportLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>View Report <svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M320 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l82.7 0L201.4 265.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L448 109.3l0 82.7c0 17.7 14.3 32 32 32s32-14.3 32-32l0-160c0-17.7-14.3-32-32-32L320 0zM80 32C35.8 32 0 67.8 0 112L0 432c0 44.2 35.8 80 80 80l320 0c44.2 0 80-35.8 80-80l0-112c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 112c0 8.8-7.2 16-16 16L80 448c-8.8 0-16-7.2-16-16l0-320c0-8.8 7.2-16 16-16l112 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L80 32z"/></svg></a>}
          {lead.video_url && <a href={lead.video_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: BLUE, fontWeight: 600, textDecoration: 'none' }}>Video <svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M320 0c-17.7 0-32 14.3-32 32s14.3 32 32 32l82.7 0L201.4 265.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L448 109.3l0 82.7c0 17.7 14.3 32 32 32s32-14.3 32-32l0-160c0-17.7-14.3-32-32-32L320 0zM80 32C35.8 32 0 67.8 0 112L0 432c0 44.2 35.8 80 80 80l320 0c44.2 0 80-35.8 80-80l0-112c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 112c0 8.8-7.2 16-16 16L80 448c-8.8 0-16-7.2-16-16l0-320c0-8.8 7.2-16 16-16l112 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L80 32z"/></svg></a>}
        </div>
      )}

      {/* Generate / messages */}
      <div style={{ marginTop: 16 }}>
        {!hasMessages ? (
          <button
            onClick={onGenerate}
            disabled={generating}
            style={{ background: PURPLE, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: generating ? 'default' : 'pointer', opacity: generating ? 0.7 : 1 }}
          >
            {generating ? 'Generating…' : (<><svg viewBox="0 0 576 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M234.7 42.7L197 56.8c-3 1.1-5 4-5 7.2s2 6.1 5 7.2l37.7 14.1L248.8 123c1.1 3 4 5 7.2 5s6.1-2 7.2-5l14.1-37.7L315 71.2c3-1.1 5-4 5-7.2s-2-6.1-5-7.2L277.3 42.7 263.2 5c-1.1-3-4-5-7.2-5s-6.1 2-7.2 5L234.7 42.7zM46.1 395.4c-18.7 18.7-18.7 49.1 0 67.9l34.6 34.6c18.7 18.7 49.1 18.7 67.9 0L529.9 116.5c18.7-18.7 18.7-49.1 0-67.9L495.3 14.1c-18.7-18.7-49.1-18.7-67.9 0L46.1 395.4zM484.6 82.6l-105 105-23.3-23.3 105-105 23.3 23.3zM7.5 117.2C3 118.9 0 123.2 0 128s3 9.1 7.5 10.8L64 160l21.2 56.5c1.7 4.5 6 7.5 10.8 7.5s9.1-3 10.8-7.5L128 160l56.5-21.2c4.5-1.7 7.5-6 7.5-10.8s-3-9.1-7.5-10.8L128 96 106.8 39.5C105.1 35 100.8 32 96 32s-9.1 3-10.8 7.5L64 96 7.5 117.2zm352 256c-4.5 1.7-7.5 6-7.5 10.8s3 9.1 7.5 10.8L416 416l21.2 56.5c1.7 4.5 6 7.5 10.8 7.5s9.1-3 10.8-7.5L480 416l56.5-21.2c4.5-1.7 7.5-6 7.5-10.8s-3-9.1-7.5-10.8L480 352l-21.2-56.5c-1.7-4.5-6-7.5-10.8-7.5s-9.1 3-10.8 7.5L416 352l-56.5 21.2z"/></svg>{' '}Generate Messages</>)}
          </button>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            <MessageBlock
              title="CONNECTION MESSAGE"
              hint="under 300 chars"
              body={lead.connection_message || ''}
              actionLabel="Mark Sent"
              onAction={() => onStatus('message_sent')}
            />
            <MessageBlock
              title="FOLLOW-UP 1 (after connect)"
              body={lead.followup_message_1 || ''}
              actionLabel="Mark Connected"
              onAction={() => onStatus('connected')}
            />
            <MessageBlock
              title="FOLLOW-UP 2 (if no reply)"
              body={lead.followup_message_2 || ''}
              actionLabel="Mark Replied"
              onAction={() => onStatus('replied')}
            />
            {(lead.status === 'replied' || lead.status === 'converted') && (
              <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: GREEN, fontWeight: 600 }}>
                <svg viewBox="0 0 512 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M190.5 68.8L225.3 128l-1.3 0-72 0c-22.1 0-40-17.9-40-40s17.9-40 40-40l2.2 0c14.9 0 28.8 7.9 36.3 20.8zM64 88c0 14.4 3.5 28 9.6 40L32 128c-17.7 0-32 14.3-32 32l0 64c0 17.7 14.3 32 32 32l448 0c17.7 0 32-14.3 32-32l0-64c0-17.7-14.3-32-32-32l-41.6 0c6.1-12 9.6-25.6 9.6-40c0-48.6-39.4-88-88-88l-2.2 0c-31.9 0-61.5 16.9-77.7 44.4L256 85.5l-24.1-41C215.7 16.9 186.1 0 154.2 0L152 0C103.4 0 64 39.4 64 88zm336 0c0 22.1-17.9 40-40 40l-72 0-1.3 0 34.8-59.2C329.1 55.9 342.9 48 357.8 48l2.2 0c22.1 0 40 17.9 40 40zM32 288l0 176c0 26.5 21.5 48 48 48l144 0 0-224L32 288zM288 512l144 0c26.5 0 48-21.5 48-48l0-176-192 0 0 224z"/></svg> Great! Follow up with a calendar link
              </div>
            )}
          </div>
        )}
      </div>

      {/* Notes */}
      <div style={{ marginTop: 16 }}>
        <input
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={() => { if (notes !== (lead.notes || '')) onNotes(notes); }}
          placeholder="Notes…"
          style={{ width: '100%', boxSizing: 'border-box', border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '9px 12px', fontSize: 13, color: NAVY }}
        />
      </div>

      {/* Footer actions */}
      <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
        <button onClick={() => onStatus('not_interested')} style={{ background: 'none', border: 'none', color: GRAY, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>Mark Not Interested</button>
        <button onClick={onRemove} style={{ background: 'none', border: 'none', color: RED, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, marginLeft: 'auto' }}>Remove</button>
      </div>
    </div>
  );
}

function MessageBlock({ title, hint, body, actionLabel, onAction }: {
  title: string; hint?: string; body: string; actionLabel: string; onAction: () => void;
}) {
  return (
    <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: NAVY, letterSpacing: '0.05em', marginBottom: 8 }}>
        {title}{hint && <span style={{ color: LGRAY, fontWeight: 600, marginLeft: 6 }}>({hint})</span>}
      </div>
      <div style={{ fontSize: 13, color: NAVY, whiteSpace: 'pre-wrap', lineHeight: 1.5, marginBottom: 10 }}>{body}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <CopyButton text={body} />
        <button onClick={onAction} style={{ background: W, color: NAVY, border: `1.5px solid ${BORDER}`, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{actionLabel}</button>
      </div>
    </div>
  );
}

function AddLeadModal({ onClose, onSave }: {
  onClose: () => void;
  onSave: (form: { business_name: string; contact_name: string; linkedin_url: string; industry: string; city: string; score: string; scan_id: string }) => void;
}) {
  const [form, setForm] = useState({ business_name: '', contact_name: '', linkedin_url: '', industry: '', city: '', score: '', scan_id: '' });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));
  const fieldStyle = { width: '100%', boxSizing: 'border-box' as const, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, color: NAVY, marginTop: 4 };
  const labelStyle = { fontSize: 12, fontWeight: 700, color: GRAY };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15,23,42,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: W, borderRadius: 16, padding: 28, width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: NAVY, margin: '0 0 18px' }}>Add LinkedIn Lead</h2>
        <div style={{ display: 'grid', gap: 12 }}>
          <label style={labelStyle}>Business name *<input value={form.business_name} onChange={set('business_name')} style={fieldStyle} /></label>
          <label style={labelStyle}>Contact name<input value={form.contact_name} onChange={set('contact_name')} style={fieldStyle} /></label>
          <label style={labelStyle}>LinkedIn URL<input value={form.linkedin_url} onChange={set('linkedin_url')} style={fieldStyle} /></label>
          <label style={labelStyle}>Industry<input value={form.industry} onChange={set('industry')} style={fieldStyle} /></label>
          <label style={labelStyle}>City<input value={form.city} onChange={set('city')} style={fieldStyle} /></label>
          <label style={labelStyle}>Score<input type="number" value={form.score} onChange={set('score')} style={fieldStyle} /></label>
          <label style={labelStyle}>Scan ID<input value={form.scan_id} onChange={set('scan_id')} style={fieldStyle} /></label>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button onClick={onClose} style={{ flex: 1, background: W, color: GRAY, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '11px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={() => { if (form.business_name.trim()) onSave(form); }}
            disabled={!form.business_name.trim()}
            style={{ flex: 1, background: form.business_name.trim() ? BLUE : LGRAY, color: '#fff', border: 'none', borderRadius: 10, padding: '11px', fontSize: 14, fontWeight: 700, cursor: form.business_name.trim() ? 'pointer' : 'default' }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
