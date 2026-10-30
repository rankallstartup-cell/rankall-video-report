'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getBrowserClient } from '@/lib/supabase';
import { formatProposalFee } from '@/lib/proposalCurrency';
import { usePlan } from '@/lib/usePlan';
import { PlanPageGuard } from '@/components/PlanPageGuard';


// ── b35u: b35q design tokens (Agency Proposals list) on staging logic ──
const BG     = '#F6F6FB';
const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#E7E7F0';
const BLUE   = '#1B17FF';
const PURPLE = '#7C3AED';
const GRAY   = '#55556A';
const LGRAY  = '#94A3B8';
const GREEN  = '#12A150';
const RED    = '#B4232A';
const RED_X  = '#D92D20';
const RED_BG = '#FDECEC';
const MUTED  = '#5F5F78';
const TINT_BORDER = '#DCDAFF';
const FIX_BG = '#F4F3FF';
const GREEN_BG = '#E3F6EC';

type ProposalStatus = 'draft' | 'sent' | 'viewed' | 'won' | 'lost';

interface Proposal {
  id: string;
  prospect_business_name: string;
  prospect_website: string | null;
  prospect_city: string | null;
  prospect_state: string | null;
  prospect_score: number | null;
  prospect_competitor_score: number | null;
  prospect_industry: string | null;
  agency_name: string | null;
  proposed_monthly_fee: number;
  status: ProposalStatus;
  created_at: string;
  proposal_content: string;
}

const STATUS_CONFIG: Record<ProposalStatus, { label: string; bg: string; color: string }> = {
  draft:  { label: 'Draft',  bg: BG,       color: GRAY   },
  sent:   { label: 'Sent',   bg: '#ECEBFF', color: BLUE   },
  viewed: { label: 'Viewed', bg: FIX_BG,   color: PURPLE },
  won:    { label: 'Won',    bg: GREEN_BG, color: GREEN  },
  lost:   { label: 'Lost',   bg: RED_BG,   color: RED    },
};

export default function ProposalsPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [updating, setUpdating]   = useState<string | null>(null);
  // b89c: sign-in + Agency-plan gates (the page had neither; the
  // proxy redirect is the primary logged-out gate).
  const { plan, rawPlan, loading: planLoading } = usePlan();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = getBrowserClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setSignedIn(false); setLoading(false); return; }
      setSignedIn(true);
      const { data: rows } = await supabase
        .from('agency_proposals')
        .select('*')
        .eq('agency_user_id', data.user.id)
        .order('created_at', { ascending: false });
      setProposals((rows ?? []) as Proposal[]);
      setLoading(false);
    });
  }, []);

  async function updateStatus(id: string, status: ProposalStatus) {
    setUpdating(id);
    setActionError(null);
    const res = await fetch('/api/agency/update-proposal-status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposal_id: id, status }),
    });
    if (res.ok) {
      setProposals(ps => ps.map(p => p.id === id ? { ...p, status } : p));
    } else {
      setActionError('Could not update that proposal status. Please try again.');
    }
    setUpdating(null);
  }

  async function duplicateProposal(p: Proposal) {
    const supabase = getBrowserClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const { data: row, error } = await supabase
      .from('agency_proposals')
      .insert({
        agency_user_id:            data.user.id,
        prospect_business_name:    `${p.prospect_business_name} (Copy)`,
        prospect_website:          p.prospect_website,
        prospect_city:             p.prospect_city,
        prospect_state:            p.prospect_state,
        prospect_score:            p.prospect_score,
        prospect_competitor_score: p.prospect_competitor_score,
        prospect_industry:         p.prospect_industry,
        agency_name:               p.agency_name,
        proposed_monthly_fee:      p.proposed_monthly_fee,
        proposal_content:          p.proposal_content,
        status:                    'draft',
        created_at:                new Date().toISOString(),
      })
      .select()
      .single();
    if (!error && row) {
      setProposals(ps => [row as Proposal, ...ps]);
    } else {
      setActionError('Could not duplicate that proposal. Please try again.');
    }
  }

  async function deleteProposal(id: string) {
    if (!confirm('Delete this proposal? This cannot be undone.')) return;
    const supabase = getBrowserClient();
    setActionError(null);
    // b01w: scope the delete to the agency user, like the select/insert
    // on this page. Without it the delete relied on RLS alone — a
    // missing/misconfigured policy would let one agency delete
    // another's proposal. Defense in depth: query filter + RLS.
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setActionError('You must be signed in to delete a proposal.');
      return;
    }
    // b01w hardening vs the branch fix: verify a row was actually
    // deleted. A 0-row delete (e.g. another agency's proposal) is not
    // an error from PostgREST, but the UI must not claim a deletion
    // the database never made.
    const { data: deleted, error } = await supabase
      .from('agency_proposals')
      .delete()
      .eq('id', id)
      .eq('agency_user_id', data.user.id)
      .select('id');
    if (error || !deleted || deleted.length === 0) {
      setActionError('Could not delete that proposal. Please try again.');
      return;
    }
    setProposals(ps => ps.filter(p => p.id !== id));
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // Item 10: the fee's currency is the proposal's one currency (lib/proposalCurrency).
  function formatFee(n: number) {
    return formatProposalFee(n);
  }

  // ax8r: the old PDF / Print buttons called window.print() on the LIST page,
  // so printing produced the whole proposals list (plus the modal behind it).
  // This opens a print window containing ONLY this proposal.
  function printProposal(proposal: Proposal) {
    const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    // b01u: window.open with 'noopener' returns null by spec, so the old
    // call always bailed out and the button did nothing. Open without it
    // (same-origin about:blank we write ourselves), then sever the opener.
    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) { alert('Allow pop-ups for this site to print or save the proposal as PDF.'); return; }
    w.opener = null;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Proposal — ${esc(proposal.prospect_business_name)}</title>` +
      `<style>body{font-family:Georgia,serif;color:#0A0A14;margin:48px;line-height:1.8}h1{font-size:22px;margin:0 0 4px}p.meta{font-size:13px;color:#55556A;margin:0 0 24px}pre{white-space:pre-wrap;font-family:Georgia,serif;font-size:14px;margin:0}</style></head><body>` +
      `<h1>${esc(proposal.prospect_business_name)}</h1>` +
      `<p class="meta">${esc(formatDate(proposal.created_at))} · ${esc(formatFee(proposal.proposed_monthly_fee))}${proposal.agency_name ? ` · ${esc(proposal.agency_name)}` : ''}</p>` +
      `<pre>${esc(proposal.proposal_content)}</pre></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }

  const viewingProposal = proposals.find(p => p.id === viewingId);

  if (planLoading || signedIn === null) {
    return <div style={{ padding: 40, color: GRAY, fontFamily: 'system-ui, sans-serif' }}>Loading…</div>;
  }
  if (signedIn === false) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>Sign in to view your proposals.</p>
        <p style={{ fontSize: 13, color: GRAY, margin: '0 0 16px' }}>AI visibility proposals you have generated for prospects.</p>
        <Link href="/login?next=/dashboard/agency/proposals" style={{ color: BLUE, fontWeight: 700, fontSize: 14 }}>Sign in</Link>
      </div>
    );
  }

  return (
    <PlanPageGuard feature="canSeeAgency" requiredPlan="agency">
    <div style={{ background: BG, minHeight: '100vh', padding: '28px 24px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>{/* Header */}
        <header className="pagehead">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, letterSpacing: '-0.035em' }}>Proposals</h1>
            <span style={{ fontSize: 14, color: GRAY }}>{proposals.length} proposal{proposals.length !== 1 ? 's' : ''} saved</span>
          </div>
          <div className="toolbar">
            <a href="/dashboard/agency/proposal" className="btn btn-blue">
              + New Proposal
            </a>
          </div>
        </header>

        {/* Error banner */}
        {actionError && (
          <p style={{ fontSize: 13, color: RED, background: RED_BG, border: `1px solid #FECACA`, borderRadius: 12, padding: '10px 14px', margin: 0 }}>{actionError}</p>
        )}

        {/* Stats row */}
        {proposals.length > 0 && (
          <div className="g4">
            {(['draft', 'sent', 'viewed', 'won', 'lost'] as ProposalStatus[]).map(s => {
              const count = proposals.filter(p => p.status === s).length;
              const cfg = STATUS_CONFIG[s];
              return (
                <div key={s} className="card dash-card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 30, fontWeight: 700, color: cfg.color, lineHeight: 1 }}>{count}</span>
                  <span className="lbl">{cfg.label}</span>
                </div>
              );
            })}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: GRAY }}>Loading proposals…</div>
        ) : proposals.length === 0 ? (
          <div className="card dash-card" style={{ padding: '60px 32px', textAlign: 'center' }}>
            <p style={{ fontSize: 32, marginBottom: 12 }}><svg viewBox="0 0 384 512" width="32" height="32" fill="currentColor" aria-hidden="true"><path d="M64 0C28.7 0 0 28.7 0 64L0 448c0 35.3 28.7 64 64 64l256 0c35.3 0 64-28.7 64-64l0-288-128 0c-17.7 0-32-14.3-32-32L224 0 64 0zM256 0l0 128 128 0L256 0zM112 256l160 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-160 0c-8.8 0-16-7.2-16-16s7.2-16 16-16zm0 64l160 0c8.8 0 16 7.2 16 16s-7.2 16 16 16l-160 0c-8.8 0-16-7.2-16-16s7.2-16 16-16zm0 64l160 0c8.8 0 16 7.2 16 16s-7.2 16 16 16l-160 0c-8.8 0-16-7.2-16-16s7.2-16 16-16z"/></svg></p>
            <p style={{ fontSize: 16, fontWeight: 700, color: NAVY, margin: '0 0 6px' }}>No proposals yet</p>
            <p style={{ fontSize: 14, color: GRAY, margin: '0 0 24px' }}>Generate your first AI visibility proposal for a prospect</p>
            <a href="/dashboard/agency/proposal" className="btn btn-blue">
              Build a Proposal
            </a>
          </div>
        ) : (
          /* Table */
          <div className="card dash-card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.7fr 1fr 1fr 1fr 240px', gap: 0, padding: '12px 20px', borderBottom: `1px solid ${BORDER}`, background: BG }}>
              {['Prospect', 'Score', 'Status', 'Fee', 'Date', 'Actions'].map(h => (
                <span key={h} className="lbl">{h}</span>
              ))}
            </div>

            {proposals.map((p, i) => {
              const cfg = STATUS_CONFIG[p.status];
              const isUpdating = updating === p.id;
              return (
                <div
                  key={p.id}
                  style={{ display: 'grid', gridTemplateColumns: '2fr 0.7fr 1fr 1fr 1fr 240px', gap: 0, padding: '16px 20px', borderBottom: i < proposals.length - 1 ? `1px solid ${BORDER}` : 'none', alignItems: 'center' }}
                >
                  {/* Prospect */}
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 2 }}>{p.prospect_business_name}</p>
                    {p.prospect_website && (
                      <p style={{ fontSize: 12, color: LGRAY }}>{p.prospect_website.replace(/https?:\/\//, '')}</p>
                    )}
                  </div>

                  {/* Score */}
                  <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, margin: 0 }}>
                    {typeof p.prospect_score === 'number' ? `${p.prospect_score}/100` : '—'}
                  </p>

                  {/* Status badge */}
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color, background: cfg.bg, padding: '4px 10px', borderRadius: 100, display: 'inline-block' }}>
                      {cfg.label}
                    </span>
                  </div>

                  {/* Fee */}
                  <p style={{ fontSize: 13, fontWeight: 700, color: NAVY, margin: 0 }}>{formatFee(p.proposed_monthly_fee)}</p>

                  {/* Date */}
                  <p style={{ fontSize: 13, color: GRAY, margin: 0 }}>{formatDate(p.created_at)}</p>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select
                      value={p.status}
                      disabled={isUpdating}
                      onChange={e => updateStatus(p.id, e.target.value as ProposalStatus)}
                      style={{ background: W, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 8px', fontSize: 12, fontWeight: 600, color: NAVY, cursor: isUpdating ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: isUpdating ? 0.6 : 1 }}
                      title="Update status"
                    >
                      {(['draft', 'sent', 'viewed', 'won', 'lost'] as ProposalStatus[]).map(s => (
                        <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => setViewingId(p.id)}
                      style={{ background: W, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 600, color: NAVY, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      View
                    </button>
                    <button
                      onClick={() => printProposal(p)}
                      style={{ background: W, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 600, color: NAVY, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      PDF
                    </button>
                    <button
                      onClick={() => duplicateProposal(p)}
                      style={{ background: W, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 600, color: NAVY, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={() => deleteProposal(p.id)}
                      style={{ background: 'transparent', border: 'none', padding: '6px 8px', fontSize: 14, color: LGRAY, cursor: 'pointer', fontFamily: 'inherit' }}
                      title="Delete"
                    >
                      <svg viewBox="0 0 384 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* View modal */}
      {viewingProposal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,20,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setViewingId(null); }}
        >
          <div style={{ background: W, borderRadius: 20, padding: '32px', maxWidth: 680, width: '100%', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexShrink: 0 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: NAVY, marginBottom: 2 }}>{viewingProposal.prospect_business_name}</h2>
                <p style={{ fontSize: 13, color: GRAY }}>{formatDate(viewingProposal.created_at)} · {formatFee(viewingProposal.proposed_monthly_fee)}</p>
              </div>
              <button
                onClick={() => setViewingId(null)}
                style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, width: 36, height: 36, fontSize: 18, cursor: 'pointer', fontFamily: 'inherit', color: GRAY, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                <svg viewBox="0 0 384 512" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>
              </button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <div style={{ fontSize: 14, color: NAVY, lineHeight: 1.8, whiteSpace: 'pre-wrap', fontFamily: 'Georgia, serif' }}>
                {viewingProposal.proposal_content}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, flexShrink: 0 }}>
              <button
                onClick={() => { updateStatus(viewingProposal.id, 'sent'); setViewingId(null); }}
                className="btn btn-blue"
                style={{ flex: 1 }}
              >
                Mark as Sent
              </button>
              <button
                onClick={() => printProposal(viewingProposal)}
                className="btn btn-line"
              >
                Print / PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </PlanPageGuard>
  );
}
