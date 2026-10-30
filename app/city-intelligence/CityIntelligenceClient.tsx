'use client';

import { useState } from 'react';
import { getBrowserClient } from '@/lib/supabase';

const BG = '#F6F6FB';
const W = '#FFFFFF';
const NAVY = '#0A0A14';
const BORDER = '#EDEDF4';
const BLUE = '#1B17FF';
const GREEN = '#059669';
const GRAY = '#55556A';
const LGRAY = '#8A8AA3';


export default function CityIntelligenceClient() {
  const [form, setForm] = useState({ name: '', title: '', city: '', organisation: '', email: '' });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const f = (k: string, v: string) => setForm(x => ({ ...x, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email || !form.city) { setError('Please fill in name, email, and city.'); return; }
    setLoading(true);
    setError('');
    try {
      const supabase = getBrowserClient();
      const { error: dbErr } = await supabase.from('waitlist_signups').insert({
        name: form.name,
        email: form.email,
        city: form.city,
        organisation: form.organisation,
        title_role: form.title,
        plan_type: 'government',
        created_at: new Date().toISOString(),
      });
      if (dbErr) throw dbErr;
      setDone(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const MOCK_SCORES = [
    { label: 'Restaurants', score: 67, color: GREEN },
    { label: 'Hotels & Lodging', score: 43, color: BLUE },
    { label: 'Legal Services', score: 28, color: '#D97706' },
  ];

  const PROBLEMS = [
    { icon: <svg viewBox="0 0 576 512" width="30" height="30" fill="#1B17FF" aria-hidden="true"><path d="M384 476.1L192 421.2l0-385.3L384 90.8l0 385.3zm32-1.2l0-386.5L543.1 37.5c15.8-6.3 32.9 5.3 32.9 22.3l0 334.8c0 9.8-6 18.6-15.1 22.3L416 474.8zM15.1 95.1L160 37.2l0 386.5L32.9 474.5C17.1 480.8 0 469.2 0 452.2L0 117.4c0-9.8 6-18.6 15.1-22.3z"/></svg>, title: 'Competing cities win', body: 'When AI recommends where to visit or invest, it often picks neighbouring cities with better-optimised businesses — not yours.' },
    { icon: <svg viewBox="0 0 576 512" width="30" height="30" fill="#1B17FF" aria-hidden="true"><path d="M547.6 103.8L490.3 13.1C485.2 5 476.1 0 466.4 0L109.6 0C99.9 0 90.8 5 85.7 13.1L28.3 103.8c-29.6 46.8-3.4 111.9 51.9 119.4c4 .5 8.1 .8 12.1 .8c26.1 0 49.3-11.4 65.2-29c15.9 17.6 39.1 29 65.2 29c26.1 0 49.3-11.4 65.2-29c15.9 17.6 39.1 29 65.2 29c26.2 0 49.3-11.4 65.2-29c16 17.6 39.1 29 65.2 29c4.1 0 8.1-.3 12.1-.8c55.5-7.4 81.8-72.5 52.1-119.4zM499.7 254.9c0 0 0 0-.1 0c-5.3 .7-10.7 1.1-16.2 1.1c-12.4 0-24.3-1.9-35.4-5.3L448 384l-320 0 0-133.4c-11.2 3.5-23.2 5.4-35.6 5.4c-5.5 0-11-.4-16.3-1.1l-.1 0c-4.1-.6-8.1-1.3-12-2.3L64 384l0 64c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-64 0-131.4c-4 1-8 1.8-12.3 2.3z"/></svg>, title: 'Local businesses invisible', body: 'Your small businesses pay taxes and employ residents, but AI sends customers to chains and online alternatives that dominate AI training data.' },
    { icon: <svg viewBox="0 0 576 512" width="30" height="30" fill="#1B17FF" aria-hidden="true"><path d="M384 352c-17.7 0-32 14.3-32 32s14.3 32 32 32l160 0c17.7 0 32-14.3 32-32l0-160c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 82.7L342.6 137.4c-12.5-12.5-32.8-12.5-45.3 0L192 242.7 54.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0L320 205.3 466.7 352 384 352z"/></svg>, title: 'No data to act on', body: 'Economic development teams have no way to measure or improve AI visibility across the local business ecosystem. Until now.' },
  ];

  const FEATURES = [
    { title: 'City AI Visibility Score', desc: 'Aggregate score across all industries, benchmarked against similar cities.' },
    { title: 'Industry Breakdown', desc: 'Restaurants vs hotels vs retail vs services — where you\'re winning and losing.' },
    { title: 'Competitor City Comparison', desc: 'See exactly how you rank versus neighbouring and peer cities.' },
    { title: 'Business-level Drill-down', desc: 'Identify which specific businesses drag category scores down.' },
    { title: 'Visitor Intent Analysis', desc: 'What are people actually asking AI about your city? Full query breakdown.' },
    { title: 'Economic Impact Estimates', desc: 'Revenue at stake from AI invisibility, modelled by industry and category.' },
  ];

  const USE_CASES = [
    { title: 'Tourism Board', desc: 'Know exactly which hotels and restaurants visitors are finding via AI — and which competitor cities are capturing that traffic instead.' },
    { title: 'Economic Development', desc: 'Show investors your city\'s AI visibility score as part of your pitch deck. Quantify the opportunity.' },
    { title: 'Chamber of Commerce', desc: 'Offer members a city-wide AI visibility audit as a member benefit. Drive membership value with real data.' },
  ];

  const TIERS = [
    { name: 'Small City', sub: 'Under 100k population', price: 'From $2,000/mo', features: ['3 industry categories', 'Quarterly reports', 'Peer city comparison'] },
    { name: 'Mid-size City', sub: '100k–500k population', price: 'From $5,000/mo', features: ['All industry categories', 'Monthly reports', 'Business drill-down', 'Investor-ready PDF'] },
    { name: 'Major City', sub: '500k+ population', price: 'Custom', features: ['Full ecosystem mapping', 'Weekly reports', 'API access', 'Dedicated analyst', 'Executive dashboard'] },
  ];

  const inp = { background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px', fontSize: 15, color: NAVY, width: '100%', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const };

  return (
    <div style={{ background: BG, minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>

      {/* Header: the shared site header (components/SiteChrome.tsx) renders above. */}

      {/* HERO */}
      <section style={{ background: 'linear-gradient(180deg,#EEF0FF 0%,#F6F6FB 100%)', padding: '72px 40px 56px', textAlign: 'center', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ display: 'inline-block', background: '#EEF0FF', border: '1.5px solid #C9D4FF', borderRadius: 100, padding: '6px 18px', marginBottom: 24 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: BLUE, letterSpacing: '0.08em', textTransform: 'uppercase' }}>For City Governments & Economic Development</span>
        </div>
        <h1 style={{ fontSize: 'clamp(28px,4vw,50px)', fontWeight: 900, color: NAVY, letterSpacing: '-1.5px', maxWidth: 760, margin: '0 auto 20px', lineHeight: 1.1 }}>
          How AI-visible are the businesses in your city?
        </h1>
        <p style={{ fontSize: 17, color: GRAY, maxWidth: 580, margin: '0 auto 40px', lineHeight: 1.6 }}>
          When visitors, residents, and investors ask AI "where should I eat / stay / invest in your city" — who appears?
        </p>
        {/* Moved here from the old page-level navbar. */}
        <a href="#city-form" style={{ display: 'inline-block', background: BLUE, color: W, borderRadius: 8, padding: '12px 24px', fontWeight: 700, fontSize: 15, textDecoration: 'none', marginBottom: 40 }}>Request City Report</a>
        <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '24px 28px', maxWidth: 480, margin: '0 auto', textAlign: 'left', boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: LGRAY, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Sample City AI Visibility</p>
          {MOCK_SCORES.map(s => (
            <div key={s.label} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{s.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.score}/100</span>
              </div>
              <div style={{ background: BORDER, borderRadius: 100, height: 8 }}>
                <div style={{ background: s.color, borderRadius: 100, height: 8, width: `${s.score}%` }} />
              </div>
            </div>
          ))}
          <p style={{ fontSize: 12, color: LGRAY, margin: '4px 0 0', lineHeight: 1.6 }}>
            Illustrative example only — these figures are not measured from a real city. A City Intelligence report scores real businesses in your city from live AI scans, published only for groups with at least 5 businesses scanned — the same rule as our public benchmarks.
          </p>
        </div>
      </section>

      {/* PROBLEM */}
      <section style={{ padding: '72px 40px', maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ fontSize: 'clamp(22px,3vw,36px)', fontWeight: 800, color: NAVY, textAlign: 'center', marginBottom: 48 }}>Cities are losing economic visibility to AI</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 24 }}>
          {PROBLEMS.map(p => (
            <div key={p.title} style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '28px 24px' }}>
              <div style={{ fontSize: 32, marginBottom: 14 }}>{p.icon}</div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: NAVY, marginBottom: 10 }}>{p.title}</h3>
              <p style={{ fontSize: 14, color: GRAY, lineHeight: 1.7, margin: 0 }}>{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* WHAT CITIES GET */}
      <section style={{ background: '#EEF0FF', borderTop: `1px solid #C9D4FF`, borderBottom: `1px solid #C9D4FF`, padding: '72px 40px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(22px,3vw,36px)', fontWeight: 800, color: NAVY, textAlign: 'center', marginBottom: 48 }}>What cities get</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 20 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '22px 20px' }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: BLUE, marginBottom: 8 }}>{f.title}</h3>
                <p style={{ fontSize: 13, color: GRAY, lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* USE CASES */}
      <section style={{ padding: '72px 40px', maxWidth: 1100, margin: '0 auto' }}>
        <h2 style={{ fontSize: 'clamp(22px,3vw,36px)', fontWeight: 800, color: NAVY, textAlign: 'center', marginBottom: 48 }}>Who uses City Intelligence</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 24 }}>
          {USE_CASES.map(u => (
            <div key={u.title} style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '28px 24px' }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: NAVY, marginBottom: 10 }}>{u.title}</h3>
              <p style={{ fontSize: 14, color: GRAY, lineHeight: 1.7, margin: 0 }}>{u.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section style={{ background: NAVY, padding: '72px 40px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(22px,3vw,36px)', fontWeight: 800, color: W, textAlign: 'center', marginBottom: 12 }}>City Intelligence pricing</h2>
          <p style={{ fontSize: 15, color: '#8A8AA3', textAlign: 'center', marginBottom: 48 }}>All tiers include full industry breakdown, competitor city comparison, and monthly executive report.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 20 }}>
            {TIERS.map((t, i) => (
              <div key={t.name} style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${i === 1 ? BLUE : 'rgba(255,255,255,0.12)'}`, borderRadius: 16, padding: '28px 24px' }}>
                <p style={{ fontSize: 16, fontWeight: 800, color: W, marginBottom: 4 }}>{t.name}</p>
                <p style={{ fontSize: 12, color: '#8A8AA3', marginBottom: 16 }}>{t.sub}</p>
                <p style={{ fontSize: 24, fontWeight: 900, color: BLUE, marginBottom: 20 }}>{t.price}</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {t.features.map(feat => (
                    <li key={feat} style={{ display: 'flex', gap: 8, marginBottom: 10, fontSize: 13, color: '#CBD5E1' }}>
                      <span style={{ color: GREEN, fontWeight: 700, flexShrink: 0, display: 'inline-flex' }}><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg></span>{feat}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FORM */}
      <section id="city-form" style={{ padding: '72px 40px', maxWidth: 600, margin: '0 auto' }}>
        <h2 style={{ fontSize: 'clamp(22px,3vw,32px)', fontWeight: 800, color: NAVY, textAlign: 'center', marginBottom: 12 }}>Request a City Intelligence Report</h2>
        <p style={{ fontSize: 15, color: GRAY, textAlign: 'center', marginBottom: 36 }}>We'll run a free sample scan of 3 industries in your city and share the results.</p>
        {done ? (
          <div style={{ background: '#ECFDF5', border: '1.5px solid #A7F3D0', borderRadius: 14, padding: '32px', textAlign: 'center' }}>
            <p style={{ fontSize: 24, marginBottom: 12, display: 'flex', justifyContent: 'center' }}><svg viewBox="0 0 640 512" width="24" height="24" fill="#1B17FF" aria-hidden="true"><path d="M480 48c0-26.5-21.5-48-48-48L336 0c-26.5 0-48 21.5-48 48l0 48-64 0 0-72c0-13.3-10.7-24-24-24s-24 10.7-24 24l0 72-64 0 0-72c0-13.3-10.7-24-24-24S64 10.7 64 24l0 72L48 96C21.5 96 0 117.5 0 144l0 96L0 464c0 26.5 21.5 48 48 48l256 0 32 0 96 0 160 0c26.5 0 48-21.5 48-48l0-224c0-26.5-21.5-48-48-48l-112 0 0-144zm96 320l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16zM240 416l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16zM128 400c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16l0 32zM560 256c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16l32 0zM256 176l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16zM112 160c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16l32 0zM256 304c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16l0 32zM112 320l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16zm304-48l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16zM400 64c8.8 0 16 7.2 16 16l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16l32 0zm16 112l0 32c0 8.8-7.2 16-16 16l-32 0c-8.8 0-16-7.2-16-16l0-32c0-8.8 7.2-16 16-16l32 0c8.8 0 16 7.2 16 16z"/></svg></p>
            <p style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 8 }}>Report requested!</p>
            <p style={{ fontSize: 14, color: GRAY }}>We'll send your sample city report within 48 hours.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 18, padding: '32px 28px', boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
            {[
              { label: 'Full name', key: 'name', type: 'text', placeholder: 'Your full name' },
              { label: 'Title / Role', key: 'title', type: 'text', placeholder: 'Your title or role' },
              { label: 'City', key: 'city', type: 'text', placeholder: 'Your city, state' },
              { label: 'Organisation', key: 'organisation', type: 'text', placeholder: 'Your organisation' },
              { label: 'Email', key: 'email', type: 'email', placeholder: 'you@yourcity.gov' },
            ].map(field => (
              <div key={field.key} style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: GRAY, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 7 }}>{field.label}</label>
                <input
                  style={inp}
                  type={field.type}
                  placeholder={field.placeholder}
                  value={(form as any)[field.key]}
                  onChange={e => f(field.key, e.target.value)}
                />
              </div>
            ))}
            {error && <p style={{ fontSize: 13, color: '#DC2626', marginBottom: 14 }}>{error}</p>}
            <button type="submit" disabled={loading} style={{ width: '100%', background: loading ? GRAY : BLUE, border: 'none', borderRadius: 10, padding: 14, fontSize: 15, fontWeight: 700, color: W, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {loading ? 'Submitting...' : (<>Request Free Sample Report <svg viewBox="0 0 448 512" width="14" height="14" fill="#fff" aria-hidden="true" style={{verticalAlign: '-2px', marginLeft: 6}}><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></>)}
            </button>
          </form>
        )}
      </section>

      {/* Footer: the shared site footer (components/SiteChrome.tsx) renders below. */}
    </div>
  );
}
