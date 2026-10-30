'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase';
import { isAdminUser } from '@/lib/planConfig';

// CONV-05: founder-led closing workflow. Shows claimed-but-not-trialed
// profiles with auto-generated wound summaries. Nandish personalizes and
// sends; status is tracked here.

const BG = '#F6F6FB';
const CARD = '#FFFFFF';
const BORDER = '#E7E7F0';
const NAVY = '#0A0A14';
const GRAY = '#55556A';
const BLUE = '#1B17FF';
const GREEN = '#059669';

interface Candidate {
  user_id: string;
  email: string;
  business_name: string | null;
  scan_id: string | null;
  score: number | null;
  competitor_name: string | null;
  competitor_score: number | null;
  wound_summary: string;
}

const EMAIL_TEMPLATE = (c: Candidate) =>
`Subject: I looked at your AI visibility report — quick thought

Hi,

I'm Nandish, founder of Rankall. I personally looked at your report.

${c.wound_summary}

Want me to walk you through the first fix? It's free, takes about 10 minutes, and you'll see exactly what changes.

Your report: https://rankall-staging.vercel.app/report/${c.scan_id}

— Nandish
Founder, Rankall.io`;

export default function FounderOutreach() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [stats, setStats] = useState({ sent: 0, converted: 0 });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    getBrowserClient().auth.getUser().then(({ data: { user } }) => {
      if (!isAdminUser(user?.email)) { router.replace('/dashboard'); }
      else { setAuthorized(true); }
    });
  }, [router]);

  const load = () => {
    setLoading(true);
    fetch('/api/admin/founder-outreach')
      .then((r) => r.json())
      .then((d) => {
        setCandidates(d.candidates ?? []);
        setStats(d.stats ?? { sent: 0, converted: 0 });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };
  useEffect(() => { if (authorized) load(); }, [authorized]);

  async function mark(c: Candidate, status: string) {
    await fetch('/api/admin/founder-outreach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: c.user_id,
        email: c.email,
        business_name: c.business_name,
        scan_id: c.scan_id,
        wound_summary: c.wound_summary,
        status,
      }),
    });
    setCandidates((prev) => prev.filter((x) => x.user_id !== c.user_id));
    load();
  }

  if (!authorized) return null;

  return (
    <div style={{ minHeight: '100vh', background: BG, padding: 32, fontFamily: 'sans-serif' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: NAVY, margin: '0 0 8px' }}>Founder Outreach</h1>
        <p style={{ color: GRAY, margin: '0 0 24px', fontSize: 14 }}>
          Claimed-but-not-trialed profiles. Personalize the template, send from your email, mark the status here.
          Sunset when volume exceeds your bandwidth.
        </p>

        <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '16px 24px' }}>
            <div style={{ fontSize: 12, color: GRAY }}>Sent</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: NAVY }}>{stats.sent}</div>
          </div>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '16px 24px' }}>
            <div style={{ fontSize: 12, color: GRAY }}>Converted</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: GREEN }}>{stats.converted}</div>
          </div>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '16px 24px' }}>
            <div style={{ fontSize: 12, color: GRAY }}>In queue</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: BLUE }}>{candidates.length}</div>
          </div>
        </div>

        {loading && <p style={{ color: GRAY }}>Loading candidates…</p>}
        {!loading && candidates.length === 0 && (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 32, textAlign: 'center', color: GRAY }}>
            No candidates right now. Check back as more profiles get claimed.
          </div>
        )}

        {candidates.map((c) => (
          <div key={c.user_id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 24, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: NAVY }}>{c.business_name || 'Unknown business'}</div>
                <div style={{ fontSize: 13, color: GRAY }}>{c.email}</div>
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: (c.score ?? 0) >= 50 ? GREEN : '#D97706' }}>
                {c.score ?? '—'}
              </div>
            </div>
            <div style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: GRAY, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Wound summary (auto-generated — personalize it)
              </div>
              <p style={{ fontSize: 14, color: NAVY, margin: 0, lineHeight: 1.6 }}>{c.wound_summary}</p>
            </div>
            {expanded === c.user_id ? (
              <pre style={{ background: NAVY, color: '#E7E7F0', borderRadius: 8, padding: 16, fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: '0 0 12px', fontFamily: 'monospace' }}>
                {EMAIL_TEMPLATE(c)}
              </pre>
            ) : null}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => setExpanded(expanded === c.user_id ? null : c.user_id)}
                style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: NAVY, cursor: 'pointer' }}
              >
                {expanded === c.user_id ? 'Hide template' : 'Show email template'}
              </button>
              <button
                onClick={() => mark(c, 'sent')}
                style={{ background: BLUE, border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer' }}
              >
                Mark sent
              </button>
              <button
                onClick={() => mark(c, 'replied')}
                style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: NAVY, cursor: 'pointer' }}
              >
                Replied
              </button>
              <button
                onClick={() => mark(c, 'converted')}
                style={{ background: GREEN, border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer' }}
              >
                Converted
              </button>
              <button
                onClick={() => mark(c, 'skipped')}
                style={{ background: 'none', border: 'none', padding: '8px 12px', fontSize: 13, color: GRAY, cursor: 'pointer' }}
              >
                Skip
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
