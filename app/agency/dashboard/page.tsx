'use client';
import { useState, useEffect } from 'react';
import { getBrowserClient } from '@/lib/supabase';
import { usePlan } from '@/lib/usePlan';
import { isAgencyPlan } from '@/lib/planConfig';
import { PlanGuard } from '@/components/PlanGuard';

const NAVY = '#0A0A14';
const BLUE = '#1B17FF';
const GREEN = '#059669';
const RED = '#DC2626';
const GRAY = '#64748B';
const LGRAY = '#94A3B8';
const BORDER = '#E2E8F0';
const BG = '#F8FAFC';
const W = '#FFFFFF';
const AMBER = '#D97706';

interface Client {
  id: string;
  client_name: string | null;
  client_email: string | null;
  business_name: string | null;
  location: string | null;
  query: string | null;
  latest_scan_id: string | null;
  created_at: string;
  latest_score?: number | null;
  competitor_name?: string | null;
  knowledge_panel_exists?: boolean | null;
  knowledge_panel_claimed?: boolean | null;
}

const inp = (extra?: React.CSSProperties): React.CSSProperties => ({
  width: '100%', border: `1.5px solid ${BORDER}`, borderRadius: 8,
  padding: '10px 14px', fontSize: 14, color: NAVY, outline: 'none',
  fontFamily: 'inherit', boxSizing: 'border-box', ...extra,
});

export default function AgencyDashboard() {
  const [userId, setUserId] = useState<string | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [form, setForm] = useState({ client_name: '', client_email: '', business_name: '', location: '', query: '', industry: '' });
  const [inviteForm, setInviteForm] = useState({ client_email: '', client_name: '', business_name: '' });
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [kpFilter, setKpFilter] = useState(false);
  // b88x: sign-in state existed (in-place denial) but there was NO
  // plan gate — a Free account got the full agency surface. The
  // clients API is plan-gated in the b89a branch; the page now
  // gates too. sessionChecked separates "still loading" from
  // "signed out" (the denial used to flash on signed-in loads).
  const { plan, rawPlan, loading: planLoading } = usePlan();
  const [sessionChecked, setSessionChecked] = useState(false);

  async function authHeaders(): Promise<Record<string, string>> {
    const { data } = await getBrowserClient().auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  useEffect(() => {
    (async () => {
      const { data } = await getBrowserClient().auth.getSession();
      const uid = data.session?.user.id ?? null;
      setUserId(uid);
      setSessionChecked(true);
      if (uid) await loadClients();
      else setLoading(false);
    })();
  }, []);

  async function loadClients() {
    setLoading(true);
    try {
      const res = await fetch('/api/agency/clients', { headers: await authHeaders() });
      const data = await res.json();
      if (!data.success) { setLoading(false); return; }
      const enriched: Client[] = await Promise.all(
        (data.clients as Client[]).map(async (c) => {
          if (!c.latest_scan_id) return c;
          try {
            const sr = await fetch(`/api/scan-info?scan_id=${c.latest_scan_id}`);
            if (sr.ok) {
              const sd = await sr.json();
              return { ...c, latest_score: sd.score, competitor_name: sd.competitor_name, knowledge_panel_exists: sd.knowledge_panel_exists ?? null, knowledge_panel_claimed: sd.knowledge_panel_claimed ?? null };
            }
          } catch { /* non-fatal */ }
          return c;
        })
      );
      setClients(enriched);
    } catch { /* non-fatal */ } finally { setLoading(false); }
  }

  async function addClient() {
    if (!userId || !form.business_name.trim()) { setFormError('Business name is required'); return; }
    setSaving(true); setFormError(null);
    try {
      const res = await fetch('/api/agency/clients', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        // If email provided, also create invite
        if (form.client_email?.includes('@')) {
          fetch('/api/agency/invite', {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
            body: JSON.stringify({ client_email: form.client_email, client_name: form.client_name, business_name: form.business_name }),
          }).catch(() => {/* non-fatal */});
        }
        setClients(prev => [data.client, ...prev]);
        setForm({ client_name: '', client_email: '', business_name: '', location: '', query: '', industry: '' });
        setAddOpen(false);
      } else { setFormError(data.error || 'Failed to add client'); }
    } catch { setFormError('Network error'); } finally { setSaving(false); }
  }

  async function removeClient(id: string) {
    if (!userId || !confirm('Remove this client?')) return;
    // b01u: check the response — the old code removed the row even when the
    // DELETE failed, so the client reappeared on reload.
    try {
      const res = await fetch('/api/agency/clients', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ client_id: id }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({} as { error?: string }));
        alert(json.error || 'Could not remove this client. Please try again.');
        return;
      }
      setClients(prev => prev.filter(c => c.id !== id));
    } catch {
      alert('Network error — the client was not removed.');
    }
  }

  async function createInvite() {
    if (!userId || !inviteForm.client_email.includes('@')) return;
    setSaving(true);
    try {
      const res = await fetch('/api/agency/invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(inviteForm),
      });
      const data = await res.json();
      if (data.success) setInviteUrl(data.inviteUrl);
    } catch { /* non-fatal */ } finally { setSaving(false); }
  }

  const scanned = clients.filter(c => c.latest_score !== null && c.latest_score !== undefined);
  const avgScore = scanned.length ? Math.round(scanned.reduce((a, c) => a + (c.latest_score || 0), 0) / scanned.length) : null;
  const needsWork = clients.filter(c => (c.latest_score ?? 100) < 40).length;
  const activeClient = clients.find(c => c.id === activeClientId) ?? null;
  const displayClients = kpFilter ? clients.filter(c => c.knowledge_panel_exists === false) : clients;

  if (!sessionChecked || planLoading) return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter',sans-serif" }}>
      <p style={{ fontSize: 15, color: GRAY }}>Loading…</p>
    </div>
  );

  if (!userId) return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Geist',ui-sans-serif,system-ui,sans-serif" }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 18, color: NAVY, fontWeight: 700, marginBottom: 16 }}>Sign in to access Agency Dashboard</p>
        <a href="/login" style={{ background: BLUE, color: '#fff', padding: '12px 24px', borderRadius: 10, textDecoration: 'none', fontWeight: 700, fontSize: 15 }}>Sign In →</a>
      </div>
    </div>
  );

  if (plan === rawPlan && !isAgencyPlan(plan)) return (
    <PlanGuard feature="canSeeAgency" requiredPlan="agency" currentPlan={plan} isAdmin={false}>
      <></>
    </PlanGuard>
  );

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: "'Geist',ui-sans-serif,system-ui,sans-serif" }}>{/* Top nav */}
      <div style={{ background: NAVY, padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <a href="/" style={{ color: '#fff', textDecoration: 'none', fontSize: 18, fontWeight: 900, letterSpacing: '-0.03em' }}>rank<span style={{ color: BLUE }}>all</span>.io</a>
          <span style={{ color: '#334155', fontSize: 13 }}>|</span>
          <span style={{ color: '#94A3B8', fontSize: 13, fontWeight: 600 }}>Agency Dashboard</span>
          {/* K3: Context switcher */}
          {clients.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button onClick={() => setContextOpen(o => !o)}
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                Viewing: {activeClient ? activeClient.business_name || 'Client' : 'All Clients'} ▾
              </button>
              {contextOpen && (
                <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#1E293B', border: '1px solid #334155', borderRadius: 10, minWidth: 200, zIndex: 100, overflow: 'hidden' }}>
                  <button onClick={() => { setActiveClientId(null); setContextOpen(false); }}
                    style={{ display: 'block', width: '100%', padding: '10px 14px', textAlign: 'left', background: !activeClientId ? '#334155' : 'transparent', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                    All Clients
                  </button>
                  {clients.map(c => (
                    <button key={c.id} onClick={() => { setActiveClientId(c.id); setContextOpen(false); }}
                      style={{ display: 'block', width: '100%', padding: '10px 14px', textAlign: 'left', background: activeClientId === c.id ? '#334155' : 'transparent', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {c.business_name || c.client_name || 'Unnamed'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => { setInviteUrl(null); setInviteOpen(true); }}
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Invite Client
          </button>
          <button onClick={() => { setFormError(null); setAddOpen(true); }}
            style={{ background: BLUE, border: 'none', color: '#fff', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            + Add Client
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 28 }}>
          {[
            { label: 'Clients', value: String(clients.length), color: NAVY },
            { label: 'Avg Score', value: avgScore !== null ? String(avgScore) : '—', color: BLUE },
            { label: 'Scanned', value: String(scanned.length), color: GREEN },
            { label: 'Need Attention', value: String(needsWork), color: needsWork > 0 ? RED : LGRAY },
          ].map((s, i) => (
            <div key={i} style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: '18px 22px' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 6px' }}>{s.label}</p>
              <p style={{ fontSize: 30, fontWeight: 900, color: s.color, margin: 0, lineHeight: 1 }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '18px 24px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: NAVY, margin: 0 }}>Clients</h2>
              <button
                onClick={() => setKpFilter(!kpFilter)}
                style={{
                  padding: '6px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: 'pointer',
                  background: kpFilter ? '#dc2626' : '#fff',
                  color: kpFilter ? '#fff' : '#374151',
                  border: '1px solid #e5e7eb',
                  marginLeft: 12,
                  fontFamily: 'inherit',
                }}
              >
                {kpFilter ? '✕ Clear Filter' : '❌ Show Missing KP Only'}
              </button>
            </div>
            <p style={{ fontSize: 12, color: LGRAY, margin: 0 }}>{clients.length} total</p>
          </div>

          {loading ? (
            <p style={{ padding: 40, textAlign: 'center', color: LGRAY }}>Loading…</p>
          ) : clients.length === 0 ? (
            <div style={{ padding: '60px 40px', textAlign: 'center' }}>
              <p style={{ fontSize: 15, color: LGRAY, marginBottom: 20 }}>No clients yet. Add your first client to start tracking their AI visibility.</p>
              <button onClick={() => { setFormError(null); setAddOpen(true); }}
                style={{ background: BLUE, color: '#fff', border: 'none', borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Add First Client →
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                <thead>
                  <tr style={{ background: BG }}>
                    {['Business', 'Contact', 'Location', 'AI Score', 'Competitor', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '11px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                    <th style={{ padding: '12px 16px', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>KP Status</th>
                  </tr>
                </thead>
                <tbody>
                  {displayClients.map((c, i) => {
                    const score = c.latest_score ?? null;
                    const scoreColor = score === null ? LGRAY : score >= 70 ? GREEN : score >= 40 ? AMBER : RED;
                    return (
                      <tr key={c.id} style={{ borderTop: `1px solid ${BORDER}`, background: i % 2 === 0 ? W : BG }}>
                        <td style={{ padding: '14px 18px' }}>
                          <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: 0 }}>{c.business_name || '—'}</p>
                          {c.query && <p style={{ fontSize: 11, color: LGRAY, margin: '2px 0 0', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.query}</p>}
                        </td>
                        <td style={{ padding: '14px 18px' }}>
                          <p style={{ fontSize: 13, color: NAVY, margin: 0 }}>{c.client_name || '—'}</p>
                          {c.client_email && <p style={{ fontSize: 11, color: LGRAY, margin: '2px 0 0' }}>{c.client_email}</p>}
                        </td>
                        <td style={{ padding: '14px 18px' }}>
                          <p style={{ fontSize: 13, color: GRAY, margin: 0 }}>{c.location || '—'}</p>
                        </td>
                        <td style={{ padding: '14px 18px' }}>
                          {score !== null ? (
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                              <span style={{ fontSize: 20, fontWeight: 900, color: scoreColor }}>{score}</span>
                              <span style={{ fontSize: 11, color: LGRAY }}>/100</span>
                            </div>
                          ) : (
                            <span style={{ fontSize: 12, color: LGRAY, fontStyle: 'italic' }}>Not scanned</span>
                          )}
                        </td>
                        <td style={{ padding: '14px 18px' }}>
                          <p style={{ fontSize: 12, color: c.competitor_name ? RED : LGRAY, fontWeight: c.competitor_name ? 600 : 400, margin: 0 }}>
                            {c.competitor_name || '—'}
                          </p>
                        </td>
                        <td style={{ padding: '14px 18px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <a href={`/?q=${encodeURIComponent(c.query || c.business_name || '')}`} target="_blank" rel="noreferrer"
                              style={{ background: BLUE, color: '#fff', border: 'none', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontWeight: 700, textDecoration: 'none', display: 'inline-block', cursor: 'pointer' }}>
                              Scan
                            </a>
                            {c.latest_scan_id && (
                              <a href={`/report/${c.latest_scan_id}`} target="_blank" rel="noreferrer"
                                style={{ background: W, color: BLUE, border: `1.5px solid ${BLUE}`, borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 700, textDecoration: 'none', display: 'inline-block' }}>
                                Report
                              </a>
                            )}
                            <button onClick={() => removeClient(c.id)}
                              style={{ background: W, color: RED, border: `1.5px solid #FCA5A5`, borderRadius: 6, padding: '5px 9px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                              ✕
                            </button>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {c.knowledge_panel_exists === true ? (
                            <span style={{ color: '#059669', fontSize: 13, fontWeight: 600 }}>✅ Has Panel</span>
                          ) : c.knowledge_panel_exists === false ? (
                            <span style={{ color: '#dc2626', fontSize: 13, fontWeight: 600 }}>❌ Missing</span>
                          ) : (
                            <span style={{ color: '#9ca3af', fontSize: 13 }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add Client Modal */}
      {addOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setAddOpen(false); }}>
          <div style={{ background: W, borderRadius: 20, padding: 32, maxWidth: 480, width: '100%', boxShadow: '0 40px 80px rgba(0,0,0,0.4)' }}>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: NAVY, marginBottom: 20 }}>Add Client</h2>
            {formError && <p style={{ color: RED, fontSize: 13, marginBottom: 12, background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '8px 12px' }}>{formError}</p>}
            {([
              { key: 'business_name', label: 'Business Name *', ph: 'Smith Family Dentistry' },
              { key: 'client_name',   label: 'Contact Name',    ph: 'Dr. John Smith' },
              { key: 'client_email',  label: 'Email (invite will be sent)', ph: 'john@smithdentistry.com' },
              { key: 'location',      label: 'Location',        ph: 'Chicago, IL' },
              { key: 'query',         label: 'Search Query (what customers type)', ph: 'Best dentist in Chicago IL' },
            ] as { key: keyof typeof form; label: string; ph: string }[]).map(f => (
              <div key={f.key} style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: GRAY, display: 'block', marginBottom: 4 }}>{f.label}</label>
                <input value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph} style={inp()} />
                {f.key === 'client_email' && form.client_email.includes('@') && (
                  <p style={{ fontSize: 11, color: GREEN, marginTop: 4, fontWeight: 600 }}>✓ Invite link will be sent automatically</p>
                )}
              </div>
            ))}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: GRAY, display: 'block', marginBottom: 4 }}>Industry</label>
              <select value={form.industry} onChange={e => setForm(p => ({ ...p, industry: e.target.value }))} style={{ ...inp(), appearance: 'none' as const }}>
                <option value="">Select industry…</option>
                {['Dentist','Lawyer','HVAC','Restaurant','Salon','Gym','Real Estate','Auto','Optometrist','Other'].map(ind => (
                  <option key={ind} value={ind}>{ind}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button onClick={() => setAddOpen(false)} style={{ flex: 1, background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 700, color: GRAY, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={addClient} disabled={saving} style={{ flex: 2, background: BLUE, border: 'none', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Adding…' : 'Add Client →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {inviteOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) { setInviteOpen(false); setInviteUrl(null); } }}>
          <div style={{ background: W, borderRadius: 20, padding: 32, maxWidth: 480, width: '100%', boxShadow: '0 40px 80px rgba(0,0,0,0.4)' }}>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: NAVY, marginBottom: 8 }}>Invite a Client</h2>
            <p style={{ fontSize: 13, color: GRAY, marginBottom: 24, lineHeight: 1.6 }}>Generate a 7-day link your client uses to sign up and immediately see their AI visibility scan.</p>
            {!inviteUrl ? (
              <>
                {([
                  { key: 'client_email',  label: 'Client Email *', ph: 'client@business.com', type: 'email' },
                  { key: 'client_name',   label: 'Client Name',    ph: 'Dr. Jane Smith',       type: 'text' },
                  { key: 'business_name', label: 'Business Name',  ph: 'Jane Smith Dental',    type: 'text' },
                ] as { key: keyof typeof inviteForm; label: string; ph: string; type: string }[]).map(f => (
                  <div key={f.key} style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: GRAY, display: 'block', marginBottom: 4 }}>{f.label}</label>
                    <input type={f.type} value={inviteForm[f.key]} onChange={e => setInviteForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph} style={inp()} />
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <button onClick={() => setInviteOpen(false)} style={{ flex: 1, background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 700, color: GRAY, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                  <button onClick={createInvite} disabled={saving || !inviteForm.client_email.includes('@')}
                    style={{ flex: 2, background: BLUE, border: 'none', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', opacity: saving || !inviteForm.client_email.includes('@') ? 0.6 : 1 }}>
                    {saving ? 'Generating…' : 'Generate Invite Link →'}
                  </button>
                </div>
              </>
            ) : (
              <div>
                <div style={{ background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Invite Link (valid 7 days)</p>
                  <p style={{ fontSize: 12, color: NAVY, wordBreak: 'break-all', margin: 0, lineHeight: 1.5 }}>{inviteUrl}</p>
                </div>
                <button onClick={() => navigator.clipboard.writeText(inviteUrl)}
                  style={{ width: '100%', background: GREEN, color: '#fff', border: 'none', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 10 }}>
                  Copy Link
                </button>
                <button onClick={() => { setInviteOpen(false); setInviteUrl(null); setInviteForm({ client_email: '', client_name: '', business_name: '' }); }}
                  style={{ width: '100%', background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 700, color: GRAY, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
