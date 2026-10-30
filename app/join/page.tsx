'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const C = {
  bg: '#FFFFFF',
  surface: '#F6F6FB',
  border: '#EDEDF4',
  navy: '#0A0A14',
  blue: '#1B17FF',
  green: '#059669',
  red: '#DC2626',
  gray: '#55556A',
  lgray: '#8A8AA3',
};

function getBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

interface Invite {
  client_email: string;
  client_name?: string;
  business_name?: string;
}

function JoinContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [invite, setInvite] = useState<Invite | null>(null);
  const [tokenError, setTokenError] = useState('');
  const [loading, setLoading] = useState(true);

  // Auth form
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setTokenError('No invite token provided.');
      setLoading(false);
      return;
    }
    fetch(`/api/agency/invite?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => {
        if (d.invite) {
          setInvite(d.invite);
          setEmail(d.invite.client_email || '');
        } else {
          setTokenError(d.error || 'Invalid or expired invite link.');
        }
      })
      .catch(() => setTokenError('Could not validate invite. Please try again.'))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    setSubmitting(true);

    const sb = getBrowserClient();
    let userId: string | null = null;
    let accessToken: string | null = null;

    try {
      if (mode === 'signup') {
        // ax85: same confirmation redirect as /signup — without it the
        // link goes to the project's Site URL (localhost:3000 on staging).
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
        if (error) throw error;
        userId = data.user?.id ?? null;
        accessToken = data.session?.access_token ?? null;
      } else {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        userId = data.user?.id ?? null;
        accessToken = data.session?.access_token ?? null;
      }

      // Mark invite used
      if (token) {
        await fetch('/api/agency/invite/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
          body: JSON.stringify({ token }),
        });
      }

      setDone(true);
      setTimeout(() => router.push('/dashboard'), 2000);
    } catch (err: any) {
      setAuthError(err?.message || 'Authentication failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: C.bg }}>
        <p style={{ color: C.gray, fontSize: 15 }}>Validating invite…</p>
      </div>
    );
  }

  if (tokenError) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: C.bg }}>
        <div style={{ maxWidth: 400, textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}><svg viewBox="0 0 640 512" width="48" height="48" fill="#1B17FF" aria-hidden="true"><path d="M579.8 267.7c56.5-56.5 56.5-148 0-204.5c-50-50-128.8-56.5-186.3-15.4l-1.6 1.1c-14.4 10.3-17.7 30.3-7.4 44.6s30.3 17.7 44.6 7.4l1.6-1.1c32.1-22.9 76-19.3 103.8 8.6c31.5 31.5 31.5 82.5 0 114L422.3 334.8c-31.5 31.5-82.5 31.5-114 0c-27.9-27.9-31.5-71.8-8.6-103.8l1.1-1.6c10.3-14.4 6.9-34.4-7.4-44.6s-34.4-6.9-44.6 7.4l-1.1 1.6C206.5 251.2 213 330 263 380c56.5 56.5 148 56.5 204.5 0L579.8 267.7zM60.2 244.3c-56.5 56.5-56.5 148 0 204.5c50 50 128.8 56.5 186.3 15.4l1.6-1.1c14.4-10.3 17.7-30.3 7.4-44.6s-30.3-17.7-44.6-7.4l-1.6 1.1c-32.1 22.9-76 19.3-103.8-8.6C74 372 74 321 105.5 289.5L217.7 177.2c31.5-31.5 82.5-31.5 114 0c27.9 27.9 31.5 71.8 8.6 103.9l-1.1 1.6c-10.3 14.4-6.9 34.4 7.4 44.6s34.4 6.9 44.6-7.4l1.1-1.6C433.5 260.8 427 182 377 132c-56.5-56.5-148-56.5-204.5 0L60.2 244.3z"/></svg></div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.navy, marginBottom: 12 }}>Invite Not Found</h1>
          <p style={{ color: C.gray, fontSize: 15, marginBottom: 12 }}>{tokenError}</p>
          {/* b8ar: /join is the agency-client invite flow (agency_invites table),
              not public signup — the old state was a dead end. Explain what
              this page is and give every visitor a working path. */}
          <p style={{ color: C.gray, fontSize: 15, marginBottom: 24 }}>
            This page is for clients accepting an invitation from their agency. Invites arrive as a link
            from your agency — open that link to join. Don&apos;t have an invite?{' '}
            <a href="/signup" style={{ color: C.blue, textDecoration: 'none', fontWeight: 600 }}>Sign up for Rankall</a>
            {' '}or{' '}
            <a href="/login" style={{ color: C.blue, textDecoration: 'none', fontWeight: 600 }}>log in</a>
            {' '}to your existing account.
          </p>
          <a href="/" style={{ color: C.blue, fontSize: 14, textDecoration: 'none', fontWeight: 600 }}><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L109.2 288 416 288c17.7 0 32-14.3 32-32s-14.3-32-32-32l-306.7 0L214.6 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160z"/></svg> Back to Rankall.io</a>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: C.bg }}>
        <div style={{ maxWidth: 400, textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}><svg viewBox="0 0 512 512" width="48" height="48" fill="#059669" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg></div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.navy, marginBottom: 12 }}>You're in!</h1>
          <p style={{ color: C.gray, fontSize: 15 }}>Redirecting to your dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: C.surface, padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 440, background: C.bg, border: `1.5px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
        {/* Header */}
        <div style={{ background: C.navy, padding: '28px 32px' }}>
          <p style={{ color: '#8A8AA3', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Agency Invite</p>
          <h1 style={{ color: '#FFFFFF', fontSize: 22, fontWeight: 700, lineHeight: 1.3 }}>
            {invite?.business_name ? `Join ${invite.business_name} on Rankall` : "You've been invited to Rankall"}
          </h1>
          {invite?.client_name && (
            <p style={{ color: '#8A8AA3', fontSize: 14, marginTop: 8 }}>Hi {invite.client_name} 👋</p>
          )}
        </div>

        {/* Form */}
        <div style={{ padding: '28px 32px' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            {(['signup', 'signin'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setAuthError(''); }}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 8, border: `1.5px solid ${mode === m ? C.blue : C.border}`,
                  background: mode === m ? '#EEF0FF' : C.bg, color: mode === m ? C.blue : C.gray,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {m === 'signup' ? 'Create Account' : 'Sign In'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.gray, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                style={{ width: '100%', padding: '10px 13px', border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 14, color: C.navy, background: C.surface, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.gray, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder={mode === 'signup' ? 'Min. 8 characters' : 'Your password'}
                style={{ width: '100%', padding: '10px 13px', border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 14, color: C.navy, background: C.surface, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
            </div>

            {authError && (
              <p style={{ fontSize: 13, color: C.red, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '9px 13px', margin: 0 }}>{authError}</p>
            )}

            <button
              type="submit"
              disabled={submitting || !email || !password}
              style={{
                marginTop: 4, padding: '12px 0', background: submitting ? C.lgray : C.blue, color: '#fff',
                border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', transition: 'background 0.15s',
              }}
            >
              {submitting ? 'Please wait…' : mode === 'signup' ? 'Create Account & Join' : 'Sign In & Join'}
            </button>
          </form>

          <p style={{ marginTop: 20, fontSize: 12, color: C.lgray, textAlign: 'center' }}>
            By joining, you agree to Rankall's{' '}
            <a href="/terms" style={{ color: C.blue, textDecoration: 'none' }}>Terms</a>
            {' '}&amp;{' '}
            <a href="/privacy" style={{ color: C.blue, textDecoration: 'none' }}>Privacy Policy</a>.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <p style={{ color: '#55556A' }}>Loading…</p>
      </div>
    }>
      <JoinContent />
    </Suspense>
  );
}
