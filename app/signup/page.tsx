'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase'
import { PRICE_LOCAL_USD, PRICE_PERSONAL_USD, PRICE_AGENCY_USD, tierPrice } from '@/lib/publicStats';
import { signupNextFromSearch } from '@/lib/authNext';
import { trialCapsSummary } from '@/lib/trialCaps';
import { signupPlanFromParam } from '@/lib/signupPlan';
import Logo from '@/components/Logo';
const supabase = getBrowserClient();

const BG = '#F6F6FB';
const W = '#FFFFFF';
const NAVY = '#0A0A14';
const BORDER = '#EDEDF4';
const BLUE = '#1B17FF';
const GREEN = '#059669';
const AMBER = '#D97706';
const GRAY = '#55556A';
const LGRAY = '#8A8AA3';
const RED = '#DC2626';

function SocialButtons({ onGoogle }: { onGoogle: () => void }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <button onClick={onGoogle} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '12px 16px', background: '#fff', border: '1.5px solid #EDEDF4', borderRadius: 10, fontSize: 14, fontWeight: 600, color: '#0A0A14', cursor: 'pointer', fontFamily: 'inherit' }}>
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

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  // b876: no plan is selected until ?plan= has been read, so /signup?plan=free
  // never paints the $39 plan first and a fast click can't continue with it.
  const [plan, setPlan] = useState('');
  const [planReady, setPlanReady] = useState(false);
  // Visible notice when ?plan= carries a value we don't offer — an unknown
  // param must never silently fall through to a paid default.
  const [planNotice, setPlanNotice] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', business: '', city: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Success messages (e.g. "confirmation resent") — never shown via the
  // red error box.
  const [notice, setNotice] = useState('');
  // Safe post-auth destination from ?next= (same-origin relative path only).
  const [nextPath, setNextPath] = useState<string | null>(null);

  // Referral capture: persist a ?ref= code for 30 days so it survives to checkout.
  // Read from window (client-only) to avoid a useSearchParams Suspense boundary.
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref) document.cookie = `rankall_ref=${encodeURIComponent(ref.toUpperCase())};max-age=2592000;path=/`;
  }, []);

  // Pre-select the plan from ?plan= (homepage pricing CTAs / pricing page links).
  // 'free' is a real plan (Free: $0 forever, 3 scans/month), so it preselects
  // the Free option, never a paid one. Unknown values show a visible notice
  // and clear the selection instead of silently falling through.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // ax6p: preserve the billing interval chosen on the pricing page so the
    // post-signup checkout doesn't silently downgrade annual to monthly.
    try {
      const iv = params.get('interval');
      localStorage.setItem('rankall_intended_interval', iv === 'annual' ? 'annual' : 'monthly');
    } catch { /* private mode */ }
    setNextPath(signupNextFromSearch(window.location.search, window.location.origin));
    const picked = signupPlanFromParam(params.get('plan'));
    setPlan(picked.plan);
    if (picked.notice) setPlanNotice(picked.notice);
    setPlanReady(true);
  }, []);

  const f = (k: string, v: string) => setForm(x => ({ ...x, [k]: v }));

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

  function nextStep() {
    // No plan selected (only reachable via an unknown ?plan= value): do not
    // advance — the user must pick a plan. Never advance with the $39
    // default behind the warning.
    if (step === 1 && !planReady) return;
    if (step === 1 && !plan) { if (!planNotice) setPlanNotice('Please pick a plan to continue.'); return; }
    if (step === 2) {
      if (!form.name || !form.email || !form.password) { setError('Please fill in all fields.'); return; }
      if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    }
    setError('');
    setStep(s => s + 1);
  }

  // Map the selected plan to the intent key stored for onboarding. Free maps
  // to 'free' — it must not become 'local_pro', or onboarding would prompt a
  // Free user to "complete checkout" for a paid plan they never picked.
  function planKeyFor(name: string) {
    const p = name.toLowerCase();
    return p === 'free' ? 'free' : p.includes('personal') ? 'personal_pro' : p.includes('agency') ? 'agency' : 'local_pro';
  }

  // /auth/callback?next=… — the callback re-validates `next` (ax84).
  function callbackUrl(extra?: Record<string, string>) {
    const u = new URL('/auth/callback', window.location.origin);
    if (nextPath) u.searchParams.set('next', nextPath);
    for (const [k, v] of Object.entries(extra ?? {})) u.searchParams.set(k, v);
    return u.toString();
  }

  async function handleSignup() {
    if (!form.business) { setError('Please enter your business name.'); return; }
    setLoading(true);
    setError('');
    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            full_name: form.name,
            business_name: form.business,
            city: form.city,
            plan,
          },
          // ax85: without this, Supabase sends the confirmation link to the
          // project's Site URL (localhost:3000 on staging = dead link).
          // /auth/callback exchanges the code/hash, then routes new users
          // to /onboarding and returning users to /dashboard. This URL must
          // be allowlisted in Supabase Auth > URL Configuration (Redirect
          // URLs) or Supabase falls back to the Site URL.
          // Carries a safe ?next= through email confirmation.
          emailRedirectTo: callbackUrl(),
        }
      });
      if (signUpError) { setError(signUpError.message); setLoading(false); return; }
      // Persist the picked plan as an intent so onboarding keeps it (Free
      // included — email signup previously lost the choice entirely).
      try { localStorage.setItem('rankall_intended_plan', planKeyFor(plan)); } catch { /* private mode */ }
      // Fire welcome email — non-blocking, don't await
      fetch('/api/welcome-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: signUpData.user?.id, email: form.email, businessName: form.business || null }),
      }).catch(() => {});
      setLoading(false);
      setStep(4);
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  // Prices are USD for every visitor (checkout charges the USD Stripe
  // price) and come from lib/publicStats.ts. The old list showed localized
  // country prices (e.g. £95) for a USD charge, listed Free twice, and
  // marked Agency as beta → a "Join Waitlist" mailto dead end while the
  // pricing page sells Agency as a live paid plan (ax6p).
  const PLANS = [
    { name: 'Free', price: 'Free', desc: '3 scans per month — no card required', beta: false },
    { name: 'Local Business', price: `$${PRICE_LOCAL_USD}/mo`, desc: 'Dentists, lawyers, restaurants', beta: false },
    { name: 'Product Pro', price: `$${tierPrice('Product Pro')}/mo`, desc: 'Products, e-commerce, Amazon', beta: true },
    { name: 'Personal Brand', price: `$${PRICE_PERSONAL_USD}/mo`, desc: 'Doctors, lawyers, consultants', beta: false },
    { name: 'Agency', price: `$${PRICE_AGENCY_USD}/mo`, desc: 'White-label + multi-client', beta: false },
  ];

  const selectedPlan = PLANS.find(p => p.name === plan);
  const isBetaPlan = selectedPlan?.beta ?? false;

  // Pass the SELECTED plan through OAuth as an INTENT (never as a granted
  // account_type — paid tiers are only granted by the Stripe billing webhook).
  const handleGoogleSignIn = async () => {
    const planKey = planKeyFor(plan);
    try { localStorage.setItem('rankall_intended_plan', planKey); } catch { /* private mode */ }
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      // ax83: origin-relative, like /login — the hardcoded production URL
      // sent staging Google signups to PROD's callback, where the code
      // (issued by the STAGING Supabase project) failed to exchange and
      // the user landed on prod /dashboard logged out, silently.
      options: { redirectTo: callbackUrl({ intended_plan: planKey }) },
    });
  };

  return (
    <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>

        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Link href="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <Logo variant="dark" height={34} />
            </Link>
        </div>

        {step === 1 && (
          <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 18, padding: '36px 32px', boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: NAVY, marginBottom: 8 }}>{plan === 'Free' ? 'Start free' : plan ? 'Start your 7-day free trial' : 'Pick a plan to get started'}</h1>
            <p style={{ fontSize: 14, color: GRAY, marginBottom: 28 }}>{plan === 'Free' ? 'No credit card required. Free forever.' : plan ? `Card required. Nothing charged until the trial ends. Cancel any time. ${trialCapsSummary(planKeyFor(plan))}` : 'Choose a plan below to continue.'}</p>
            {planNotice && <div role="alert" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}><p style={{ fontSize: 13, color: AMBER, margin: 0 }}>{planNotice}</p></div>}
            {PLANS.map(p => (
              <button key={p.name} onClick={() => { setPlan(p.name); setPlanNotice(''); }} style={{ width: '100%', background: plan === p.name ? (p.beta ? '#FFFBEB' : '#EEF0FF') : BG, border: `1.5px solid ${plan === p.name ? (p.beta ? AMBER : BLUE) : BORDER}`, borderRadius: 12, padding: '14px 16px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: plan === p.name ? (p.beta ? AMBER : BLUE) : NAVY, margin: 0 }}>{p.name}</p>
                    {p.beta && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: AMBER, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 100, padding: '2px 8px', whiteSpace: 'nowrap' }}>Join Beta</span>
                    )}
                  </div>
                  <p style={{ fontSize: 12, color: GRAY, margin: 0 }}>{p.desc}</p>
                </div>
                <span style={{ fontSize: 15, fontWeight: 800, color: plan === p.name ? (p.beta ? AMBER : BLUE) : NAVY, whiteSpace: 'nowrap', flexShrink: 0 }}>{p.price}</span>
              </button>
            ))}
            {isBetaPlan ? (
              <a
                href={`mailto:hello@rankall.io?subject=${encodeURIComponent(plan + ' Waitlist')}`}
                style={{ display: 'block', width: '100%', background: AMBER, border: 'none', borderRadius: 10, padding: 14, fontSize: 15, fontWeight: 700, color: '#fff', textDecoration: 'none', textAlign: 'center', marginTop: 8, boxShadow: `0 4px 14px ${AMBER}4D`, boxSizing: 'border-box' }}
              >
                Join Waitlist <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
            ) : plan ? (
              <button onClick={nextStep} style={{ width: '100%', background: BLUE, border: 'none', borderRadius: 10, padding: 14, fontSize: 15, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', marginTop: 8, boxShadow: '0 4px 14px rgba(37,99,235,0.3)' }}>
                Continue with {plan} <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
              </button>
            ) : (
              <button disabled style={{ width: '100%', background: GRAY, border: 'none', borderRadius: 10, padding: 14, fontSize: 15, fontWeight: 700, color: '#fff', cursor: 'not-allowed', fontFamily: 'inherit', marginTop: 8, boxSizing: 'border-box' }}>
                Pick a plan to continue
              </button>
            )}
            {plan === 'Agency' && (
              <p style={{ textAlign: 'center', fontSize: 13, color: GRAY, marginTop: 12 }}>
                Prefer a walkthrough first? <Link href="/agency/demo" style={{ color: BLUE, fontWeight: 700, textDecoration: 'none' }}>Book an Agency demo</Link>
              </p>
            )}
            <p style={{ textAlign: 'center', fontSize: 13, color: GRAY, marginTop: 16 }}>
              Already have an account? <Link href="/login" style={{ color: BLUE, fontWeight: 700, textDecoration: 'none' }}>Sign in</Link>
            </p>
            <p style={{ textAlign: 'center', fontSize: 12, color: LGRAY, marginTop: 12 }}>
              <Link href="/terms" style={{ color: LGRAY, textDecoration: 'none' }}>Terms of Service</Link>
              {' · '}
              <Link href="/privacy" style={{ color: LGRAY, textDecoration: 'none' }}>Privacy Policy</Link>
            </p>
          </div>
        )}

        {step === 2 && (
          <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 18, padding: '36px 32px', boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 6 }}>Create your account</h1>
            <p style={{ fontSize: 14, color: GRAY, marginBottom: 24 }}>{plan} — {plan === 'Free' ? 'Free forever' : '7-day free trial'}</p>
            <SocialButtons onGoogle={handleGoogleSignIn} />
            <OrDivider />
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: GRAY, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 7 }}>Full name</label>
              <input style={inp} value={form.name} onChange={e => f('name', e.target.value)} placeholder="Your name" autoFocus />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: GRAY, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 7 }}>Email</label>
              <input style={inp} type="email" value={form.email} onChange={e => f('email', e.target.value)} placeholder="you@company.com" />
            </div>
            <div style={{ marginBottom: 22 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: GRAY, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 7 }}>Password</label>
              <input style={inp} type="password" value={form.password} onChange={e => f('password', e.target.value)} placeholder="Min 8 characters" />
            </div>
            {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}><p style={{ fontSize: 13, color: RED, margin: 0 }}>{error}</p></div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setError(''); setStep(1); }} style={{ background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: 14, fontSize: 15, fontWeight: 700, color: GRAY, cursor: 'pointer', fontFamily: 'inherit' }}>Back</button>
              <button onClick={nextStep} style={{ flex: 1, background: BLUE, border: 'none', borderRadius: 10, padding: 14, fontSize: 15, fontWeight: 700, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(37,99,235,0.3)' }}>Continue <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 18, padding: '36px 32px', boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 6 }}>Tell us about your business</h1>
            <p style={{ fontSize: 14, color: GRAY, marginBottom: 28 }}>We use this to personalise your first scan.</p>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: GRAY, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 7 }}>Business name or website</label>
              <input style={inp} value={form.business} onChange={e => f('business', e.target.value)} placeholder="carolstreamsmiles.com" autoFocus />
            </div>
            <div style={{ marginBottom: 22 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: GRAY, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 7 }}>City</label>
              <input style={inp} value={form.city} onChange={e => f('city', e.target.value)} placeholder="Carol Stream, IL" />
            </div>
            {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}><p style={{ fontSize: 13, color: RED, margin: 0 }}>{error}</p></div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setError(''); setStep(2); }} disabled={loading} style={{ background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: 14, fontSize: 15, fontWeight: 700, color: GRAY, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>Back</button>
              <button onClick={handleSignup} disabled={loading} style={{ flex: 1, background: loading ? GRAY : BLUE, border: 'none', borderRadius: 10, padding: 14, fontSize: 15, fontWeight: 700, color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', boxShadow: loading ? 'none' : '0 4px 14px rgba(37,99,235,0.3)' }}>
              {loading ? 'Creating your account...' : (<>{plan === 'Free' ? 'Create Free Account' : 'Start Free Trial'} <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>)}
            </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div style={{ background: W, border: '1.5px solid #A7F3D0', borderRadius: 18, padding: '48px 36px', textAlign: 'center', boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
            <p style={{ fontSize: 52, marginBottom: 16 }}><svg viewBox="0 0 512 512" width="52" height="52" fill="#1B17FF" aria-hidden="true"><path d="M448 256A192 192 0 1 0 64 256a192 192 0 1 0 384 0zM0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256zm256 80a80 80 0 1 0 0-160 80 80 0 1 0 0 160zm0-224a144 144 0 1 1 0 288 144 144 0 1 1 0-288zM224 256a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"/></svg></p>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: NAVY, marginBottom: 10 }}>You are in. Check your email.</h1>
            <p style={{ fontSize: 14, color: GRAY, lineHeight: 1.7, marginBottom: 28 }}>
              We sent a confirmation to <strong style={{ color: NAVY }}>{form.email}</strong>. Click the link to verify your account — you will be signed in automatically and we will walk you through setup.
            </p>
            <button
              onClick={async () => {
                setError('');
                setNotice('');
                const { error: resendError } = await supabase.auth.resend({ type: 'signup', email: form.email, options: { emailRedirectTo: callbackUrl() } });
                if (resendError) setError(resendError.message);
                else setNotice('Confirmation email resent — check your inbox (and spam).');
              }}
              style={{ display: 'block', width: '100%', background: 'transparent', border: 'none', padding: '0 0 16px', fontSize: 14, fontWeight: 700, color: BLUE, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Resend confirmation email
            </button>
            {notice && <p role="status" style={{ fontSize: 13, color: GREEN, margin: '0 0 16px' }}>{notice}</p>}
            {error && <p role="alert" style={{ fontSize: 13, color: RED, margin: '0 0 16px' }}>{error}</p>}
            <Link href={nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : '/login'} style={{ background: BLUE, borderRadius: 10, padding: '14px 28px', fontSize: 15, fontWeight: 700, color: '#fff', textDecoration: 'none', display: 'inline-block', boxShadow: '0 4px 14px rgba(37,99,235,0.3)' }}>
              Go to Login <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
          </div>
        )}

      </div>
    </div>
  );
}
