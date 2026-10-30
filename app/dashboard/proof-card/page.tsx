'use client';
import { useEffect, useState, useRef } from 'react';
import { getBrowserClient } from '@/lib/supabase';
import { fixTypeLabel } from '@/lib/fixIntelligence';
import { Geist, Geist_Mono } from 'next/font/google';
const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });
const supabase = getBrowserClient();

const BG     = '#F6F6FB';
const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#E7E7F0';
const BLUE   = '#1B17FF';
const GREEN  = '#12A150';
const AMBER  = '#D97706';
const GRAY   = '#55556A';
const LGRAY  = '#5F5F78';
const PURPLE = '#7C3AED';
const RED    = '#B4232A';

const SHARED_STYLE = `
@keyframes fadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.card { background: #fff; border: 1.5px solid #E7E7F0; border-radius: 16px; }
.dash-card { box-shadow: 0 1px 4px rgba(0,0,0,0.04); animation: fadeInUp .35s ease both; }
.lbl { font-size: 13px; font-weight: 700; color: #0A0A14; display: block; margin-bottom: 8px; }
.btn { display: inline-block; border: none; border-radius: 10px; padding: 11px 22px; font-size: 14px; font-weight: 700; color: #fff; text-decoration: none; cursor: pointer; font-family: inherit; }
.btn-blue { background: #1B17FF; }
.btn-line { background: #fff; border: 1.5px solid #E7E7F0; color: #0A0A14; }
.btn-ghost { background: transparent; color: #55556A; }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.pagehead { margin-bottom: 28px; }
.pagehead h1 { font-size: 30px; font-weight: 700; color: #0A0A14; margin-bottom: 6px; display: flex; align-items: center; gap: 10px; }
@media (max-width: 639px) { .pagehead h1 { font-size: 24px; } }
@media (prefers-reduced-motion: reduce) { .dash-card { animation: none; } }
`;

interface ScanHistory {
  overall_score: number;
  trust_score: number;
  created_at: string;
  business_input: string;
  scan_id: string | null;
  // Platforms the business was mentioned on at this snapshot (from
  // score_history.platforms_count). Null when unknown — never fall back to
  // the weighted overall_score for a coverage claim.
  platforms_count: number | null;
}

interface Scan {
  id: string;
  input: string;
  user_business_name: string | null;
  competitor_name: string | null;
}

// ax72: a proof card may ONLY come from one of these — a rescan-verified
// outcome the caller owns. First/last score_history is not a verified claim.
interface VerifiedOutcome {
  id: string;
  fix_type: string | null;
  business_name: string | null;
  score_before: number | null;
  score_after: number | null;
  created_at: string | null;
  verified_at: string | null;
  days_to_improvement: number | null;
  scan_id_after: string | null;
  is_public: boolean | null;
}

export default function ProofCardPage() {
  const [history, setHistory] = useState<ScanHistory[]>([]);
  const [latestScan, setLatestScan] = useState<Scan | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [cardSvg, setCardSvg] = useState<string | null>(null);
  const [cardDataUrl, setCardDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [publicToggling, setPublicToggling] = useState(false);
  const [publicError, setPublicError] = useState<string | null>(null);
  const [badgeCopied, setBadgeCopied] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [verifiedOutcomes, setVerifiedOutcomes] = useState<VerifiedOutcome[]>([]);
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<string | null>(null);
  // b8a4: session state for the sign-in gate.
  const [signedIn, setSignedIn] = useState(false);
  const [outcomesError, setOutcomesError] = useState<string | null>(null);
  const [appliedAny, setAppliedAny] = useState(false);
  const svgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      // b8a4: no session used to return silently, leaving `loading` true
      // forever — logged-out visitors stared at "Loading..." with no gate.
      if (!session) { setLoading(false); return; }
      setSignedIn(true);

      const [histRes, scanRes] = await Promise.all([
        // ax8r: score_history's real columns are score / recorded_at /
        // scan_id / platforms_count — the old select (overall_score,
        // trust_score, created_at, business_input) 400'd, so history was
        // always [] and the card could never be generated.
        supabase
          .from('score_history')
          .select('score, recorded_at, scan_id, platforms_count')
          .eq('user_id', session.user.id)
          .order('recorded_at', { ascending: true })
          .limit(30),
        supabase
          .from('rankall_scans')
          .select('id, input, user_business_name, competitor_name')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single(),
      ]);

      // Business name + trust live on rankall_scans (score_history has neither
      // column) — join on scan_id.
      const scanIds = ((histRes.data || []) as any[]).map((r: any) => r.scan_id).filter(Boolean);
      const { data: scanRows } = scanIds.length > 0
        ? await supabase.from('rankall_scans').select('id, input, trust_score, trust_signals').in('id', scanIds)
        : { data: [] as any[] };
      const scanById = new Map(((scanRows || []) as any[]).map((r: any) => [r.id, r]));
      const mapped = ((histRes.data || []) as any[]).map((r: any) => {
        const sc: any = scanById.get(r.scan_id);
        return {
          overall_score: r.score ?? 0,
          trust_score: (typeof sc?.trust_score === 'number' ? sc.trust_score : sc?.trust_signals?.overall) ?? 0,
          created_at: r.recorded_at ?? '',
          business_input: sc?.input ?? '',
          scan_id: r.scan_id ?? null,
          platforms_count: typeof r.platforms_count === 'number' ? r.platforms_count : null,
        } as ScanHistory;
      });
      setHistory(mapped);
      setLatestScan(scanRes.data || null);
      // ax72: the only valid proof-card source — verified outcomes.
      try {
        const ocRes = await fetch('/api/outcomes/verified');
        const ocData = await ocRes.json().catch(() => ({}));
        if (ocRes.ok && Array.isArray(ocData.outcomes)) {
          setVerifiedOutcomes(ocData.outcomes);
          if (ocData.outcomes.length > 0) setSelectedOutcomeId(ocData.outcomes[0].id);
        } else {
          setOutcomesError('Could not load your verified improvements.');
        }
      } catch {
        setOutcomesError('Could not load your verified improvements.');
      }
      // "Apply top fix" step: any fix applied / verified / verifying across
      // the user's history scans (not just the latest scan).
      if (scanIds.length > 0) {
        const { data: appliedRows } = await supabase
          .from('fix_predictions')
          .select('id')
          .in('scan_id', scanIds)
          .in('status', ['applied', 'verified', 'verifying'])
          .limit(1);
        setAppliedAny((appliedRows || []).length > 0);
      }
      setLoading(false);
    }
    load();
  }, []);

  const first = history[0];
  const hasTwoScans = history.length >= 2;
  // Score delta between the two most recent scans (history is ordered
  // oldest-first). NaN when there is no "between" yet — the zero-delta
  // banner only makes sense with two scans.
  const delta = hasTwoScans
    ? history[history.length - 1].overall_score - history[history.length - 2].overall_score
    : NaN;
  // b8a4: the selected verified outcome is the ONLY source of proof
  // stats (ax72's doctrine). Moved up: businessName + the stats row
  // derive from it, never from first/last history rows.
  const selectedOutcome = verifiedOutcomes.find(o => o.id === selectedOutcomeId) ?? null;
  const businessName = selectedOutcome?.business_name || latestScan?.user_business_name || latestScan?.input || first?.business_input || 'Your Business';

  async function generateCard() {
    setGenerating(true);
    setGenerateError(null);
    try {
      // ax72: the server builds the card from the verified outcome — the
      // client never sends scores (the old route trusted arbitrary numbers).
      const res = await fetch('/api/proof-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verifiedOutcomeId: selectedOutcomeId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setGenerateError(data.error || 'Could not generate the proof card. Please try again.');
      } else {
        setCardSvg(data.svg);
        setCardDataUrl(data.dataUrl);
      }
    } catch {
      setGenerateError('Could not generate the proof card. Please check your connection and try again.');
    }
    setGenerating(false);
  }

  function downloadCard() {
    if (!cardSvg) return;
    const blob = new Blob([cardSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rankall-proof-${businessName.replace(/\s+/g, '-').toLowerCase()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyShareLink() {
    const url = `${window.location.origin}/report/${latestScan?.id || ''}`;
    setCopyError(null);
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      setCopyError('Copy failed — your browser blocked clipboard access. Select the link and copy it manually.');
    });
  }


  // STD-03: publish permission — the owner makes a verified outcome public.
  // Only verified outcomes can go public (enforced server-side too).
  async function togglePublic(next: boolean) {
    if (!selectedOutcome) return;
    setPublicToggling(true);
    setPublicError(null);
    try {
      const res = await fetch(`/api/verified/${selectedOutcome.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_public: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPublicError(data.error || 'Could not update. Please try again.');
      } else {
        setVerifiedOutcomes(prev => prev.map(o => o.id === selectedOutcome.id ? { ...o, is_public: next } : o));
      }
    } catch {
      setPublicError('Could not update. Please try again.');
    }
    setPublicToggling(false);
  }

  function copyBadgeEmbed() {
    if (!selectedOutcome) return;
    const code = `<a href="https://rankall.io/verified/${selectedOutcome.id}" target="_blank" rel="noopener">\n  <img src="https://rankall.io/api/badge/verified/${selectedOutcome.id}" alt="Verified by Rankall.io" width="320" height="80" />\n</a>`;
    navigator.clipboard.writeText(code).then(() => {
      setBadgeCopied(true);
      setTimeout(() => setBadgeCopied(false), 2000);
    }).catch(() => {
      setPublicError('Copy failed — please copy the code manually.');
    });
  }
  function shareLinkedIn() {
    // ax72: the share text describes the VERIFIED outcome (the card's
    // source), never a first→last history drift of any cause.
    if (!selectedOutcome) return;
    const url = encodeURIComponent(`${window.location.origin}/report/${selectedOutcome.scan_id_after || latestScan?.id || ''}`);
    const oDelta = (selectedOutcome.score_after ?? 0) - (selectedOutcome.score_before ?? 0);
    const oDays = selectedOutcome.days_to_improvement ?? 0;
    const text = encodeURIComponent(`${businessName} just improved AI visibility score by +${oDelta} points in ${oDays} days. Verified by Rankall.io`);
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}&summary=${text}`, '_blank');
  }

  // ax8r: steps 2-4 used to be hardcoded done: false even when the user
  // had applied fixes and rescanned.
  const steps = [
    { label: 'Run first scan', done: history.length >= 1 },
    { label: 'Apply top fix', done: appliedAny },
    { label: 'Verification rescan (7 days after applying)', done: verifiedOutcomes.length > 0 },
    { label: 'Generate proof card', done: cardSvg != null },
  ];

  if (loading) return (
    <div style={{ padding: '48px 32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: GRAY }}>Loading...</p>
    </div>
  );

  // b8a4: signed-out visitors get a sign-in gate instead of an endless
  // "Loading..." (the load used to return early without resolving).
  if (!signedIn) return (
    <div style={{ padding: '32px 32px 64px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '48px 32px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <p style={{ fontSize: 18, fontWeight: 800, color: NAVY, marginBottom: 10 }}>Sign in to view your proof card</p>
        <p style={{ fontSize: 14, color: GRAY, marginBottom: 24, lineHeight: 1.7 }}>
          Proof cards are generated from your own verified improvements — sign in to see yours, or run a free scan to get your first score.
        </p>
        <a href="/login?next=/dashboard/proof-card" style={{ display: 'inline-block', background: BLUE, borderRadius: 10, padding: '13px 28px', fontSize: 14, fontWeight: 700, color: '#fff', textDecoration: 'none' }}>
          Sign in
        </a>
      </div>
    </div>
  );

  return (
    <div className={`${geistSans.variable} ${geistMono.variable}`} style={{ padding: '32px 32px 64px', maxWidth: 900, margin: '0 auto', fontFamily: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif' }}>
      <style>{SHARED_STYLE}</style>
      <div className="pagehead">
        <h1 style={{ fontSize: 30, fontWeight: 700, color: NAVY, marginBottom: 6 }}><svg viewBox="0 0 576 512" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M400 0L176 0c-26.5 0-48.1 21.8-47.1 48.2c.2 5.3 .4 10.6 .7 15.8L24 64C10.7 64 0 74.7 0 88c0 92.6 33.5 157 78.5 200.7c44.3 43.1 98.3 64.8 138.1 75.8c23.4 6.5 39.4 26 39.4 45.6c0 20.9-17 37.9-37.9 37.9L192 448c-17.7 0-32 14.3-32 32s14.3 32 32 32l192 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-26.1 0C337 448 320 431 320 410.1c0-19.6 15.9-39.2 39.4-45.6c39.9-11 93.9-32.7 138.2-75.8C542.5 245 576 180.6 576 88c0-13.3-10.7-24-24-24L446.4 64c.3-5.2 .5-10.4 .7-15.8C448.1 21.8 426.5 0 400 0zM48.9 112l84.4 0c9.1 90.1 29.2 150.3 51.9 190.6c-24.9-11-50.8-26.5-73.2-48.3c-32-31.1-58-76-63-142.3zM464.1 254.3c-22.4 21.8-48.3 37.3-73.2 48.3c22.7-40.3 42.8-100.5 51.9-190.6l84.4 0c-5.1 66.3-31.1 111.2-63 142.3z"/></svg> Proof Card</h1>
        <p style={{ fontSize: 14, color: GRAY }}>Generate a shareable proof of your AI visibility improvement — perfect for LinkedIn and client reports.</p>
      </div>

      {!hasTwoScans ? (
        /* ── SINGLE SCAN STATE ── */
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card dash-card" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '28px 32px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 24 }}>
              <div style={{ width: 44, height: 44, background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}><svg viewBox="0 0 576 512" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M400 0L176 0c-26.5 0-48.1 21.8-47.1 48.2c.2 5.3 .4 10.6 .7 15.8L24 64C10.7 64 0 74.7 0 88c0 92.6 33.5 157 78.5 200.7c44.3 43.1 98.3 64.8 138.1 75.8c23.4 6.5 39.4 26 39.4 45.6c0 20.9-17 37.9-37.9 37.9L192 448c-17.7 0-32 14.3-32 32s14.3 32 32 32l192 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-26.1 0C337 448 320 431 320 410.1c0-19.6 15.9-39.2 39.4-45.6c39.9-11 93.9-32.7 138.2-75.8C542.5 245 576 180.6 576 88c0-13.3-10.7-24-24-24L446.4 64c.3-5.2 .5-10.4 .7-15.8C448.1 21.8 426.5 0 400 0zM48.9 112l84.4 0c9.1 90.1 29.2 150.3 51.9 190.6c-24.9-11-50.8-26.5-73.2-48.3c-32-31.1-58-76-63-142.3zM464.1 254.3c-22.4 21.8-48.3 37.3-73.2 48.3c22.7-40.3 42.8-100.5 51.9-190.6l84.4 0c-5.1 66.3-31.1 111.2-63 142.3z"/></svg></div>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 800, color: NAVY, marginBottom: 4 }}>Your proof card is almost ready</h2>
                <p style={{ fontSize: 13, color: GRAY }}>Apply fixes and your verification rescan 7 days later will generate your before/after proof card.</p>
              </div>
            </div>

            {/* Progress steps */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {steps.map((step, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: step.done ? GREEN : i === steps.findIndex(s => !s.done) ? BLUE : BORDER,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {step.done
                      ? <span style={{ fontSize: 13, color: '#fff', fontWeight: 700 }}><svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg></span>
                      : <span style={{ fontSize: 12, color: step.done ? '#fff' : i === steps.findIndex(s => !s.done) ? '#fff' : GRAY, fontWeight: 700 }}>{i + 1}</span>
                    }
                  </div>
                  <span style={{ fontSize: 14, fontWeight: step.done ? 700 : 500, color: step.done ? GREEN : i === steps.findIndex(s => !s.done) ? NAVY : LGRAY }}>
                    {step.label}
                  </span>
                  {step.done && <span style={{ fontSize: 11, color: GREEN, fontWeight: 600 }}><svg viewBox="0 0 448 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> Done</span>}
                  {!step.done && i === steps.findIndex(s => !s.done) && (
                    <span style={{ fontSize: 11, color: BLUE, background: '#ECEBFF', border: '1px solid #C9C6FF', borderRadius: 100, padding: '2px 8px', fontWeight: 600 }}>Next</span>
                  )}
                </div>
              ))}
            </div>

            <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${BORDER}` }}>
              <a href="/dashboard/fix" className="btn btn-blue" style={{ display: 'inline-block', background: BLUE, borderRadius: 10, padding: '11px 22px', fontSize: 14, fontWeight: 700, color: '#fff', textDecoration: 'none' }}>
                Apply fixes now <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
            </div>
          </div>

          {/* ax72: no invented preview — the old block showed a fake
              +19 / 45-day card for an improvement that never happened. The
              card appears only once a real improvement is verified. */}
        </div>
      ) : (
        /* ── HAS 2+ SCANS ── */
        <div style={{ display: 'grid', gap: 16 }}>

          {/* Stats row — b8a4: these used to pair the FIRST and LAST
              score_history rows (any business, any cause) as a proof
              claim: "84% → 2%, −82 Improvement" — a cross-business
              regression labelled an improvement, in % units, directly
              above the "No verified improvement yet" box it contradicted.
              Per ax72, proof stats come ONLY from the selected verified
              outcome, in /100 units, attributed to its business. */}
          {selectedOutcome && (
            <>
              <p style={{ fontSize: 13, color: GRAY, margin: 0 }}>
                Verified improvement for <strong style={{ color: NAVY }}>{selectedOutcome.business_name || businessName}</strong>
                {selectedOutcome.verified_at ? <> · verified {new Date(selectedOutcome.verified_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</> : null}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                {[
                  { label: 'Before Score', value: `${selectedOutcome.score_before ?? '—'}/100`, color: GRAY },
                  { label: 'After Score',  value: `${selectedOutcome.score_after ?? '—'}/100`,  color: AMBER },
                  { label: 'Improvement',  value: `${((selectedOutcome.score_after ?? 0) - (selectedOutcome.score_before ?? 0)) >= 0 ? '+' : ''}${(selectedOutcome.score_after ?? 0) - (selectedOutcome.score_before ?? 0)} pts`, color: ((selectedOutcome.score_after ?? 0) - (selectedOutcome.score_before ?? 0)) > 0 ? GREEN : GRAY },
                  ...(selectedOutcome.days_to_improvement != null
                    ? [{ label: 'Days to improvement', value: `${selectedOutcome.days_to_improvement}d`, color: BLUE }]
                    : []),
                ].map((s, i) => (
                  <div key={i} style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    <p style={{ fontSize: 26, fontWeight: 900, color: s.color, marginBottom: 4, lineHeight: 1 }}>{s.value}</p>
                    <p style={{ fontSize: 12, color: LGRAY }}>{s.label}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ax72: proof cards come from a verified outcome — never from
              first→last history drift, and never from a self-reported fix. */}
          {outcomesError ? (
            <p style={{ fontSize: 13, color: '#DC2626', background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 10, padding: '10px 14px', margin: 0 }}>{outcomesError}</p>
          ) : verifiedOutcomes.length === 0 ? (
            <div style={{ background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 14, padding: '20px 24px' }}>
              <p style={{ fontSize: 15, fontWeight: 800, color: '#92400E', marginBottom: 6 }}>No verified improvement yet</p>
              <p style={{ fontSize: 14, color: '#78350F', marginBottom: 16, lineHeight: 1.5 }}>
                Your score changed between scans, but no fix has been verified yet. Apply a fix and wait for the verification rescan — the proof card is generated from the verified result, not from any score change.
              </p>
              <a href="/dashboard/fix" className="btn" style={{ background: NAVY, borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 700, color: '#fff', textDecoration: 'none' }}>
                Go to Fix Queue
              </a>
            </div>
          ) : (
            <div className="card dash-card" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <label className="lbl">Verified improvement (shown on the card)</label>
              <select
                value={selectedOutcomeId ?? ''}
                onChange={e => setSelectedOutcomeId(e.target.value || null)}
                style={{ width: '100%', border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px', fontSize: 14, color: NAVY, fontFamily: 'inherit', outline: 'none', background: BG, boxSizing: 'border-box' }}
              >
                {verifiedOutcomes.map(o => (
                  <option key={o.id} value={o.id}>
                    {fixTypeLabel(o.fix_type ?? '')} — {o.score_before} → {o.score_after} (+{(o.score_after ?? 0) - (o.score_before ?? 0)} pts){o.verified_at ? ` · verified ${new Date(o.verified_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* STD-03: verified badge + public proof page. Publishing is the
              owner's explicit choice — nothing goes public by default. */}
          {selectedOutcome && (
            <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <p style={{ fontSize: 15, fontWeight: 800, color: NAVY, margin: '0 0 6px' }}>Verified badge & public page</p>
              <p style={{ fontSize: 13, color: GRAY, lineHeight: 1.6, margin: '0 0 16px' }}>
                Make this verified result public and get an embeddable badge for your website.
                The public page shows your before→after proof and links back to Rankall.
              </p>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: publicToggling ? 'wait' : 'pointer', marginBottom: 12 }}>
                <input
                  type="checkbox"
                  checked={selectedOutcome.is_public === true}
                  disabled={publicToggling}
                  onChange={e => togglePublic(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: GREEN }}
                />
                <span style={{ fontSize: 14, fontWeight: 600, color: NAVY }}>
                  Make this result public
                </span>
              </label>
              {publicError && (
                <p style={{ fontSize: 13, color: '#DC2626', background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 10, padding: '10px 14px', margin: '0 0 12px' }}>{publicError}</p>
              )}
              {selectedOutcome.is_public === true && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/badge/verified/${selectedOutcome.id}`}
                      alt="Verified by Rankall.io"
                      width={320}
                      height={80}
                      style={{ display: 'block', borderRadius: 12, boxShadow: '0 4px 16px rgba(15,23,42,0.15)' }}
                    />
                    <a
                      href={`/verified/${selectedOutcome.id}`}
                      target="_blank"
                      rel="noopener"
                      style={{ fontSize: 13, fontWeight: 700, color: BLUE, textDecoration: 'none' }}
                    >
                      View public page →
                    </a>
                  </div>
                  <div style={{ background: '#0F172A', borderRadius: 12, padding: '14px 16px', overflow: 'auto' }}>
                    <code style={{ fontSize: 12, color: '#94A3B8', whiteSpace: 'pre-wrap', fontFamily: 'monospace', lineHeight: 1.7, display: 'block', wordBreak: 'break-all' }}>
                      {`<a href="https://rankall.io/verified/${selectedOutcome.id}" target="_blank" rel="noopener">\n  <img src="https://rankall.io/api/badge/verified/${selectedOutcome.id}" alt="Verified by Rankall.io" width="320" height="80" />\n</a>`}
                    </code>
                  </div>
                  <button
                    onClick={copyBadgeEmbed}
                    style={{ marginTop: 10, background: badgeCopied ? GREEN : W, border: `1.5px solid ${badgeCopied ? GREEN : BORDER}`, borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 700, color: badgeCopied ? '#fff' : NAVY, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s' }}
                  >
                    {badgeCopied ? 'Copied!' : 'Copy embed code'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Zero-delta banner */}
          {delta === 0 && (
            <div style={{ background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 14, padding: '20px 24px' }}>
              <p style={{ fontSize: 15, fontWeight: 800, color: '#92400E', marginBottom: 6 }}><svg viewBox="0 0 512 512" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg> Your score hasn't changed yet between scans</p>
              <p style={{ fontSize: 14, color: '#78350F', marginBottom: 16, lineHeight: 1.5 }}>
                Apply fixes from your Fix Queue and run a new scan to generate your proof card showing real improvement.
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <a href="/dashboard/fix" className="btn" style={{ background: NAVY, borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 700, color: '#fff', textDecoration: 'none' }}>
                  Go to Fix Queue <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
                <a href="/" className="btn btn-line" style={{ background: '#fff', border: '1.5px solid #FCD34D', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 700, color: '#92400E', textDecoration: 'none' }}>
                  Run New Scan <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
              </div>
            </div>
          )}

          {/* Generate button — only from a verified outcome */}
          {!cardSvg && verifiedOutcomes.length > 0 && (
            <button
              className="btn btn-blue"
              onClick={generateCard}
              disabled={generating}
              style={{ background: NAVY, border: 'none', borderRadius: 12, padding: '16px', fontSize: 15, fontWeight: 700, color: '#fff', cursor: generating ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: generating ? 0.7 : 1 }}
            >
              {generating ? 'Generating proof card...' : (<><svg viewBox="0 0 576 512" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M400 0L176 0c-26.5 0-48.1 21.8-47.1 48.2c.2 5.3 .4 10.6 .7 15.8L24 64C10.7 64 0 74.7 0 88c0 92.6 33.5 157 78.5 200.7c44.3 43.1 98.3 64.8 138.1 75.8c23.4 6.5 39.4 26 39.4 45.6c0 20.9-17 37.9-37.9 37.9L192 448c-17.7 0-32 14.3-32 32s14.3 32 32 32l192 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-26.1 0C337 448 320 431 320 410.1c0-19.6 15.9-39.2 39.4-45.6c39.9-11 93.9-32.7 138.2-75.8C542.5 245 576 180.6 576 88c0-13.3-10.7-24-24-24L446.4 64c.3-5.2 .5-10.4 .7-15.8C448.1 21.8 426.5 0 400 0zM48.9 112l84.4 0c9.1 90.1 29.2 150.3 51.9 190.6c-24.9-11-50.8-26.5-73.2-48.3c-32-31.1-58-76-63-142.3zM464.1 254.3c-22.4 21.8-48.3 37.3-73.2 48.3c22.7-40.3 42.8-100.5 51.9-190.6l84.4 0c-5.1 66.3-31.1 111.2-63 142.3z"/></svg>{' '}Generate Proof Card</>)}
            </button>
          )}
          {generateError && (
            <p style={{ fontSize: 13, color: '#DC2626', background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 10, padding: '10px 14px', margin: 0 }}>{generateError}</p>
          )}

          {/* Card preview */}
          {cardSvg && (
            <>
              <div className="card dash-card" style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Your Proof Card</p>
                <div
                  ref={svgRef}
                  style={{ width: '100%', borderRadius: 12, overflow: 'hidden' }}
                  dangerouslySetInnerHTML={{ __html: cardSvg }}
                />
              </div>

              {/* Action buttons */}
              {copyError && (
                <p style={{ fontSize: 13, color: '#92400E', background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 10, padding: '10px 14px', margin: 0 }}>{copyError}</p>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <button
                  className="btn"
                  onClick={downloadCard}
                  style={{ background: NAVY, border: 'none', borderRadius: 12, padding: '14px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  ↓ Download SVG
                </button>
                <button
                  className="btn btn-line"
                  onClick={copyShareLink}
                  style={{ background: copied ? GREEN : W, border: `1.5px solid ${copied ? GREEN : BORDER}`, borderRadius: 12, padding: '14px', fontSize: 14, fontWeight: 700, color: copied ? '#fff' : NAVY, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s' }}
                >
                  {copied ? (<><svg viewBox="0 0 448 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>{' '}Copied!</>) : (<><svg viewBox="0 0 640 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M579.8 267.7c56.5-56.5 56.5-148 0-204.5c-50-50-128.8-56.5-186.3-15.4l-1.6 1.1c-14.4 10.3-17.7 30.3-7.4 44.6s30.3 17.7 44.6 7.4l1.6-1.1c32.1-22.9 76-19.3 103.8 8.6c31.5 31.5 31.5 82.5 0 114L422.3 334.8c-31.5 31.5-82.5 31.5-114 0c-27.9-27.9-31.5-71.8-8.6-103.8l1.1-1.6c10.3-14.4 6.9-34.4-7.4-44.6s-34.4-6.9-44.6 7.4l-1.1 1.6C206.5 251.2 213 330 263 380c56.5 56.5 148 56.5 204.5 0L579.8 267.7zM60.2 244.3c-56.5 56.5-56.5 148 0 204.5c50 50 128.8 56.5 186.3 15.4l1.6-1.1c14.4-10.3 17.7-30.3 7.4-44.6s-30.3-17.7-44.6-7.4l-1.6 1.1c-32.1 22.9-76 19.3-103.8-8.6C74 372 74 321 105.5 289.5L217.7 177.2c31.5-31.5 82.5-31.5 114 0c27.9 27.9 31.5 71.8 8.6 103.9l-1.1 1.6c-10.3 14.4-6.9 34.4 7.4 44.6s34.4 6.9 44.6-7.4l1.1-1.6C433.5 260.8 427 182 377 132c-56.5-56.5-148-56.5-204.5 0L60.2 244.3z"/></svg>{' '}Copy Share Link</>)}
                </button>
                <button
                  className="btn"
                  onClick={shareLinkedIn}
                  style={{ background: '#0A66C2', border: 'none', borderRadius: 12, padding: '14px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  in Share to LinkedIn
                </button>
              </div>

              {/* Regenerate */}
              <button
                className="btn btn-line"
                onClick={() => { setCardSvg(null); setCardDataUrl(null); }}
                style={{ background: 'none', border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '10px', fontSize: 13, fontWeight: 600, color: GRAY, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L109.2 288 416 288c17.7 0 32-14.3 32-32s-14.3-32-32-32l-306.7 0L214.6 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160z"/></svg> Regenerate with different fix
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
