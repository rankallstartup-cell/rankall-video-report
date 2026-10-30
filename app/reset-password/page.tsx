'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getBrowserClient } from '@/lib/supabase';
import Logo from '@/components/Logo';

const supabase = getBrowserClient();

// Friendly copy for Supabase's hash/query error codes (#error_code=otp_expired…).
function describeLinkError(code: string | null, description: string | null, fallback: string): string {
  if (code === 'otp_expired') return 'This reset link has expired or was already used. Request a new one below.';
  if (code === 'access_denied' && !description) return 'This reset link is invalid. Request a new one below.';
  return (description || fallback).replace(/\+/g, ' ');
}

function setRecoveryGate(action: 'start' | 'done') {
  return fetch('/reset-password/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  }).catch(() => undefined);
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  // ax84 follow-up: set when the reset link itself is bad — otherwise
  // the spinner below shows forever (a failed/expired code fires no
  // auth event, so nothing ever sets `ready`).
  const [linkError, setLinkError] = useState('');

  // Supabase emits PASSWORD_RECOVERY event when the reset link is clicked.
  // We wait for that before allowing the form to submit.
  useEffect(() => {
    // A failed/expired link arrives with error params — in the hash
    // fragment for the implicit flow (#error=...&error_description=...)
    // or the query string. Surface them instead of spinning.
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const queryParams = new URLSearchParams(window.location.search);
    const linkErr = hashParams.get('error') || queryParams.get('error');
    if (linkErr) {
      const code = hashParams.get('error_code') || queryParams.get('error_code');
      const desc = hashParams.get('error_description') || queryParams.get('error_description');
      setLinkError(describeLinkError(code, desc, linkErr));
      // Drop the error fragment so a reload doesn't keep re-showing it.
      try { window.history.replaceState(null, '', window.location.pathname); } catch { /* ignore */ }
      return;
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        // Implicit (hash) flow: arm the server-side gate so the recovery
        // session cannot reach /dashboard before a new password is set.
        void setRecoveryGate('start');
      }
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') { setReady(true); setLinkError(''); }
    });
    // Also check if already in an active session (e.g. user navigated back)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    // A failed/expired code fires no auth event — without a timeout the
    // spinner shows forever. After 10s with still no session, say so.
    const timer = setTimeout(() => {
      supabase.auth.getSession().then(({ data }) => {
        if (!data.session) setLinkError('This reset link is invalid or expired. Request a new one below.');
      });
    }, 10000);
    return () => { subscription.unsubscribe(); clearTimeout(timer); };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) { setError(err.message); return; }
    // Password changed — lift the recovery gate, then continue.
    await setRecoveryGate('done');
    router.push('/dashboard');
  }

  return (
    <div style={{ background: '#F6F6FB', minHeight: '100vh', fontFamily: "'Geist','Inter',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ background: '#fff', border: '1.5px solid #EDEDF4', borderRadius: 18, padding: '40px 36px', boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <Link href="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
              <Logo variant="dark" height={30} />
            </Link>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0A0A14', marginBottom: 8 }}>Set a new password</h1>
            <p style={{ fontSize: 14, color: '#55556A', lineHeight: 1.6 }}>Choose a strong password for your account.</p>
          </div>

          {linkError ? (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <p style={{ fontSize: 14, color: '#DC2626', lineHeight: 1.6, marginBottom: 16 }}>{linkError}</p>
              <Link href="/forgot-password" style={{ display: 'block', background: '#1B17FF', color: '#fff', borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
                Request a new reset link →
              </Link>
            </div>
          ) : !ready ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#55556A', fontSize: 14 }}>
              <div style={{ width: 24, height: 24, border: '3px solid #EDEDF4', borderTop: '3px solid #1B17FF', borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 1s linear infinite' }} />
              Verifying reset link…
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#0A0A14', marginBottom: 6 }}>New password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  autoFocus
                  style={{ width: '100%', border: `1.5px solid ${error && password !== confirm ? '#FCA5A5' : '#EDEDF4'}`, borderRadius: 10, padding: '12px 14px', fontSize: 14, color: '#0A0A14', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#0A0A14', marginBottom: 6 }}>Confirm password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repeat your new password"
                  required
                  style={{ width: '100%', border: `1.5px solid ${error && password !== confirm ? '#FCA5A5' : '#EDEDF4'}`, borderRadius: 10, padding: '12px 14px', fontSize: 14, color: '#0A0A14', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              {confirm && password !== confirm && (
                <p style={{ fontSize: 12, color: '#DC2626', marginBottom: 10, marginTop: -10 }}>Passwords do not match.</p>
              )}

              {error && (
                <p style={{ fontSize: 13, color: '#DC2626', marginBottom: 12 }}>{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || !password || !confirm}
                style={{ width: '100%', background: loading || !password || !confirm ? '#8A8AA3' : '#1B17FF', border: 'none', borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: loading || !password || !confirm ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
              >
                {loading ? 'Saving…' : 'Set new password →'}
              </button>
            </form>
          )}

          <p style={{ fontSize: 13, color: '#8A8AA3', textAlign: 'center', marginTop: 20 }}>
            <Link href="/login" style={{ color: '#1B17FF', fontWeight: 600, textDecoration: 'none' }}>Back to login</Link>
          </p>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
