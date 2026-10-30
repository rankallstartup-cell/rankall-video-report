'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { getBrowserClient } from '@/lib/supabase';
import { usePlan } from '@/lib/usePlan';
import { PlanPageGuard } from '@/components/PlanPageGuard';
import { TRIAL_WHITELABEL_BLOCKED_MESSAGE } from '@/lib/trialCaps';


// ── b35v: b35q design tokens (White Label Settings) on staging logic ──
const BG     = '#F6F6FB';
const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#E7E7F0';
const BLUE   = '#1B17FF';
const PURPLE = '#7C3AED';
const GRAY   = '#55556A';
const LGRAY  = '#94A3B8';
const GREEN  = '#12A150';
const GREEN_DARK = '#0B6B37';
const GREEN_BG = '#E3F6EC';
const RED    = '#B4232A';
const RED_BG = '#FDECEC';
const MUTED  = '#5F5F78';
const TINT_BORDER = '#DCDAFF';
const FIX_BG = '#F4F3FF';

interface AgencySettings {
  id?: string;
  agency_user_id?: string;
  agency_name: string;
  agency_website: string;
  agency_primary_color: string;
  agency_email: string;
  agency_phone: string;
  agency_logo_url: string;
  white_label_enabled: boolean;
}

const DEFAULT: AgencySettings = {
  agency_name: '',
  agency_website: '',
  agency_primary_color: '#7C3AED',
  agency_email: '',
  agency_phone: '',
  agency_logo_url: '',
  white_label_enabled: false,
};

export default function AgencySettingsPage() {
  const [settings, setSettings]         = useState<AgencySettings>(DEFAULT);
  const [saving, setSaving]             = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [toast, setToast]               = useState('');
  const [userId, setUserId]             = useState('');
  const fileRef                         = useRef<HTMLInputElement>(null);
  // Trial cap (b28g): white-label is blocked during trial. The toggle is
  // disabled here for UX, but the real enforcement is the PUT /api/agency/settings
  // route — client-side hiding alone is never a security boundary.
  // b89d: the page also had NO plan gate and NO sign-in state — the
  // form rendered identically for Free accounts and (behind the old
  // shell) logged-out visitors. Gates below; the PUT route enforces
  // the same Agency-plan rule server-side.
  const { isTrialing, plan, rawPlan, loading: planLoading } = usePlan();
  const [authDone, setAuthDone] = useState(false);

  useEffect(() => {
    const supabase = getBrowserClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setAuthDone(true); return; }
      const uid = data.user.id;
      setUserId(uid);
      const { data: row } = await supabase
        .from('agency_settings')
        .select('*')
        .eq('agency_user_id', uid)
        .limit(1)
        .single();
      if (row) setSettings(row as AgencySettings);
      setAuthDone(true);
    });
  }, []);

  function set<K extends keyof AgencySettings>(k: K, v: AgencySettings[K]) {
    setSettings(s => ({ ...s, [k]: v }));
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    const okTypes = ['image/png', 'image/svg+xml', 'image/jpeg', 'image/jpg'];
    if (!okTypes.includes(file.type)) {
      showToast('Logo must be PNG, SVG or JPG.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast('Logo must be under 2MB.');
      return;
    }
    setUploadingLogo(true);
    const ext = file.name.split('.').pop();
    const path = `${userId}/logo.${ext}`;
    const supabase = getBrowserClient();
    const { error } = await supabase.storage
      .from('agency-assets')
      .upload(path, file, { upsert: true });
    if (!error) {
      const { data: urlData } = supabase.storage
        .from('agency-assets')
        .getPublicUrl(path);
      set('agency_logo_url', urlData.publicUrl);
    }
    setUploadingLogo(false);
  }

  async function handleSave() {
    if (!userId) return;
    setSaving(true);
    // Trial cap: a trialing account cannot enable white-label — and a logo
    // alone must not auto-enable it either. Other settings still save.
    const white_label_enabled = isTrialing
      ? false
      : (settings.white_label_enabled || !!settings.agency_logo_url);
    const payload = { ...settings, white_label_enabled, agency_user_id: userId };
    try {
      const res = await fetch('/api/agency/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      setSaving(false);
      if (!res.ok) {
        showToast((data as { message?: string }).message || 'Save failed — please try again.');
        return;
      }
      setSettings(s => ({ ...s, white_label_enabled }));
      showToast('Settings saved ✓');
    } catch {
      setSaving(false);
      showToast('Save failed — please try again.');
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  const inp: React.CSSProperties = {
    background: BG, border: `1px solid ${BORDER}`,
    borderRadius: 12, padding: '11px 14px', fontSize: 14,
    color: NAVY, width: '100%', outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box',
  };

  const label = (t: string) => (
    <p className="lbl" style={{ marginBottom: 7 }}>{t}</p>
  );

  const card: React.CSSProperties = {
    background: W, border: `1.5px solid ${BORDER}`,
    borderRadius: 16, padding: '24px', marginBottom: 16,
    boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
  };

  // b89d gates: loading -> sign-in -> plan (PlanPageGuard). The
  // proxy redirect is the primary logged-out gate; these are the
  // page-level states behind it.
  if (planLoading || !authDone) {
    return <div style={{ padding: 40, color: GRAY, fontFamily: 'system-ui, sans-serif' }}>Loading…</div>;
  }
  if (!userId) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: NAVY, margin: '0 0 8px' }}>Sign in to manage your agency settings.</p>
        <p style={{ fontSize: 13, color: GRAY, margin: '0 0 16px' }}>White-label branding for client-facing reports.</p>
        <Link href="/login?next=/dashboard/agency/settings" style={{ color: BLUE, fontWeight: 700, fontSize: 14 }}>Sign in</Link>
      </div>
    );
  }

  return (
    <PlanPageGuard feature="canSeeAgency" requiredPlan="agency">
    <div style={{ background: BG, minHeight: '100vh', padding: '28px 24px', maxWidth: 760, margin: '0 auto' }}>{/* Header */}
      <header className="pagehead">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 700, letterSpacing: '-0.035em' }}>White Label Settings</h1>
          <span style={{ fontSize: 14, color: GRAY }}>Customize your agency branding for client-facing reports</span>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn btn-blue"
          style={{ opacity: saving ? 0.7 : 1 }}
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </header>

      {/* Toast */}
      {toast && (
        <div style={{ background: toast.includes('✓') ? GREEN_BG : RED_BG, border: `1px solid ${toast.includes('✓') ? GREEN : '#FECACA'}`, borderRadius: 12, padding: '12px 18px', fontSize: 14, fontWeight: 600, color: toast.includes('✓') ? GREEN_DARK : RED }}>
          {toast}
        </div>
      )}

      {/* 1. Agency Branding */}
      <div className="card dash-card">
        <p className="h3" style={{ marginBottom: 20 }}>Agency Branding</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}>
          <div>
            {label('Agency Name')}
            <input style={inp} value={settings.agency_name} onChange={e => set('agency_name', e.target.value)} placeholder="Acme Digital Agency" />
          </div>
          <div>
            {label('Agency Website')}
            <input style={inp} value={settings.agency_website} onChange={e => set('agency_website', e.target.value)} placeholder="https://acmeagency.com" />
          </div>
          <div>
            {label('Agency Email')}
            <input style={inp} type="email" value={settings.agency_email} onChange={e => set('agency_email', e.target.value)} placeholder="hello@acmeagency.com" />
          </div>
          <div>
            {label('Agency Phone')}
            <input style={inp} type="tel" value={settings.agency_phone} onChange={e => set('agency_phone', e.target.value)} placeholder="+1 (555) 000-0000" />
          </div>
        </div>

        {/* Primary Color */}
        <div style={{ marginTop: 16 }}>
          {label('Primary Color')}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              onClick={() => document.getElementById('colorPicker')?.click()}
              style={{ width: 40, height: 40, borderRadius: 10, background: settings.agency_primary_color, border: `2px solid ${BORDER}`, cursor: 'pointer', flexShrink: 0 }}
            />
            <input
              id="colorPicker"
              type="color"
              value={settings.agency_primary_color}
              onChange={e => set('agency_primary_color', e.target.value)}
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
            />
            <input
              style={{ ...inp, width: 140, fontFamily: 'Courier New, monospace' }}
              value={settings.agency_primary_color}
              onChange={e => {
                const v = e.target.value;
                if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) set('agency_primary_color', v);
              }}
              placeholder="#7C3AED"
            />
            <span style={{ fontSize: 13, color: GRAY }}>Accent color for client reports</span>
          </div>
        </div>
      </div>

      {/* 2. Logo Upload */}
      <div className="card dash-card">
        <p className="h3" style={{ marginBottom: 6 }}>Agency Logo</p>
        <p className="sub" style={{ marginBottom: 20 }}>Appears in client-facing proposals and reports. PNG, SVG, or JPG.</p>

        {settings.agency_logo_url && (
          <div style={{ marginBottom: 16, padding: '16px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 12, display: 'inline-block' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={settings.agency_logo_url} alt="Agency logo" style={{ maxHeight: 60, maxWidth: 200, objectFit: 'contain' }} />
          </div>
        )}

        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".png,.svg,.jpg,.jpeg"
            onChange={handleLogoUpload}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploadingLogo}
            className="btn btn-line"
            style={{ opacity: uploadingLogo ? 0.7 : 1 }}
          >
            {uploadingLogo ? 'Uploading…' : settings.agency_logo_url ? 'Replace logo' : 'Upload logo'}
          </button>
          {settings.agency_logo_url && (
            <button
              onClick={() => set('agency_logo_url', '')}
              style={{ marginLeft: 10, background: 'transparent', border: 'none', fontSize: 13, color: MUTED, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {/* 3. White Label */}
      <div className="card dash-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <p className="h3" style={{ marginBottom: 4 }}>White Label Mode</p>
            <p className="sub" style={{ lineHeight: 1.6 }}>Hide Rankall branding in client-facing reports and emails. Your agency name and logo appear instead.</p>
          </div>
          <button
            onClick={() => set('white_label_enabled', !settings.white_label_enabled)}
            disabled={isTrialing}
            aria-label="Toggle white label mode"
            style={{ width: 48, height: 26, borderRadius: 100, border: 'none', background: settings.white_label_enabled ? PURPLE : BORDER, cursor: isTrialing ? 'not-allowed' : 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.2s', marginTop: 2, opacity: isTrialing ? 0.5 : 1 }}
          >
            <div style={{ position: 'absolute', top: 3, left: settings.white_label_enabled ? 25 : 3, width: 20, height: 20, borderRadius: '50%', background: W, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
          </button>
        </div>
        {isTrialing && (
          <div role="alert" style={{ marginTop: 14, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12, padding: '12px 16px' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#92400E' }}>{TRIAL_WHITELABEL_BLOCKED_MESSAGE}</p>
          </div>
        )}
        {settings.white_label_enabled && (
          <div style={{ marginTop: 14, background: FIX_BG, border: `1px solid ${TINT_BORDER}`, borderRadius: 12, padding: '12px 16px' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: PURPLE }}>"Powered by Rankall" removed from all client-facing outputs</p>
          </div>
        )}
      </div>

      {/* 4. Report Preview */}
      <div className="card dash-card">
        <p className="h3" style={{ marginBottom: 4 }}>Report Preview</p>
        <p className="sub" style={{ marginBottom: 20 }}>Live preview of how your branding appears to clients</p>

        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', maxWidth: 420 }}>
          {/* Preview header bar */}
          <div style={{ background: settings.agency_primary_color, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
            {settings.agency_logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.agency_logo_url} alt="logo" style={{ height: 28, objectFit: 'contain', maxWidth: 100 }} />
            ) : (
              <span style={{ fontSize: 15, fontWeight: 800, color: W, letterSpacing: '-0.3px' }}>
                {settings.agency_name || 'Your Agency'}
              </span>
            )}
          </div>
          {/* Preview body */}
          <div style={{ background: W, padding: '20px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: settings.agency_primary_color, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>AI Visibility Report</p>
            <p style={{ fontSize: 18, fontWeight: 800, color: NAVY, marginBottom: 4 }}>Sample Business Name</p>
            <p style={{ fontSize: 13, color: GRAY, marginBottom: 16 }}>AI Visibility Score: <strong style={{ color: settings.agency_primary_color }}>67/100</strong> (sample score, for preview only)</p>
            <div style={{ height: 8, background: '#F1F5F9', borderRadius: 100, overflow: 'hidden' }}>
              <div style={{ width: '67%', height: '100%', background: settings.agency_primary_color, borderRadius: 100 }} />
            </div>
            {!settings.white_label_enabled && (
              <p style={{ fontSize: 11, color: LGRAY, marginTop: 12, textAlign: 'center' }}>Powered by Rankall.io</p>
            )}
          </div>
        </div>
      </div>

    </div>
    </PlanPageGuard>
  );
}
