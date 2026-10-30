'use client';
import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase';
import { topCategories } from '@/lib/topCategories';

const BG = '#F6F6FB';
const W = '#FFFFFF';
const NAVY = '#0A0A14';
const BORDER = '#E7E7F0';
const PURPLE = '#1B17FF';
const GRAY = '#55556A';
const GREEN = '#059669';
const RED = '#DC2626';

const TOTAL_STEPS = 4;

// Top 20 growth-spending categories first (lib/topCategories), then the
// rest of the original list. The value is stored as-is in user metadata.
const TOP_INDUSTRIES = topCategories().map(c => c.label);
const OTHER_INDUSTRIES = [
  'Doctor / Medical', 'Restaurant / Food', 'Electrician', 'Salon / Spa',
  'Gym / Fitness', 'Insurance', 'Other',
];
const BUSINESS_TYPES = [
  { key: 'local', label: 'Local Business', desc: 'Serving customers in your area' },
  { key: 'personal', label: 'Personal Brand', desc: 'Doctor, lawyer, consultant, etc.' },
  { key: 'agency', label: 'Agency', desc: 'Manage multiple businesses' },
];
const CHALLENGES = [
  { key: 'competitors', label: 'Competitors show up instead of me' },
  { key: 'unknown', label: "I don't know if AI recommends me" },
  { key: 'trust', label: 'My trust score is low' },
  { key: 'reviews', label: 'I need more customer reviews' },
  { key: 'visibility', label: 'I just want more visibility' },
];
const URGENCIES = [
  { key: 'critical', label: (<><svg viewBox="0 0 448 512" width="14" height="14" fill="currentColor" aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 8 }}><path d="M159.3 5.4c7.8-7.3 19.9-7.2 27.7 .1c27.6 25.9 53.5 53.8 77.7 84c11-14.4 23.5-30.1 37-42.9c7.9-7.4 20.1-7.4 28 .1c34.6 33 63.9 76.6 84.5 118c20.3 40.8 33.8 82.5 33.8 111.9C448 404.2 348.2 512 224 512C98.4 512 0 404.1 0 276.5c0-38.4 17.8-85.3 45.4-131.7C73.3 97.7 112.7 48.6 159.3 5.4zM225.7 416c25.3 0 47.7-7 68.8-21c42.1-29.4 53.4-88.2 28.1-134.4c-4.5-9-16-9.6-22.5-2l-25.2 29.3c-6.6 7.6-18.5 7.4-24.7-.5c-16.5-21-46-58.5-62.8-79.8c-6.3-8-18.3-8.1-24.7-.1c-33.8 42.5-50.8 69.3-50.8 99.4C112 375.4 162.6 416 225.7 416z"/></svg> Critical — losing customers now</>) },
  { key: 'important', label: (<><svg viewBox="0 0 448 512" width="14" height="14" fill="currentColor" aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 8 }}><path d="M349.4 44.6c5.9-13.7 1.5-29.7-10.6-38.5s-28.6-8-39.9 1.8l-256 224c-10 8.8-13.6 22.9-8.9 35.3S50.7 288 64 288l111.5 0L98.6 467.4c-5.9 13.7-1.5 29.7 10.6 38.5s28.6 8 39.9-1.8l256-224c10-8.8 13.6-22.9 8.9-35.3s-16.6-20.7-30-20.7l-111.5 0L349.4 44.6z"/></svg> Important — want to fix this month</>) },
  { key: 'exploring', label: (<><svg viewBox="0 0 512 512" width="14" height="14" fill="currentColor" aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 8 }}><path d="M32 32c17.7 0 32 14.3 32 32l0 336c0 8.8 7.2 16 16 16l400 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L80 480c-44.2 0-80-35.8-80-80L0 64C0 46.3 14.3 32 32 32zM160 224c17.7 0 32 14.3 32 32l0 64c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32zm128-64l0 160c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-160c0-17.7 14.3-32 32-32s32 14.3 32 32zm64 32c17.7 0 32 14.3 32 32l0 96c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-96c0-17.7 14.3-32 32-32zM480 96l0 224c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-224c0-17.7 14.3-32 32-32s32 14.3 32 32z"/></svg> Exploring — just researching</>) },
];
const GOALS = [
  { key: 'chatgpt', label: 'Appear on ChatGPT when customers search my category' },
  { key: 'outrank', label: 'Outrank my top competitor on AI' },
  { key: 'trust70', label: 'Improve my trust score to 70+' },
  { key: 'platforms8', label: 'Get recommended on 8+ platforms' },
  { key: 'all', label: 'All of the above' },
];
const LOCATIONS = [
  { key: '1', label: '1 location' },
  { key: '2-5', label: '2–5 locations' },
  { key: '6+', label: '6+ locations (Agency plan)' },
];
const REFERRALS = [
  { key: 'google', label: 'Google Search' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'friend', label: 'Friend / Colleague' },
  { key: 'social', label: 'Social Media' },
  { key: 'other', label: 'Other' },
];

function OptionCard({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left', width: '100%', display: 'block',
        background: selected ? '#ECEBFF' : BG,
        border: `1.5px solid ${selected ? PURPLE : BORDER}`,
        borderRadius: 12, padding: '13px 16px', fontSize: 14, fontWeight: 600,
        color: selected ? PURPLE : NAVY, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = getBrowserClient();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [business, setBusiness] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [industry, setIndustry] = useState('');
  const [city, setCity] = useState('');
  const [challenge, setChallenge] = useState('');
  const [urgency, setUrgency] = useState('');
  const [goal, setGoal] = useState('');
  const [locations, setLocations] = useState('');
  const [referral, setReferral] = useState('');

  // b8aw: sign-in gate + already-onboarded + pre-fill labeling.
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [prefilled, setPrefilled] = useState(false);
  const [alreadyOnboarded, setAlreadyOnboarded] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      // b8aw: onboarding requires a signed-in account — the form saves
      // to user_metadata, which does not exist logged out.
      if (!data.user) {
        router.push('/login?next=/onboarding');
        return;
      }
      const m = data.user?.user_metadata as Record<string, unknown> | undefined;
      if (m?.business_name) setBusiness(String(m.business_name));
      if (m?.city) setCity(String(m.city));
      if (m?.business_name || m?.city) setPrefilled(true);
      if (m?.onboarded) setAlreadyOnboarded(true);
      // ax6m backstop: if /auth/callback's trial start failed, start it
      // here (idempotent — a second call is a no-op). Only for users who
      // have not finished onboarding; the trial clock starts at signup.
      if (!m?.onboarded) {
        fetch('/api/trial/start', { method: 'POST' }).catch(() => {});
      }
      setCheckingAuth(false);
    }).catch(() => {
      // Load failure: say so instead of silently showing an empty form.
      setError('We could not load your account details. You can still continue — your answers will save when you finish.');
      setCheckingAuth(false);
    });
  }, [supabase, router]);

  const inp = {
    background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '13px 15px',
    fontSize: 15, color: NAVY, width: '100%', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const,
  };
  const lbl = { fontSize: 13, fontWeight: 600, color: NAVY, display: 'block', marginBottom: 6 } as const;
  const sectionTitle = { fontSize: 14, fontWeight: 700, color: NAVY, margin: '0 0 10px' } as const;
  const primaryBtn = { flex: 1, background: PURPLE, color: '#fff', border: 'none', borderRadius: 10, padding: '13px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' } as const;
  const backBtn = { background: BG, color: GRAY, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '13px 18px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' } as const;

  function goNext() {
    setError('');
    if (step === 1 && (!business.trim() || !businessType || !industry || !city.trim())) { setError('Please complete all fields.'); return; }
    if (step === 2 && (!challenge || !urgency)) { setError('Please answer both questions.'); return; }
    if (step === 3 && (!goal || !locations)) { setError('Please answer both questions.'); return; }
    setStep(s => Math.min(TOTAL_STEPS, s + 1));
  }
  function goBack() { setError(''); setStep(s => Math.max(1, s - 1)); }

  async function finish() {
    if (!referral) { setError('Please pick one.'); return; }
    setSaving(true);
    setError('');
    try {
      await supabase.auth.updateUser({
        data: {
          business_name: business.trim(), business_type: businessType, industry, city: city.trim(),
          challenge, urgency, goal, locations, referral_source: referral, onboarded: true,
        },
      });
      // Keep the selected plan alive: read the intent (from callback metadata,
      // falling back to localStorage) and pass it to the homepage so it can
      // prompt an upgrade. Redirect into the homepage's ?q= auto-scan so the
      // first scan runs immediately (the homepage reads ?q=).
      let intendedPlan = 'local_pro';
      try {
        const { data } = await supabase.auth.getUser();
        intendedPlan =
          (data.user?.user_metadata?.intended_plan as string) ||
          localStorage.getItem('rankall_intended_plan') ||
          'local_pro';
      } catch { /* non-fatal */ }
      const scanQuery = `${business.trim()}${city.trim() ? ' in ' + city.trim() : ''}`;
      // Free intent gets no upgrade banner — there is no checkout to complete,
      // and the banner's "You selected a Pro plan" copy would be false.
      const showUpgrade = intendedPlan && intendedPlan !== 'free' ? `&show_upgrade=${intendedPlan}` : '';
      router.push(`/?q=${encodeURIComponent(scanQuery)}${showUpgrade}`);
    } catch {
      setError('Something went wrong. Please try again.');
      setSaving(false);
    }
  }

  // b8aw: while the session is being checked, show loading — never the
  // form (a logged-out visitor must not see Step 1).
  if (checkingAuth) {
    return (
      <div style={{ minHeight: '100vh', fontFamily: "'Geist','Inter',sans-serif", background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <p style={{ fontSize: 15, color: GRAY }}>Loading…</p>
      </div>
    );
  }

  // b8aw: an account that already finished onboarding gets a done state,
  // not first-run Step 1 again. "Edit" re-opens the form with the saved
  // values pre-filled. (Scans alone do not imply onboarding — the
  // onboarded flag is the source of truth.)
  if (alreadyOnboarded && !editingDetails) {
    return (
      <div style={{ minHeight: '100vh', fontFamily: "'Geist','Inter',sans-serif", background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ width: '100%', maxWidth: 480, background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '32px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, margin: '0 0 6px' }}>You&apos;re already set up</h1>
          <p style={{ fontSize: 14, color: GRAY, margin: '0 0 22px' }}>You completed onboarding. Your business details are saved.</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => router.push('/dashboard')} style={primaryBtn}>Go to Dashboard</button>
            <button onClick={() => setEditingDetails(true)} style={backBtn}>Edit your business details</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', fontFamily: "'Geist',ui-sans-serif,system-ui,sans-serif", background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <style>{`@keyframes stepFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }`}</style>
      <div style={{ width: '100%', maxWidth: 480, background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '32px', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
        {/* Progress */}
        <span style={{ fontSize: 12, fontWeight: 700, color: PURPLE, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Step {step} of {TOTAL_STEPS}</span>
        <div style={{ height: 6, background: '#EDE9FE', borderRadius: 100, margin: '8px 0 24px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(step / TOTAL_STEPS) * 100}%`, background: PURPLE, borderRadius: 100, transition: 'width 0.3s ease' }} />
        </div>

        <div key={step} style={{ animation: 'stepFade 0.25s ease' }}>
          {step === 1 && (
            <>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, margin: '0 0 6px' }}>About your business</h1>
              <p style={{ fontSize: 14, color: GRAY, margin: '0 0 22px' }}>So we can personalize your AI visibility.</p>
              {prefilled && (
                <p style={{ fontSize: 13, color: GRAY, background: BG, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px', margin: '0 0 16px' }}>Pre-filled from your account — edit any field that is out of date.</p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={lbl}>Business name</label>
                  <input value={business} onChange={e => setBusiness(e.target.value)} placeholder="e.g. Chicago Dental Arts" style={inp} />
                </div>
                <div>
                  <p style={sectionTitle}>Business type</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {BUSINESS_TYPES.map(t => (
                      <OptionCard key={t.key} selected={businessType === t.key} onClick={() => setBusinessType(t.key)}>
                        <span style={{ fontWeight: 700 }}>{t.label}</span>
                        <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: GRAY, marginTop: 2 }}>{t.desc}</span>
                      </OptionCard>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={lbl}>Industry</label>
                  <select value={industry} onChange={e => setIndustry(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                    <option value="">Select your industry…</option>
                    <optgroup label="Top categories">
                      {TOP_INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                    </optgroup>
                    <optgroup label="Other industries">
                      {OTHER_INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label style={lbl}>City</label>
                  <input value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Chicago IL" style={inp} />
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, margin: '0 0 6px' }}>Your AI visibility challenge</h1>
              <p style={{ fontSize: 14, color: GRAY, margin: '0 0 22px' }}>Help us focus on what matters to you.</p>
              <p style={sectionTitle}>What&apos;s your biggest challenge?</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
                {CHALLENGES.map(c => (
                  <OptionCard key={c.key} selected={challenge === c.key} onClick={() => setChallenge(c.key)}>{c.label}</OptionCard>
                ))}
              </div>
              <p style={sectionTitle}>How urgent is this for you?</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {URGENCIES.map(u => (
                  <OptionCard key={u.key} selected={urgency === u.key} onClick={() => setUrgency(u.key)}>{u.label}</OptionCard>
                ))}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, margin: '0 0 6px' }}>Your goal</h1>
              <p style={{ fontSize: 14, color: GRAY, margin: '0 0 22px' }}>What would success look like?</p>
              <p style={sectionTitle}>What would success look like?</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
                {GOALS.map(g => (
                  <OptionCard key={g.key} selected={goal === g.key} onClick={() => setGoal(g.key)}>{g.label}</OptionCard>
                ))}
              </div>
              <p style={sectionTitle}>How many locations do you have?</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {LOCATIONS.map(l => (
                  <OptionCard key={l.key} selected={locations === l.key} onClick={() => setLocations(l.key)}>{l.label}</OptionCard>
                ))}
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, margin: '0 0 6px' }}>Quick setup</h1>
              <p style={{ fontSize: 14, color: GRAY, margin: '0 0 22px' }}>One last thing, then we&apos;ll scan your business.</p>
              <p style={sectionTitle}>How did you hear about Rankall?</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
                {REFERRALS.map(r => (
                  <OptionCard key={r.key} selected={referral === r.key} onClick={() => setReferral(r.key)}>{r.label}</OptionCard>
                ))}
              </div>
              <div style={{ background: '#F0FDF4', border: '1px solid #A7F3D0', borderRadius: 12, padding: '16px 18px' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#166534', margin: '0 0 8px' }}>Here&apos;s what happens next</p>
                {[
                  'We’ll scan your business now',
                  'You’ll get your AI score in about 90 seconds',
                  'We’ll email you a weekly report',
                ].map((t, i) => (
                  <p key={i} style={{ fontSize: 13, color: '#166534', margin: '4px 0', display: 'flex', gap: 8 }}>
                    <span style={{ color: GREEN, flexShrink: 0, display: 'inline-flex' }}><svg viewBox="0 0 512 512" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg></span>{t}
                  </p>
                ))}
              </div>
            </>
          )}
        </div>

        {error && <p style={{ fontSize: 13, color: RED, marginTop: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          {step > 1 && <button onClick={goBack} style={backBtn}><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L109.2 288 416 288c17.7 0 32-14.3 32-32s-14.3-32-32-32l-306.7 0L214.6 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160z"/></svg> Back</button>}
          {step < TOTAL_STEPS ? (
            <button onClick={goNext} style={primaryBtn}>Continue <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></button>
          ) : (
            <button onClick={finish} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Setting up…' : (<>Run My First Scan <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
