'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase'
import { loginNextFromSearch } from '@/lib/authNext';
import Logo from '@/components/Logo';
const supabase = getBrowserClient();

// Read a ?next= destination from the URL (client-only, avoids a useSearchParams
// Suspense boundary). Validated (same-origin path only, lib/safeRedirect) —
// an unvalidated ?next=https://evil.com was an open redirect. Defaults to
// the dashboard.
function nextFromUrl(): string {
  if (typeof window === 'undefined') return '/dashboard';
  return loginNextFromSearch(window.location.search, window.location.origin);
}

// ax84: callback redirects expired/invalid auth links here with ?error=.
function errorFromUrl(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('error') || '';
}

const BG = '#F6F6FB';
const W = '#FFFFFF';
const NAVY = '#0A0A14';
const BORDER = '#EDEDF4';
const BLUE = '#1B17FF';
const GRAY = '#55556A';
const LGRAY = '#8A8AA3';
const RED = '#DC2626';

async function signInWithGoogle() {
  const supabase = getBrowserClient();
  // Thread ?next= through the OAuth callback (auth/callback already honors it).
  const next = nextFromUrl();
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.rankall.io';
  await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` } });
}
function SocialButtons() {
  return (
    <div style={{ marginBottom: 20 }}>
      <button onClick={signInWithGoogle} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '12px 16px', background: '#fff', border: '1.5px solid #EDEDF4', borderRadius: 10, fontSize: 14, fontWeight: 600, color: '#0A0A14', cursor: 'pointer', fontFamily: 'inherit' }}>
        <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#4285F4" d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.6 20-21 0-1.4-.1-2.7-.5-4z"/></svg>
        Continue with Google
      </button>
    </div>
  );
}

function OrDivider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
      <div style={{ flex: 1, height: 1, background: '#EDEDF4' }} />
      <span style={{ fontSize: 12, fontWeight: 600, color: '#8A8AA3' }}>or</span>
      <div style={{ flex: 1, height: 1, background: '#EDEDF4' }} />
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [next, setNext] = useState('/dashboard');
  const [showPassword, setShowPassword] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  // b88m…b88w: a logged-out visitor sent here from an /admin page is told
  // the page needs an admin account, instead of a bare sign-in form.
  const adminOnly = next.startsWith('/admin');

  // Capture ?next= and, if already logged in, redirect BEFORE rendering the form
  // (keep checkingSession=true on redirect so the form never flashes).
  useEffect(() => {
    const n = nextFromUrl();
    setNext(n);
    const urlErr = errorFromUrl();
    if (urlErr) setError(urlErr);
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace(n);
      } else {
        setCheckingSession(false);
      }
    });
  }, [router]);

  const inp = {
    background: BG,
    border: `1.5px solid ${BORDER}`,
    borderRadius: 10,
    padding: '13px 15px',
    fontSize: 15,
    color: NAVY,
    width: '100%',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
  };

  async function handleLogin() {
    if (!email || !password) { setError('Please fill in all fields.'); return; }
    setLoading(true);
    setError('');
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) { setError(signInError.message); setLoading(false); return; }
      router.push(next);
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  // While checking for an existing session, render a light loading state
  // matching the page (the old dark #0a0a1a flash read as a broken page).
  if (checkingSession) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', border: `3px solid ${BORDER}`, borderTopColor: BLUE, animation: 'login-spin 0.8s linear infinite' }} />
        <style>{`@keyframes login-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <div style={{ width: '100%', maxWidth: 440 }}>

        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Link href="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <Logo variant="dark" height={34} />
            </Link>
        </div>

        <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 18, padding: '36px 32px', boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: NAVY, marginBottom: 6 }}>Welcome back</h1>
          <p style={{ fontSize: 14, color: GRAY, marginBottom: adminOnly ? 12 : 24 }}>Sign in to your Rankall.io account</p>
          {adminOnly && (
            <p role="status" style={{ fontSize: 13, color: '#991B1B', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 12px', marginBottom: 20 }}>
              That page is for Rankall admins only. Sign in with an admin account to open it.
            </p>
          )}

          <SocialButtons />
          <OrDivider />

          {/* Real <form>: native Enter submit, password managers work. */}
          <form onSubmit={e => { e.preventDefault(); handleLogin(); }}>
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="login-email" style={{ fontSize: 12, fontWeight: 700, color: GRAY, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 7 }}>Email</label>
            <input id="login-email" style={inp} type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" autoFocus />
          </div>

          <div style={{ marginBottom: 8 }}>
            <label htmlFor="login-password" style={{ fontSize: 12, fontWeight: 700, color: GRAY, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 7 }}>Password</label>
            <div style={{ position: 'relative' }}>
              <input id="login-password" style={{ ...inp, paddingRight: 64 }} type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
              <button type="button" onClick={() => setShowPassword(s => !s)} aria-label={showPassword ? 'Hide password' : 'Show password'} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: BLUE, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: '4px 6px' }}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div style={{ textAlign: 'right', marginBottom: 20 }}>
            <Link href="/forgot-password" style={{ fontSize: 13, color: BLUE, textDecoration: 'none', fontWeight: 600 }}>Forgot password?</Link>
          </div>

          {error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
              <p style={{ fontSize: 13, color: RED, margin: 0 }}>{error}</p>
            </div>
          )}

          <button type="submit" disabled={loading} style={{ width: '100%', background: loading ? '#8A8AA3' : BLUE, border: 'none', borderRadius: 10, padding: '14px', fontSize: 15, fontWeight: 700, color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', boxShadow: loading ? 'none' : '0 4px 14px rgba(37,99,235,0.3)', transition: 'all 0.2s' }}>
            {loading ? 'Signing in...' : 'Sign In →'}
          </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: 14, color: GRAY, marginTop: 24 }}>
          No account yet? <Link href="/signup" style={{ color: BLUE, fontWeight: 700, textDecoration: 'none' }}>Start free trial →</Link>
        </p>
        <p style={{ textAlign: 'center', fontSize: 12, color: LGRAY, marginTop: 16 }}>
          <Link href="/terms" style={{ color: LGRAY, textDecoration: 'none' }}>Terms of Service</Link>
          {' · '}
          <Link href="/privacy" style={{ color: LGRAY, textDecoration: 'none' }}>Privacy Policy</Link>
        </p>

      </div>
    </div>
  );
}