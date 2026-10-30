'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { getCountryConfig, type CountryConfig } from '@/lib/countryConfig';

// V2 design tokens
const INK = '#0A0A14';
const BLUE = '#1B17FF';
const BODY = '#55556A';
const BG = '#F6F6FB';
const CARD = '#FFFFFF';
const BORDER = '#EDEDF4';
const DIM = '#8A8AA3';
const GREEN = '#059669';

const BENEFITS = [
  { icon: <svg viewBox="0 0 448 512" width="24" height="24" fill="#1B17FF" aria-hidden="true"><path d="M0 80L0 229.5c0 17 6.7 33.3 18.7 45.3l176 176c25 25 65.5 25 90.5 0L418.7 317.3c25-25 25-65.5 0-90.5l-176-176c-12-12-28.3-18.7-45.3-18.7L48 32C21.5 32 0 53.5 0 80zm112 32a32 32 0 1 1 0 64 32 32 0 1 1 0-64z"/></svg>, title: 'Your brand. Not ours.',            desc: 'Your logo, colours, domain. Clients never see Rankall.io.' },
  { icon: <svg viewBox="0 0 576 512" width="24" height="24" fill="#1B17FF" aria-hidden="true"><path d="M0 112.5L0 422.3c0 18 10.1 35 27 41.3c87 32.5 174 10.3 261-11.9c79.8-20.3 159.6-40.7 239.3-18.9c23 6.3 48.7-9.5 48.7-33.4l0-309.9c0-18-10.1-35-27-41.3C462 15.9 375 38.1 288 60.3C208.2 80.6 128.4 100.9 48.7 79.1C25.6 72.8 0 88.6 0 112.5zM288 352c-44.2 0-80-43-80-96s35.8-96 80-96s80 43 80 96s-35.8 96-80 96zM64 352c35.3 0 64 28.7 64 64l-64 0 0-64zm64-208c0 35.3-28.7 64-64 64l0-64 64 0zM512 304l0 64-64 0c0-35.3 28.7-64 64-64zM448 96l64 0 0 64c-35.3 0-64-28.7-64-64z"/></svg>, title: 'Keep the margin.',                  desc: 'Set your own client price. Pay us a flat monthly fee. The difference is yours every month.' },
  { icon: <svg viewBox="0 0 512 512" width="24" height="24" fill="#1B17FF" aria-hidden="true"><path d="M32 32c17.7 0 32 14.3 32 32l0 336c0 8.8 7.2 16 16 16l400 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L80 480c-44.2 0-80-35.8-80-80L0 64C0 46.3 14.3 32 32 32zM160 224c17.7 0 32 14.3 32 32l0 64c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32zm128-64l0 160c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-160c0-17.7 14.3-32 32-32s32 14.3 32 32zm64 32c17.7 0 32 14.3 32 32l0 96c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-96c0-17.7 14.3-32 32-32zM480 96l0 224c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-224c0-17.7 14.3-32 32-32s32 14.3 32 32z"/></svg>, title: 'Full portfolio view.',              desc: 'All clients in one dashboard. Score, weekly change, alert status.' },
  { icon: <svg viewBox="0 0 384 512" width="24" height="24" fill="#1B17FF" aria-hidden="true"><path d="M64 0C28.7 0 0 28.7 0 64L0 448c0 35.3 28.7 64 64 64l256 0c35.3 0 64-28.7 64-64l0-288-128 0c-17.7 0-32-14.3-32-32L224 0 64 0zM256 0l0 128 128 0L256 0zM112 256l160 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-160 0c-8.8 0-16-7.2-16-16s7.2-16 16-16zm0 64l160 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-160 0c-8.8 0-16-7.2-16-16s7.2-16 16-16zm0 64l160 0c8.8 0 16 7.2 16 16s-7.2 16-16 16l-160 0c-8.8 0-16-7.2-16-16s7.2-16 16-16z"/></svg>, title: 'Branded PDF reports.',              desc: 'One-click professional reports with your agency branding.' },
  { icon: <svg viewBox="0 0 512 512" width="24" height="24" fill="#1B17FF" aria-hidden="true"><path d="M184 0c30.9 0 56 25.1 56 56l0 400c0 30.9-25.1 56-56 56c-28.9 0-52.7-21.9-55.7-50.1c-5.2 1.4-10.7 2.1-16.3 2.1c-35.3 0-64-28.7-64-64c0-7.4 1.3-14.6 3.6-21.2C21.4 367.4 0 338.2 0 304c0-31.9 18.7-59.5 45.8-72.3C37.1 220.8 32 207 32 192c0-30.7 21.6-56.3 50.4-62.6C80.8 123.9 80 118 80 112c0-29.9 20.6-55.1 48.3-62.1C131.3 21.9 155.1 0 184 0zM328 0c28.9 0 52.6 21.9 55.7 49.9c27.8 7 48.3 32.1 48.3 62.1c0 6-.8 11.9-2.4 17.4c28.8 6.2 50.4 31.9 50.4 62.6c0 15-5.1 28.8-13.8 39.7C493.3 244.5 512 272.1 512 304c0 34.2-21.4 63.4-51.6 74.8c2.3 6.6 3.6 13.8 3.6 21.2c0 35.3-28.7 64-64 64c-5.6 0-11.1-.7-16.3-2.1c-3 28.2-26.8 50.1-55.7 50.1c-30.9 0-56-25.1-56-56l0-400c0-30.9 25.1-56 56-56z"/></svg>, title: 'ML intelligence for all clients.',  desc: 'Fix impact predictions, gap narratives, trust signals for every site.' },
  { icon: <svg viewBox="0 0 448 512" width="24" height="24" fill="#1B17FF" aria-hidden="true"><path d="M144 144l0 48 160 0 0-48c0-44.2-35.8-80-80-80s-80 35.8-80 80zM80 192l0-48C80 64.5 144.5 0 224 0s144 64.5 144 144l0 48 16 0c35.3 0 64 28.7 64 64l0 192c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 256c0-35.3 28.7-64 64-64l16 0z"/></svg>, title: 'Retain clients longer.',            desc: 'Verified before-and-after proof keeps clients paying month after month.' },
];

export default function AgencyPage() {
  const [country, setCountry] = useState<CountryConfig>(getCountryConfig('US'));

  useEffect(() => {
    const match = document.cookie.split('; ').find(r => r.startsWith('rankall_country='));
    const code = match ? match.split('=')[1] : 'US';
    setCountry(getCountryConfig(code));
  }, []);

  const s = country.symbol;
  const agencyPrice = country.tiers.agency.monthly;

  return (
    <div style={{ background: BG, minHeight: '100vh', fontFamily: "'Geist','Inter','Helvetica Neue',Arial,sans-serif" }}>

      {/* HERO */}
      <section style={{ padding: '88px 24px 64px', textAlign: 'center' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: BLUE, background: '#EEF0FF', borderRadius: 999, padding: '8px 20px' }}>For Marketing Agencies</span>
          <h1 style={{ margin: 0, fontSize: 'clamp(40px,5.5vw,64px)', fontWeight: 700, color: INK, letterSpacing: '-0.045em', lineHeight: 1.02 }}>
            Manage AI Visibility<br />for <span style={{ color: BLUE }}>all your clients.</span>
          </h1>
          <p style={{ margin: 0, fontSize: 18, color: BODY, maxWidth: 560, lineHeight: 1.7 }}>
            White-label Rankall.io under your brand. {s}{agencyPrice}/month flat fee. Unlimited client accounts. You set your own client prices — keep 100% of the margin.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 8 }}>
            <Link href="/signup?plan=agency" style={{ background: BLUE, borderRadius: 999, padding: '16px 36px', fontSize: 16, fontWeight: 700, color: '#fff', textDecoration: 'none', display: 'inline-block', boxShadow: '0 12px 32px rgba(27,23,255,0.35)' }}>
              Start Agency Trial <svg viewBox="0 0 448 512" width="14" height="14" fill="#fff" aria-hidden="true" style={{verticalAlign: '-2px', marginLeft: 6}}><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
            </Link>
            <a href="/agency/demo" style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 999, padding: '16px 36px', fontSize: 16, fontWeight: 600, color: INK, textDecoration: 'none', display: 'inline-block' }}>
              Book Agency Demo
            </a>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section style={{ maxWidth: 960, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h2 style={{ fontSize: 'clamp(28px,3.5vw,40px)', fontWeight: 700, color: INK, letterSpacing: '-0.03em', margin: '0 0 10px' }}>The economics are simple</h2>
          <p style={{ fontSize: 16, color: BODY, margin: 0 }}>One flat fee. Unlimited clients. You keep the margin.</p>
        </div>
        <div style={{ background: INK, borderRadius: 24, padding: '56px 40px', textAlign: 'center', boxShadow: '0 24px 64px rgba(10,10,20,0.25)' }}>
          <p style={{ fontSize: 64, fontWeight: 700, color: '#fff', margin: '0 0 8px', letterSpacing: '-0.04em' }}>{s}{agencyPrice}<span style={{ fontSize: 20, fontWeight: 500, color: '#B4B4C8' }}>/month</span></p>
          <p style={{ fontSize: 16, color: '#B4B4C8', margin: '0 0 32px' }}>Flat fee. No per-site charges. No credit limits.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16, textAlign: 'left', maxWidth: 720, margin: '0 auto' }}>
            {['Unlimited client accounts', 'You set your own client prices', `Keep 100% of the margin above ${s}${agencyPrice}`, '7-day free trial · Card required · Cancel anytime'].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: '#34D399', fontWeight: 700, flexShrink: 0, display: 'inline-flex' }}><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg></span>
                <span style={{ fontSize: 14, fontWeight: 500, color: '#DCDCE8' }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ maxWidth: 960, margin: '0 auto', padding: '72px 24px 0' }}>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: '40px', boxShadow: '0 12px 32px rgba(10,10,20,0.06)' }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: INK, letterSpacing: '-0.03em', margin: '0 0 28px' }}>Everything included</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '14px 28px' }}>
            {[
              'White-label PDF reports',
              'Proposal builder (closes clients in one URL)',
              'Client command center dashboard',
              'Bulk scanning — rescan all clients in one click',
              'Weekly automated client emails',
              'Score drop instant alerts',
              'Unlimited clients — one flat fee',
            ].map((feat, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 15, color: INK, lineHeight: 1.5, fontWeight: 500 }}>
                <span style={{ color: BLUE, fontWeight: 700, flexShrink: 0, display: 'inline-flex' }}><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg></span>
                {feat}
              </li>
            ))}
          </ul>
        </div>
        <p style={{ textAlign: 'center', fontSize: 14, color: BODY, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '16px 24px', margin: '24px 0 0' }}>
          Built for agencies serving dentists, lawyers, HVAC companies, restaurants, and local businesses across the US, UK, and Australia.
        </p>
      </section>

      {/* BENEFITS */}
      <section style={{ maxWidth: 960, margin: '0 auto', padding: '72px 24px' }}>
        <h2 style={{ fontSize: 'clamp(28px,3.5vw,40px)', fontWeight: 700, color: INK, letterSpacing: '-0.03em', textAlign: 'center', margin: '0 0 40px' }}>Everything your agency needs</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(280px,100%),1fr))', gap: 16 }}>
          {BENEFITS.map((b, i) => (
            <div key={i} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 28 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 16 }}>{b.icon}</div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: INK, margin: '0 0 8px', letterSpacing: '-0.02em' }}>{b.title}</h3>
              <p style={{ fontSize: 14, color: BODY, lineHeight: 1.65, margin: 0 }}>{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* COMPARISON — dark */}
      <section style={{ background: INK, padding: '96px 24px' }}>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(26px,3.5vw,36px)', fontWeight: 700, color: '#fff', letterSpacing: '-0.03em', margin: '0 0 40px', textAlign: 'center' }}>How Rankall.io Agency compares</h2>
          <div style={{ background: '#14142A', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '32px', overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', minWidth: 560 }}>
              {['Feature', 'Rankall.io', 'RankPrompt'].map((h, i) => (
                <div key={h} style={{ fontSize: 12, fontWeight: 700, color: i === 1 ? '#8D8BFF' : '#8A8AA3', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '10px 0', borderBottom: '2px solid rgba(255,255,255,0.1)' }}>{h}</div>
              ))}
              {[
                ['Monthly cost',          `${s}${agencyPrice}/mo flat`, '—'],
                ['Credit limits',         'None — unlimited',           '1,000 credits/mo'],
                ['Platforms tracked',     '12 platforms',               '6 platforms'],
                ['Local businesses',      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> Full support</span>,             <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><svg viewBox="0 0 384 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg> Not supported</span>],
                ['Trust signals',         <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> 30+ signals</span>,               <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><svg viewBox="0 0 384 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg> Not available</span>],
                ['Fix impact prediction', <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> Included</span>,                 <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><svg viewBox="0 0 384 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg> Not available</span>],
                ['White-label',           <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> Full white-label</span>,         <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> Available</span>],
              ].map(([feat, us, them], i) => (
                <>
                  <div key={`f${i}`} style={{ fontSize: 14, fontWeight: 500, color: '#DCDCE8', padding: '13px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{feat}</div>
                  <div key={`u${i}`} style={{ fontSize: 14, color: '#34D399', fontWeight: 700, padding: '13px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{us}</div>
                  <div key={`t${i}`} style={{ fontSize: 14, color: '#8A8AA3', padding: '13px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{them}</div>
                </>
              ))}
            </div>
          </div>
          <p style={{ fontSize: 12, color: '#8A8AA3', margin: '16px 0 0', textAlign: 'center' }}>
            Competitor details from RankPrompt&apos;s public pages, checked October 2026. Their features and pricing change — check their site for the latest.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '96px 24px 120px', textAlign: 'center' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(28px,3.5vw,40px)', fontWeight: 700, color: INK, letterSpacing: '-0.03em', margin: '0 0 14px' }}>Ready to add AI Visibility to your agency?</h2>
          <p style={{ fontSize: 16, color: BODY, margin: '0 0 36px' }}>Book a 30-minute demo. We'll walk through the white-label setup together.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/signup?plan=agency" style={{ background: BLUE, borderRadius: 999, padding: '16px 36px', fontSize: 16, fontWeight: 700, color: '#fff', textDecoration: 'none', display: 'inline-block', boxShadow: '0 12px 32px rgba(27,23,255,0.35)' }}>
              Start Agency Trial <svg viewBox="0 0 448 512" width="14" height="14" fill="#fff" aria-hidden="true" style={{verticalAlign: '-2px', marginLeft: 6}}><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg>
            </Link>
            <a href="/agency/demo" style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 999, padding: '16px 36px', fontSize: 16, fontWeight: 600, color: INK, textDecoration: 'none', display: 'inline-block' }}>
              Book Agency Demo
            </a>
          </div>
        </div>
      </section>

    </div>
  );
}
