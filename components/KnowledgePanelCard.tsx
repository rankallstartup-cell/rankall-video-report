interface KPCardProps {
  exists: boolean;
  claimed: boolean;
  completeness: number;
  title: string | null;
  missingFields: string[];
  score_contribution: number;
  error: string | null;
  isPro?: boolean;
  onGetFix?: () => void;
  photoUrl?: string | null;
}

export function KnowledgePanelCard({
  exists, claimed, completeness, title, missingFields, score_contribution, error, isPro = false, onGetFix, photoUrl,
}: KPCardProps) {
  if (error === 'SerpAPI not configured') return null;

  // b02d: a panel that was never checked (page fallback error
  // 'not checked') or whose lookup failed (any other non-null error)
  // is NOT a measured "Not Found" — it renders a not-checked state.
  const status = error && error !== 'SerpAPI not configured' ? 'not_checked' : !exists ? 'missing' : !claimed ? 'unclaimed' : completeness >= 70 ? 'verified' : 'partial';

  const statusConfig = {
    not_checked: { icon: <svg viewBox="0 0 512 512" width="20" height="20" fill="#64748b" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM175 175c9.4-9.4 24.6-9.4 33.9 0l47 47 47-47c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-47 47 47 47c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-47-47-47 47c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l47-47-47-47c-9.4-9.4-9.4-24.6 0-33.9z"/></svg>, label: 'Not Checked', color: '#64748b', bg: '#f8fafc', border: '#cbd5e1' },
    missing: { icon: <svg viewBox="0 0 512 512" width="20" height="20" fill="#dc2626" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM175 175c9.4-9.4 24.6-9.4 33.9 0l47 47 47-47c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-47 47 47 47c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-47-47-47 47c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l47-47-47-47c-9.4-9.4-9.4-24.6 0-33.9z"/></svg>, label: 'Not Found', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
    unclaimed: { icon: <svg viewBox="0 0 512 512" width="20" height="20" fill="#d97706" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg>, label: 'Unclaimed Panel', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
    partial: { icon: <svg viewBox="0 0 512 512" width="20" height="20" fill="#7c3aed" aria-hidden="true"><path d="M142.9 142.9c-17.5 17.5-30.1 38-37.8 59.8c-5.9 16.7-24.2 25.4-40.8 19.5s-25.4-24.2-19.5-40.8C55.6 150.7 73.2 122 97.6 97.6c87.2-87.2 228.3-87.5 315.8-1L455 55c6.9-6.9 17.2-8.9 26.2-5.2s14.8 12.5 14.8 22.2l0 128c0 13.3-10.7 24-24 24l-8.4 0c0 0 0 0 0 0L344 224c-9.7 0-18.5-5.8-22.2-14.8s-1.7-19.3 5.2-26.2l41.1-41.1c-62.6-61.5-163.1-61.2-225.3 1zM16 312c0-13.3 10.7-24 24-24l7.6 0 .7 0L168 288c9.7 0 18.5 5.8 22.2 14.8s1.7 19.3-5.2 26.2l-41.1 41.1c62.6 61.5 163.1 61.2 225.3-1c17.5-17.5 30.1-38 37.8-59.8c5.9-16.7 24.2-25.4 40.8-19.5s25.4 24.2 19.5 40.8c-10.8 30.6-28.4 59.3-52.9 83.8c-87.2 87.2-228.3 87.5-315.8 1L57 457c-6.9 6.9-17.2 8.9-26.2 5.2S16 449.7 16 440l0-119.6 0-.7 0-7.6z"/></svg>, label: 'Incomplete Panel', color: '#7c3aed', bg: '#faf5ff', border: '#e9d5ff' },
    verified: { icon: <svg viewBox="0 0 512 512" width="20" height="20" fill="#059669" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg>, label: 'Verified Entity', color: '#059669', bg: '#f0fdf4', border: '#bbf7d0' },
  }[status];

  return (
    <div style={{ border: `2px solid ${statusConfig.border}`, borderRadius: 12, padding: 20, background: statusConfig.bg, marginBottom: 16 }}>
      {/* Google Entity Card */}
      {exists && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16, padding: '16px', background: 'rgba(124,58,237,0.05)', borderRadius: 10 }}>
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={title ?? 'Knowledge Panel photo'}
              style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '2px solid #7c3aed', flexShrink: 0 }}
            />
          ) : (
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#e9d5ff', border: '2px solid #7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0 }}>
              <svg viewBox="0 0 448 512" width="28" height="28" fill="currentColor" aria-hidden="true"><path d="M224 256A128 128 0 1 0 224 0a128 128 0 1 0 0 256zm-45.7 48C79.8 304 0 383.8 0 482.3C0 498.7 13.3 512 29.7 512l388.6 0c16.4 0 29.7-13.3 29.7-29.7C448 383.8 368.2 304 269.7 304l-91.4 0z"/></svg>
            </div>
          )}
          <div>
            <p style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: 1, fontWeight: 700 }}>Google Knowledge Panel</p>
            {title && <p style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>{title}</p>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
              {claimed ? (
                <span style={{ background: '#065f46', color: '#6ee7b7', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}><svg viewBox="0 0 512 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg> Google Verified Entity</span>
              ) : (
                <span style={{ background: '#7c2d12', color: '#fca5a5', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}><svg viewBox="0 0 512 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/></svg> Not Yet Claimed</span>
              )}
              {completeness > 0 && (
                <span style={{ color: '#64748b', fontSize: 11 }}>{completeness}% complete</span>
              )}
            </div>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 20 }}>{statusConfig.icon}</span>
            <span style={{ fontWeight: 700, fontSize: 15, color: statusConfig.color }}>
              Entity Verification: {statusConfig.label}
            </span>
            {status === 'missing' && (
              <span style={{ background: '#7c3aed', color: '#fff', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
                <svg viewBox="0 0 576 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M309 106c11.4-7 19-19.7 19-34c0-22.1-17.9-40-40-40s-40 17.9-40 40c0 14.4 7.6 27 19 34L209.7 220.6c-9.1 18.2-32.7 23.4-48.6 10.7L72 160c5-6.7 8-15 8-24c0-22.1-17.9-40-40-40S0 113.9 0 136s17.9 40 40 40c.2 0 .5 0 .7 0L86.4 427.4c5.5 30.4 32 52.6 63 52.6l277.2 0c30.9 0 57.4-22.1 63-52.6L535.3 176c.2 0 .5 0 .7 0c22.1 0 40-17.9 40-40s-17.9-40-40-40s-40 17.9-40 40c0 9 3 17.3 8 24l-89.1 71.3c-15.9 12.7-39.5 7.5-48.6-10.7L309 106z"/></svg> FOUNDATION FIX
              </span>
            )}
          </div>
          {title && <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Panel: {title}</p>}
        </div>
        {score_contribution > 0 && (
          <div style={{ textAlign: 'center', background: '#fff', borderRadius: 8, padding: '6px 12px', border: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#059669' }}>+{score_contribution}</div>
            <div style={{ fontSize: 10, color: '#6b7280' }}>pts potential</div>
          </div>
        )}
      </div>

      {completeness > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
            <span>Panel completeness</span>
            <span>{completeness}%</span>
          </div>
          <div style={{ background: '#e5e7eb', borderRadius: 99, height: 6, overflow: 'hidden' }}>
            <div style={{ background: statusConfig.color, height: '100%', width: `${completeness}%`, borderRadius: 99, transition: 'width 1s ease' }} />
          </div>
        </div>
      )}

      {missingFields.length > 0 && status !== 'verified' && status !== 'not_checked' && (
        <ul style={{ margin: '8px 0 12px', paddingLeft: 18 }}>
          {missingFields.slice(0, 3).map((f, i) => (
            <li key={i} style={{ fontSize: 12, color: '#374151', marginBottom: 3 }}>{f}</li>
          ))}
        </ul>
      )}

      {status === 'missing' && (
        <p style={{ fontSize: 12, color: '#7c3aed', margin: '0 0 12px', fontWeight: 600 }}>
          +25 pts when complete. Start here before any other fix.
        </p>
      )}

      {status === 'not_checked' && (
        <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px', fontWeight: 600 }}>
          Knowledge Panel not checked for this scan. Rescan to check it.
        </p>
      )}

      {isPro ? (onGetFix ? (
        <button
          onClick={onGetFix}
          style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          {status === 'missing' ? (<>Get Knowledge Panel Kit <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>) : (<>See Improvement Plan <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>)}
        </button>
      ) : null) : (
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <button disabled style={{ background: '#e5e7eb', color: '#9ca3af', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'not-allowed', filter: 'blur(0px)' }}>
            Get Knowledge Panel Kit <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
          </button>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <a href="/pricing?plan=business" style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600, textDecoration: 'none' }}><svg viewBox="0 0 448 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M144 144l0 48 160 0 0-48c0-44.2-35.8-80-80-80s-80 35.8-80 80zM80 192l0-48C80 64.5 144.5 0 224 0s144 64.5 144 144l0 48 16 0c35.3 0 64 28.7 64 64l0 192c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 256c0-35.3 28.7-64 64-64l16 0z"/></svg> Upgrade to see fix plan</a>
          </div>
        </div>
      )}
    </div>
  );
}
