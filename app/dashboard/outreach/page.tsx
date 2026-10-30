'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAdminGuard } from '@/lib/useAdminGuard';
import { CATEGORIES } from '@/lib/categories';
import { COUNTRY_CONFIGS, type CountryCode } from '@/lib/countryConfig';
import {
  TARGET_SEARCH_FAILED_CODE,
  TARGET_SEARCH_FAILED_MESSAGE,
  noTargetsMessage,
  resolveCsvReportUrl,
} from '@/lib/outreachFailureShapes';
import { Geist, Geist_Mono } from 'next/font/google';

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States', GB: 'United Kingdom', AU: 'Australia', CA: 'Canada',
  IE: 'Ireland', NZ: 'New Zealand', SG: 'Singapore', AE: 'UAE',
  ZA: 'South Africa', NG: 'Nigeria', KE: 'Kenya', GH: 'Ghana',
  IN: 'India', PH: 'Philippines',
};

const BG     = '#F6F6FB';
const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#E7E7F0';
const BLUE   = '#1B17FF';
const GRAY   = '#55556A';
const LGRAY  = '#5F5F78';
const GREEN  = '#12A150';
const AMBER  = '#D97706';
const RED    = '#B4232A';

const ALL_CATEGORY_OPTIONS = Object.entries(CATEGORIES).map(([slug, c]) => ({
  slug,
  label: c.label,
  queryTerm: c.queryTerm,
  sector: c.sector,
  countries: c.countries,
  replaces: c.replaces,
}));

function getCategoryOptionsForCountry(countryCode: string) {
  const replacedSlugs = new Set<string>();
  for (const c of ALL_CATEGORY_OPTIONS) {
    if (c.replaces && c.countries?.includes(countryCode)) {
      replacedSlugs.add(c.replaces);
    }
  }
  return ALL_CATEGORY_OPTIONS.filter(c => {
    if (replacedSlugs.has(c.slug)) return false;
    if (c.countries && !c.countries.includes(countryCode)) return false;
    return true;
  });
}

type TargetStatus = 'idle' | 'finding_email' | 'email_found' | 'no_email' | 'scanning' | 'scanned' | 'not_scanned' | 'sending' | 'sent' | 'skipped' | 'error';

interface Target {
  businessName: string;
  address: string;
  phone: string;
  website: string | null;
  hasWebsite: boolean;
  rating: number | null;
  reviewCount: number | null;
  placeId: string | null;
  status: TargetStatus;
  email: string | null;
  firstName: string | null;
  emailConfidence: number;
  scanId: string | null;
  overallScore: number | null;
  appeared: boolean | null;
  competitorName: string | null;
  competitorScore: number | null;
  competitorPlatformCount: number | null;
  platformResults: Record<string, boolean> | null;
  resolvedIndustry: string | null;
  errorMsg: string | null;
}

interface OutreachLog {
  id: string;
  business_name: string;
  email: string;
  city: string;
  industry: string;
  score: number;
  sent_at: string;
  status: string;
}

const STORAGE_KEY = 'rankall_outreach_targets';

function saveTargetsToStorage(targets: Target[], industry: string, city: string, state: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ targets, industry, city, state, savedAt: Date.now() }));
  } catch {}
}

function loadTargetsFromStorage(): { targets: Target[]; industry: string; city: string; state: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!Array.isArray(data.targets) || data.targets.length === 0) return null;
    const age = Date.now() - (data.savedAt || 0);
    if (age > 7 * 24 * 60 * 60 * 1000) return null;
    return data;
  } catch { return null; }
}

function statusBadge(status: TargetStatus) {
  const map: Record<TargetStatus, { label: React.ReactNode; bg: string; color: string }> = {
    idle:          { label: 'Not contacted', bg: '#F6F6FB', color: GRAY },
    finding_email: { label: 'Finding email…', bg: '#ECEBFF', color: BLUE },
    email_found:   { label: 'Email found',   bg: '#ECFDF5', color: GREEN },
    no_email:      { label: 'No email',      bg: '#FEF3C7', color: AMBER },
    scanning:      { label: 'Scanning…',     bg: '#ECEBFF', color: BLUE },
    scanned:       { label: 'Scanned',       bg: '#ECFDF5', color: GREEN },
    sending:       { label: 'Sending…',      bg: '#ECEBFF', color: BLUE },
    sent:          { label: (<>Sent{' '}<svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg></>),        bg: '#ECFDF5', color: GREEN },
    not_scanned:   { label: 'Not scanned',   bg: '#FEF3C7', color: AMBER },
    skipped:       { label: 'Skipped',       bg: '#FEF3C7', color: AMBER },
    error:         { label: 'Error',         bg: '#FEF2F2', color: RED },
  };
  const s = map[status];
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

const BATCH_SIZE = 5;

export default function OutreachPage() {
  const { checking, isAdmin } = useAdminGuard();
  const [industry, setIndustry] = useState('');
  const [industryInput, setIndustryInput] = useState('');
  const [industrySuggestions, setIndustrySuggestions] = useState<typeof ALL_CATEGORY_OPTIONS>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const industryRef = useRef<HTMLDivElement>(null);
  const [countryCode, setCountryCode] = useState<CountryCode>('US');
  const [city, setCity]         = useState('');
  const [state, setState]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [targets, setTargets]   = useState<Target[]>([]);
  const [history, setHistory]   = useState<OutreachLog[]>([]);
  const [histLoading, setHistLoading] = useState(true);
  const [bulkRunning, setBulkRunning] = useState<string | null>(null);
  const [error, setError]       = useState('');
  // Fix #10: the last completed search (for the explicit "no targets found"
  // message). Null while no search has completed or a search is running.
  const [searched, setSearched] = useState<{ industry: string; city: string } | null>(null);

  const targetsRef = useRef(targets);
  useEffect(() => { targetsRef.current = targets; }, [targets]);

  // Persist targets to localStorage on change
  useEffect(() => {
    if (targets.length > 0) {
      saveTargetsToStorage(targets, industry, city, state);
    }
  }, [targets, industry, city, state]);

  // Restore from localStorage on mount
  useEffect(() => {
    const saved = loadTargetsFromStorage();
    if (saved) {
      setTargets(saved.targets);
      setIndustry(saved.industry);
      setIndustryInput(saved.industry);
      setCity(saved.city);
      setState(saved.state);
    }
    fetchHistory();
  }, []);

  const filteredCategories = useMemo(() => getCategoryOptionsForCountry(countryCode), [countryCode]);
  const [suggestionTotal, setSuggestionTotal] = useState(0);

  // Industry typeahead: filter categories on input change
  useEffect(() => {
    const q = industryInput.trim().toLowerCase();
    if (q.length < 2) { setIndustrySuggestions([]); setSuggestionTotal(0); return; }
    const all = filteredCategories.filter(c =>
      c.label.toLowerCase().includes(q) || c.queryTerm.toLowerCase().includes(q)
    );
    setSuggestionTotal(all.length);
    setIndustrySuggestions(all.slice(0, 12));
  }, [industryInput, filteredCategories]);

  // Close suggestions on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (industryRef.current && !industryRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function fetchHistory() {
    setHistLoading(true);
    try {
      const res = await fetch('/api/outreach/history');
      if (res.ok) {
        const d = await res.json();
        setHistory(d.logs || []);
      }
    } catch {}
    setHistLoading(false);
  }

  async function findTargets() {
    const resolvedIndustry = industry || industryInput.trim();
    if (!resolvedIndustry) { setError('Enter an industry'); return; }
    if (!city.trim()) { setError('Enter a city'); return; }
    setError('');
    setSearched(null);
    setLoading(true);
    setTargets([]);
    try {
      const res = await fetch('/api/outreach/find-targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industry: resolvedIndustry, city: city.trim(), state: state.trim(), countryCode }),
      });
      const d = await res.json();
      if (d.error) {
        // Fix #10: a failed search is an explicit error, never a silent [].
        // Also reset loading here — the old early return left the button
        // stuck on "Finding…".
        setError(d.error === TARGET_SEARCH_FAILED_CODE ? TARGET_SEARCH_FAILED_MESSAGE : d.error);
        setLoading(false);
        return;
      }
      setSearched({ industry: resolvedIndustry, city: city.trim() });
      setTargets((d.targets || []).map((t: any) => ({
        ...t,
        status: 'idle' as TargetStatus,
        email: null, firstName: null, emailConfidence: 0,
        scanId: null, overallScore: null, appeared: null,
        competitorName: null, competitorScore: null, competitorPlatformCount: null, platformResults: null, resolvedIndustry: null, errorMsg: null,
      })));
    } catch {
      setError('Failed to find targets');
    }
    setLoading(false);
  }

  const findEmail = useCallback(async (idx: number) => {
    const t = targetsRef.current[idx];
    if (!t) return;
    setTargets(prev => prev.map((x, i) => i === idx ? { ...x, status: 'finding_email' as TargetStatus } : x));
    try {
      const res = await fetch('/api/outreach/find-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName: t.businessName, domain: t.website, city }),
      });
      const d = await res.json();
      if (d.email) {
        setTargets(prev => prev.map((x, i) => i === idx ? {
          ...x, status: 'email_found' as TargetStatus, email: d.email, firstName: d.firstName, emailConfidence: d.confidence,
        } : x));
      } else {
        setTargets(prev => prev.map((x, i) => i === idx ? { ...x, status: 'no_email' as TargetStatus } : x));
      }
    } catch {
      setTargets(prev => prev.map((x, i) => i === idx ? { ...x, status: 'error' as TargetStatus, errorMsg: 'Email lookup failed' } : x));
    }
  }, [city]);

  const runScan = useCallback(async (idx: number, force = false) => {
    const t = targetsRef.current[idx];
    if (!t) return;
    setTargets(prev => prev.map((x, i) => i === idx ? { ...x, status: 'scanning' as TargetStatus } : x));
    try {
      const res = await fetch('/api/outreach/run-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName: t.businessName, industry: industry || industryInput.trim(), city, countryCode, force }),
      });
      const d = await res.json();
      if (d.saveError) {
        console.error('[outreach] saveScan failed:', d.saveError, { businessName: t.businessName, scanId: d.scanId });
      }
      console.log('[outreach] API response competitor:', d.competitor);
      if (d.error) {
        setTargets(prev => prev.map((x, i) => i === idx ? { ...x, status: 'error' as TargetStatus, errorMsg: d.error } : x));
      } else if (d.status === 'not_scanned') {
        setTargets(prev => prev.map((x, i) => i === idx ? { ...x, status: 'not_scanned' as TargetStatus } : x));
      } else {
        setTargets(prev => prev.map((x, i) => i === idx ? {
          ...x,
          status: 'scanned' as TargetStatus,
          scanId: d.scanId || null,
          overallScore: d.overallScore ?? null,
          appeared: d.appeared ?? null,
          platformResults: d.platformResults || null,
          competitorName: d.competitor?.name || null,
          competitorScore: d.competitor?.score ?? null,
          competitorPlatformCount: d.competitor?.platformCount ?? null,
          resolvedIndustry: d.resolvedIndustry || null,
        } : x));
      }
    } catch {
      setTargets(prev => prev.map((x, i) => i === idx ? { ...x, status: 'error' as TargetStatus, errorMsg: 'Scan failed' } : x));
    }
  }, [industry, industryInput, city, countryCode]);

  const exportCsv = useCallback(async () => {
    const exportable = targets.filter(t => t.email && t.overallScore !== null && t.overallScore !== undefined);
    if (exportable.length === 0) return;
    // Fix #10: report_url is the public /r/<id> link ONLY for shareable
    // scans. Fail-closed: if the eligibility lookup fails, every
    // report_url is empty — never a link to a private report.
    let shareable: Record<string, boolean> = {};
    try {
      const scanIds = [...new Set(exportable.map(t => t.scanId).filter((id): id is string => !!id))];
      if (scanIds.length > 0) {
        const res = await fetch('/api/outreach/report-eligibility', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scanIds }),
        });
        if (res.ok) {
          const d = await res.json();
          shareable = d.shareable || {};
        }
      }
    } catch { /* fail-closed: shareable stays {} */ }
    const headers = ['business_name','email','city','state','industry','address','phone','website','overall_score','mentioned_count','top_competitor','competitor_score','competitor_platform_count','report_url','scan_id'];
    const escape = (v: string | null | undefined) => {
      if (v == null) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const cleanUrl = (raw: string | null) => {
      if (!raw) return '';
      try { const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`); u.search = ''; return u.toString().replace(/\/$/, ''); } catch { return raw; }
    };
    const rows = exportable.map(t => {
      const mentionedCount = t.platformResults ? Object.values(t.platformResults).filter(Boolean).length : 0;
      return [
        t.businessName, t.email, city, state,
        t.resolvedIndustry || industry || industryInput.trim(),
        t.address, t.phone, cleanUrl(t.website),
        String(t.overallScore ?? 0), String(mentionedCount),
        t.competitorName || '', String(t.competitorScore ?? ''), String(t.competitorPlatformCount ?? ''),
        resolveCsvReportUrl(t.scanId, shareable[t.scanId || ''] === true),
        t.scanId || '',
      ].map(escape).join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    const safeCity = city.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    const safeIndustry = (industry || industryInput.trim()).replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    a.href = url;
    a.download = `rankall-outreach-${safeCity}-${safeIndustry}-${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [targets, city, state, industry, industryInput]);

  const sendEmail = useCallback(async (idx: number) => {
    const t = targetsRef.current[idx];
    if (!t?.email) return;
    setTargets(prev => prev.map((x, i) => i === idx ? { ...x, status: 'sending' as TargetStatus } : x));
    try {
      const res = await fetch('/api/outreach/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: t.email,
          firstName: t.firstName,
          businessName: t.businessName,
          industry: t.resolvedIndustry || industry || industryInput.trim(),
          city,
          scanId: t.scanId,
          overallScore: t.overallScore ?? 0,
          // No trustScore field: the scan pipeline does not measure a trust
          // score for outreach targets, and the send-email API does not read
          // one. The old hardcoded 0 would have masqueraded as a measured 0.
          competitorName: t.competitorName,
          competitorScore: t.competitorScore,
          competitorPlatformCount: t.competitorPlatformCount,
          appeared: t.appeared ?? false,
          platformResults: t.platformResults || {},
          countryCode,
        }),
      });
      const d = await res.json();
      if (d.error) {
        setTargets(prev => prev.map((x, i) => i === idx ? { ...x, status: 'error' as TargetStatus, errorMsg: d.error } : x));
      } else if (d.skipped) {
        setTargets(prev => prev.map((x, i) => i === idx ? { ...x, status: 'skipped' as TargetStatus, errorMsg: d.reason || 'Skipped' } : x));
      } else {
        setTargets(prev => prev.map((x, i) => i === idx ? { ...x, status: 'sent' as TargetStatus } : x));
        fetchHistory();
      }
    } catch {
      setTargets(prev => prev.map((x, i) => i === idx ? { ...x, status: 'error' as TargetStatus, errorMsg: 'Send failed' } : x));
    }
  }, [industry, industryInput, city, countryCode]);

  async function bulkFindEmails() {
    setBulkRunning('emails');
    const indices = targetsRef.current
      .map((t, i) => t.status === 'idle' ? i : -1)
      .filter(i => i >= 0);
    for (let b = 0; b < indices.length; b += BATCH_SIZE) {
      const batch = indices.slice(b, b + BATCH_SIZE);
      await Promise.allSettled(batch.map(i => findEmail(i)));
    }
    setBulkRunning(null);
  }

  async function bulkScanAll() {
    setBulkRunning('scans');
    const indices = targetsRef.current
      .map((t, i) => ['idle', 'email_found', 'no_email'].includes(t.status) ? i : -1)
      .filter(i => i >= 0);
    for (let b = 0; b < indices.length; b += BATCH_SIZE) {
      const batch = indices.slice(b, b + BATCH_SIZE);
      await Promise.allSettled(batch.map(i => runScan(i)));
    }
    setBulkRunning(null);
  }

  async function bulkSendAll() {
    setBulkRunning('send');
    const indices = targetsRef.current
      .map((t, i) => t.status === 'scanned' && t.email ? i : -1)
      .filter(i => i >= 0);
    for (let b = 0; b < indices.length; b += BATCH_SIZE) {
      const batch = indices.slice(b, b + BATCH_SIZE);
      await Promise.allSettled(batch.map(i => sendEmail(i)));
    }
    setBulkRunning(null);
  }

  const sentCount   = targets.filter(t => t.status === 'sent').length;
  const scannedCount = targets.filter(t => t.status === 'scanned').length;
  const emailCount  = targets.filter(t => t.email).length;

  if (checking) return (
    <div style={{ padding: '48px 28px', textAlign: 'center' }}>
      <p style={{ fontSize: 14, color: LGRAY }}>Checking access…</p>
    </div>
  );
  if (!isAdmin) return null;

  return (
    <div className={`${geistSans.variable} ${geistMono.variable}`} style={{ background: BG, minHeight: '100vh', padding: '28px 24px', fontFamily: 'var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif' }}>
      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .dash-card { animation: fadeInUp 0.5s ease both; transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .dash-card:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(27,23,255,0.15); }
        .card{background:#fff;border:1px solid #E7E7F0;border-radius:16px;padding:22px;min-width:0}
        .lbl{font-family:var(--font-geist-mono),monospace;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#5F5F78}
        .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 18px;border-radius:12px;font-family:inherit;font-weight:600;font-size:14px;border:0;cursor:pointer;white-space:nowrap;text-decoration:none}
        .btn:disabled{opacity:.55;cursor:not-allowed}
        .btn-sm{min-height:32px;padding:0 12px;font-size:12px;border-radius:8px}
        .btn-blue{background:#1B17FF;color:#fff}.btn-blue:hover{background:#1310C4;color:#fff}
        .btn-line{background:#fff;color:#0A0A14;border:1.5px solid #E7E7F0}.btn-line:hover{border-color:#1B17FF;color:#1B17FF}
        .btn-ghost{background:transparent;color:#55556A}.btn-ghost:hover{background:#F6F6FB}
        .pagehead{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}
        @media (max-width:639px){
          .pagehead{flex-direction:column;align-items:stretch}
          .card{padding:18px}
        }
        @media (prefers-reduced-motion:reduce){*{animation:none!important}}
      `}</style>
    <div style={{ padding: '0 0 80px', maxWidth: 1200, margin: '0 auto' }}>

      {/* Header */}
      <header className="pagehead" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.035em', color: NAVY, margin: 0 }}>Cold Outreach</h1>
          <p style={{ fontSize: 14, color: GRAY, margin: 0 }}>Find local businesses, scan their AI visibility, and send personalized outreach emails.</p>
        </div>
      </header>

      {/* Campaign builder card */}
      <div className="card dash-card" style={{ padding: '28px 28px', marginBottom: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: NAVY, margin: '0 0 20px' }}>Campaign Setup</h2>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 220px', position: 'relative' }} ref={industryRef}>
            <label className="lbl" style={{ display: 'block', marginBottom: 6 }}>Industry</label>
            <input
              type="text"
              placeholder="e.g. personal injury lawyer"
              value={industryInput}
              onChange={e => { setIndustryInput(e.target.value); setIndustry(''); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={e => e.key === 'Enter' && findTargets()}
              style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${BORDER}`, borderRadius: 10, fontSize: 14, color: NAVY, outline: 'none', boxSizing: 'border-box' }}
            />
            {showSuggestions && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: W, border: `1.5px solid ${BORDER}`, borderRadius: 10, marginTop: 4, maxHeight: 240, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                {industrySuggestions.length === 0 && industryInput.trim().length < 2 && (
                  <div style={{ padding: '12px 12px', fontSize: 12, color: LGRAY, textAlign: 'center' }}>
                    Type to search {filteredCategories.length} categories
                  </div>
                )}
                {industrySuggestions.map(c => (
                  <div
                    key={c.slug}
                    onClick={() => { setIndustry(c.queryTerm); setIndustryInput(c.label); setShowSuggestions(false); }}
                    style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, color: NAVY, borderBottom: `1px solid ${BORDER}` }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#F6F6FB')}
                    onMouseLeave={e => (e.currentTarget.style.background = W)}
                  >
                    <span style={{ fontWeight: 600 }}>{c.label}</span>
                    <span style={{ color: LGRAY, marginLeft: 8, fontSize: 11 }}>{c.sector}</span>
                  </div>
                ))}
                {suggestionTotal > 12 && (
                  <div style={{ padding: '8px 12px', fontSize: 11, color: LGRAY, textAlign: 'center', borderTop: `1px solid ${BORDER}` }}>
                    Showing 12 of {suggestionTotal} matches
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ flex: '0 1 160px' }}>
            <label className="lbl" style={{ display: 'block', marginBottom: 6 }}>Country</label>
            <select
              value={countryCode}
              onChange={e => { setCountryCode(e.target.value as CountryCode); setIndustry(''); setIndustryInput(''); }}
              style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${BORDER}`, borderRadius: 10, fontSize: 14, color: NAVY, outline: 'none', boxSizing: 'border-box', background: W }}
            >
              {Object.keys(COUNTRY_CONFIGS).map(code => (
                <option key={code} value={code}>{COUNTRY_NAMES[code] || code}</option>
              ))}
            </select>
          </div>

          <div style={{ flex: '1 1 180px' }}>
            <label className="lbl" style={{ display: 'block', marginBottom: 6 }}>City</label>
            <input
              type="text"
              placeholder="e.g. Austin"
              value={city}
              onChange={e => setCity(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && findTargets()}
              style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${BORDER}`, borderRadius: 10, fontSize: 14, color: NAVY, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ flex: '1 1 160px' }}>
            <label className="lbl" style={{ display: 'block', marginBottom: 6 }}>State / Region</label>
            <input
              type="text"
              placeholder="e.g. Illinois"
              value={state}
              onChange={e => setState(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && findTargets()}
              style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${BORDER}`, borderRadius: 10, fontSize: 14, color: NAVY, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          <button
            onClick={findTargets}
            disabled={loading}
            className="btn btn-blue"
          >
            {loading ? 'Finding…' : 'Find Targets'}
          </button>
        </div>

        {error && (
          <p style={{ fontSize: 13, color: RED, marginTop: 12, marginBottom: 0 }}>{error}</p>
        )}
      </div>

      {/* Fix #10: explicit empty state — a successful search with zero
          targets says so, with the search terms and a next step. */}
      {!loading && !error && searched && targets.length === 0 && (
        <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '24px 28px', marginBottom: 24, textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: NAVY, margin: 0 }}>{noTargetsMessage(searched.industry, searched.city)}</p>
        </div>
      )}

      {/* Results */}
      {targets.length > 0 && (
        <div className="card dash-card" style={{ padding: '24px 28px', marginBottom: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>

          {/* Stats + bulk actions */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 20 }}>
              <span style={{ fontSize: 13, color: GRAY }}><strong style={{ color: NAVY }}>{targets.length}</strong> targets</span>
              <span style={{ fontSize: 13, color: GRAY }}><strong style={{ color: NAVY }}>{emailCount}</strong> emails found</span>
              <span style={{ fontSize: 13, color: GRAY }}><strong style={{ color: NAVY }}>{scannedCount}</strong> scanned</span>
              <span style={{ fontSize: 13, color: GRAY }}><strong style={{ color: GREEN }}>{sentCount}</strong> sent</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={bulkFindEmails}
                disabled={bulkRunning !== null}
                className="btn btn-line btn-sm"
                style={{ background: '#ECEBFF', borderColor: '#C9C6FF', color: BLUE }}
              >
                {bulkRunning === 'emails' ? 'Finding…' : 'Find All Emails'}
              </button>
              <button
                onClick={bulkScanAll}
                disabled={bulkRunning !== null}
                className="btn btn-line btn-sm"
                style={{ background: '#ECFDF5', borderColor: '#A7F3D0', color: GREEN }}
              >
                {bulkRunning === 'scans' ? 'Scanning…' : 'Scan All'}
              </button>
              <button
                onClick={bulkSendAll}
                disabled={bulkRunning !== null}
                className="btn btn-blue btn-sm"
              >
                {bulkRunning === 'send' ? 'Sending…' : 'Send All'}
              </button>
              <button
                onClick={exportCsv}
                className="btn btn-ghost btn-sm"
              >
                ↓ Export CSV
              </button>
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                  {['Business', 'Contact', 'AI Visibility', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ textAlign: 'left', fontSize: 11, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 12px 10px 0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {targets.map((t, idx) => (
                  <tr key={idx} style={{ borderBottom: `1px solid ${BORDER}` }}>
                    {/* Business */}
                    <td style={{ padding: '14px 12px 14px 0', verticalAlign: 'top' }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: '0 0 2px' }}>{t.businessName}</p>
                      {t.address && <p style={{ fontSize: 12, color: LGRAY, margin: '0 0 2px' }}>{t.address}</p>}
                      {t.rating && <p style={{ fontSize: 12, color: AMBER, margin: 0 }}><svg viewBox="0 0 576 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329 542.7 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z"/></svg> {t.rating} ({t.reviewCount ?? '?'} reviews)</p>}
                    </td>

                    {/* Contact */}
                    <td style={{ padding: '14px 12px 14px 0', verticalAlign: 'top', minWidth: 180 }}>
                      {t.email ? (
                        <div>
                          <p style={{ fontSize: 13, color: NAVY, margin: '0 0 2px', fontWeight: 600 }}>{t.email}</p>
                          {t.firstName && <p style={{ fontSize: 12, color: GRAY, margin: '0 0 2px' }}>{t.firstName}</p>}
                          <p style={{ fontSize: 11, color: LGRAY, margin: 0 }}>{t.emailConfidence}% confidence</p>
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: LGRAY }}>—</span>
                      )}
                    </td>

                    {/* AI Visibility */}
                    <td style={{ padding: '14px 12px 14px 0', verticalAlign: 'top' }}>
                      {t.status === 'not_scanned' ? (
                        <div>
                          <span style={{ fontSize: 12, color: AMBER, fontWeight: 700 }}>Not yet scanned</span>
                          <p style={{ margin: '4px 0 0' }}>
                            <a
                              href={`https://rankall.io/?q=${encodeURIComponent(t.businessName.toLowerCase().includes(city.toLowerCase()) ? t.businessName : t.businessName + ' ' + city)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: 11, color: BLUE, fontWeight: 700, textDecoration: 'none' }}
                            >
                              Scan on rankall.io <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
                          </p>
                        </div>
                      ) : t.overallScore !== null && t.overallScore !== undefined ? (() => {
                        const platformCount = t.platformResults ? Object.values(t.platformResults).filter(Boolean).length : 0;
                        const totalPlatforms = t.platformResults ? Object.keys(t.platformResults).length : 0;
                        const score = t.overallScore ?? 0;
                        const scoreColor = score > 30 ? GREEN : score > 0 ? AMBER : RED;
                        return (
                          <div>
                            <span style={{ fontSize: 15, fontWeight: 800, color: scoreColor }}>{score}</span>
                            <span style={{ fontSize: 12, color: GRAY }}>/100</span>
                            {totalPlatforms > 0 && (
                              <p style={{ fontSize: 11, color: GRAY, margin: '2px 0 0' }}>
                                {platformCount} of {totalPlatforms} platforms
                              </p>
                            )}
                            <button
                              onClick={() => {
                                setTargets(prev => prev.map((x, j) => j === idx ? {
                                  ...x, status: 'not_scanned' as TargetStatus,
                                  scanId: null, overallScore: null, appeared: null,
                                  platformResults: null, competitorName: null, competitorScore: null, competitorPlatformCount: null,
                                } : x));
                                setTimeout(() => runScan(idx, true), 0);
                              }}
                              className="btn btn-line btn-sm"
                              style={{ marginTop: 4, borderColor: LGRAY, color: GRAY }}
                            >
                              <svg viewBox="0 0 512 512" width="10" height="10" fill="currentColor" aria-hidden="true"><path d="M105.1 202.6c7.7-21.8 20.2-42.3 37.8-59.8c62.5-62.5 163.8-62.5 226.3 0L386.3 160 352 160c-17.7 0-32 14.3-32 32s14.3 32 32 32l111.5 0c0 0 0 0 0 0l.4 0c17.7 0 32-14.3 32-32l0-112c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 35.2L414.4 97.6c-87.5-87.5-229.3-87.5-316.8 0C73.2 122 55.6 150.7 44.8 181.4c-5.9 16.7 2.9 34.9 19.5 40.8s34.9-2.9 40.8-19.5zM39 289.3c-5 1.5-9.8 4.2-13.7 8.2c-4 4-6.7 8.8-8.1 14c-.3 1.2-.6 2.5-.8 3.8c-.3 1.7-.4 3.4-.4 5.1L16 432c0 17.7 14.3 32 32 32s32-14.3 32-32l0-35.1 17.6 17.5c0 0 0 0 0 0c87.5 87.4 229.3 87.4 316.7 0c24.4-24.4 42.1-53.1 52.9-83.8c5.9-16.7-2.9-34.9-19.5-40.8s-34.9 2.9-40.8 19.5c-7.7 21.8-20.2 42.3-37.8 59.8c-62.5 62.5-163.8 62.5-226.3 0l-.1-.1L125.6 352l34.4 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L48.4 288c-1.6 0-3.2 .1-4.8 .3s-3.1 .5-4.6 1z"/></svg> Rescan
                            </button>
                          </div>
                        );
                      })() : (
                        <button
                          onClick={() => runScan(idx)}
                          className="btn btn-line btn-sm"
                          style={{ background: '#FEF2F2', borderColor: '#FECACA', color: RED }}
                        >
                          Check Score
                        </button>
                      )}
                    </td>

                    {/* Status */}
                    <td style={{ padding: '14px 12px 14px 0', verticalAlign: 'top' }}>
                      {statusBadge(t.status)}
                      {t.errorMsg && <p style={{ fontSize: 11, color: t.status === 'skipped' ? AMBER : RED, margin: '4px 0 0' }}>{t.errorMsg}</p>}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '14px 0 14px 0', verticalAlign: 'top' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {['idle', 'no_email', 'error'].includes(t.status) && (
                          <button
                            onClick={() => findEmail(idx)}
                            className="btn btn-line btn-sm"
                            style={{ background: '#ECEBFF', borderColor: '#C9C6FF', color: BLUE }}
                          >
                            Find Email
                          </button>
                        )}
                        {['email_found', 'no_email'].includes(t.status) && (
                          <button
                            onClick={() => runScan(idx)}
                            className="btn btn-line btn-sm"
                            style={{ background: '#ECFDF5', borderColor: '#A7F3D0', color: GREEN }}
                          >
                            Run Scan
                          </button>
                        )}
                        {t.status === 'scanned' && t.email && t.appeared !== null && (
                          <button
                            onClick={() => sendEmail(idx)}
                            className="btn btn-blue btn-sm"
                          >
                            Send Email
                          </button>
                        )}
                        {t.status === 'sent' && (
                          <span style={{ fontSize: 11, color: GREEN, fontWeight: 700 }}><svg viewBox="0 0 448 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> Done</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Outreach History */}
      <div className="card dash-card" style={{ padding: '24px 28px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: NAVY, margin: '0 0 20px' }}>Outreach History</h2>

        {histLoading ? (
          <p style={{ fontSize: 14, color: LGRAY }}>Loading…</p>
        ) : history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <p style={{ fontSize: 14, color: LGRAY, margin: 0 }}>No emails sent yet. Find targets above and start your first campaign.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                  {['Business', 'Email', 'City', 'Industry', 'Score', 'Sent At'].map(h => (
                    <th key={h} style={{ textAlign: 'left', fontSize: 11, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 16px 10px 0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map(row => (
                  <tr key={row.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <td style={{ padding: '12px 16px 12px 0', fontSize: 13, fontWeight: 600, color: NAVY }}>{row.business_name}</td>
                    <td style={{ padding: '12px 16px 12px 0', fontSize: 13, color: GRAY }}>{row.email}</td>
                    <td style={{ padding: '12px 16px 12px 0', fontSize: 13, color: GRAY }}>{row.city}</td>
                    <td style={{ padding: '12px 16px 12px 0', fontSize: 13, color: GRAY }}>{row.industry}</td>
                    <td style={{ padding: '12px 16px 12px 0' }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: row.score >= 70 ? GREEN : row.score >= 40 ? AMBER : RED }}>{row.score}</span>
                    </td>
                    <td style={{ padding: '12px 0 12px 0', fontSize: 12, color: LGRAY }}>
                      {new Date(row.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
