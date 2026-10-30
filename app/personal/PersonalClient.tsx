'use client';

import { useState, useEffect } from 'react';
import { getCountryConfig, type CountryConfig } from '@/lib/countryConfig';

const BG     = '#F6F6FB';
const W      = '#FFFFFF';
const NAVY   = '#0A0A14';
const BORDER = '#EDEDF4';
const BLUE   = '#1B17FF';
const GREEN  = '#059669';
const AMBER  = '#D97706';
const GRAY   = '#55556A';
const LGRAY  = '#8A8AA3';
const PURPLE = '#1B17FF';
const RED    = '#DC2626';

export default function PersonalClient() {
  const [country, setCountry] = useState<CountryConfig>(getCountryConfig('US'));

  useEffect(() => {
    const match = document.cookie.split('; ').find(r => r.startsWith('rankall_country='));
    const code = match ? match.split('=')[1] : 'US';
    setCountry(getCountryConfig(code));
  }, []);

  // ax6z: the charge is USD for every visitor — checkout charges the
  // single USD Stripe price per plan (getStripePrice ignores country).
  // The old code showed the LOCALIZED tier price (e.g. £32 for GB)
  // while checkout charged $15 USD, and fell back to ?? 39 (Local
  // Pro's price, not Personal's $15) if the tier lookup missed.
  // Single price source: the US tier in lib/countryConfig (Personal Pro).
  const usTier = getCountryConfig('US');
  const price = usTier.tiers.personalPro.monthly;
  const symbol = usTier.symbol;

  const WHO = [
    { icon: <svg viewBox="0 0 640 512" width="20" height="20" fill="#1B17FF" aria-hidden="true"><path d="M192 48c0-26.5 21.5-48 48-48L400 0c26.5 0 48 21.5 48 48l0 464-80 0 0-80c0-26.5-21.5-48-48-48s-48 21.5-48 48l0 80-80 0 0-464zM48 96l112 0 0 416L48 512c-26.5 0-48-21.5-48-48L0 320l80 0c8.8 0 16-7.2 16-16s-7.2-16-16-16L0 288l0-64 80 0c8.8 0 16-7.2 16-16s-7.2-16-16-16L0 192l0-48c0-26.5 21.5-48 48-48zm544 0c26.5 0 48 21.5 48 48l0 48-80 0c-8.8 0-16 7.2-16 16s7.2 16 16 16l80 0 0 64-80 0c-8.8 0-16 7.2-16 16s7.2 16 16 16l80 0 0 144c0 26.5-21.5 48-48 48l-112 0 0-416 112 0zM312 64c-8.8 0-16 7.2-16 16l0 24-24 0c-8.8 0-16 7.2-16 16l0 16c0 8.8 7.2 16 16 16l24 0 0 24c0 8.8 7.2 16 16 16l16 0c8.8 0 16-7.2 16-16l0-24 24 0c8.8 0 16-7.2 16-16l0-16c0-8.8-7.2-16-16-16l-24 0 0-24c0-8.8-7.2-16-16-16l-16 0z"/></svg>, label: 'Doctors & Surgeons' },
    { icon: <svg viewBox="0 0 640 512" width="20" height="20" fill="#1B17FF" aria-hidden="true"><path d="M384 32l128 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L398.4 96c-5.2 25.8-22.9 47.1-46.4 57.3L352 448l160 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-192 0-192 0c-17.7 0-32-14.3-32-32s14.3-32 32-32l160 0 0-294.7c-23.5-10.3-41.2-31.6-46.4-57.3L128 96c-17.7 0-32-14.3-32-32s14.3-32 32-32l128 0c14.6-19.4 37.8-32 64-32s49.4 12.6 64 32zm55.6 288l144.9 0L512 195.8 439.6 320zM512 416c-62.9 0-115.2-34-126-78.9c-2.6-11 1-22.3 6.7-32.1l95.2-163.2c5-8.6 14.2-13.8 24.1-13.8s19.1 5.3 24.1 13.8l95.2 163.2c5.7 9.8 9.3 21.1 6.7 32.1C627.2 382 574.9 416 512 416zM126.8 195.8L54.4 320l144.9 0L126.8 195.8zM.9 337.1c-2.6-11 1-22.3 6.7-32.1l95.2-163.2c5-8.6 14.2-13.8 24.1-13.8s19.1 5.3 24.1 13.8l95.2 163.2c5.7 9.8 9.3 21.1 6.7 32.1C242 382 189.7 416 126.8 416S11.7 382 .9 337.1z"/></svg>, label: 'Lawyers & Attorneys' },
    { icon: <svg viewBox="0 0 512 512" width="20" height="20" fill="#1B17FF" aria-hidden="true"><path d="M184 48l144 0c4.4 0 8 3.6 8 8l0 40L176 96l0-40c0-4.4 3.6-8 8-8zm-56 8l0 40L64 96C28.7 96 0 124.7 0 160l0 96 192 0 128 0 192 0 0-96c0-35.3-28.7-64-64-64l-64 0 0-40c0-30.9-25.1-56-56-56L184 0c-30.9 0-56 25.1-56 56zM512 288l-192 0 0 32c0 17.7-14.3 32-32 32l-64 0c-17.7 0-32-14.3-32-32l0-32L0 288 0 416c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-128z"/></svg>, label: 'Consultants & Coaches' },
    { icon: <svg viewBox="0 0 512 512" width="20" height="20" fill="#1B17FF" aria-hidden="true"><path d="M243.4 2.6l-224 96c-14 6-21.8 21-18.7 35.8S16.8 160 32 160l0 8c0 13.3 10.7 24 24 24l400 0c13.3 0 24-10.7 24-24l0-8c15.2 0 28.3-10.7 31.3-25.6s-4.8-29.9-18.7-35.8l-224-96c-8-3.4-17.2-3.4-25.2 0zM128 224l-64 0 0 196.3c-.6 .3-1.2 .7-1.8 1.1l-48 32c-11.7 7.8-17 22.4-12.9 35.9S17.9 512 32 512l448 0c14.1 0 26.5-9.2 30.6-22.7s-1.1-28.1-12.9-35.9l-48-32c-.6-.4-1.2-.7-1.8-1.1L448 224l-64 0 0 192-40 0 0-192-64 0 0 192-48 0 0-192-64 0 0 192-40 0 0-192zM256 64a32 32 0 1 1 0 64 32 32 0 1 1 0-64z"/></svg>, label: 'Financial Advisors' },
    { icon: <svg viewBox="0 0 448 512" width="20" height="20" fill="#1B17FF" aria-hidden="true"><path d="M186.1 52.1C169.3 39.1 148.7 32 127.5 32C74.7 32 32 74.7 32 127.5l0 6.2c0 15.8 3.7 31.3 10.7 45.5l23.5 47.1c4.5 8.9 7.6 18.4 9.4 28.2l36.7 205.8c2 11.2 11.6 19.4 22.9 19.8s21.4-7.4 24-18.4l28.9-121.3C192.2 323.7 207 312 224 312s31.8 11.7 35.8 28.3l28.9 121.3c2.6 11.1 12.7 18.8 24 18.4s20.9-8.6 22.9-19.8l36.7-205.8c1.8-9.8 4.9-19.3 9.4-28.2l23.5-47.1c7.1-14.1 10.7-29.7 10.7-45.5l0-2.1c0-55-44.6-99.6-99.6-99.6c-24.1 0-47.4 8.8-65.6 24.6l-3.2 2.8 19.5 15.2c7 5.4 8.2 15.5 2.8 22.5s-15.5 8.2-22.5 2.8l-24.4-19-37-28.8z"/></svg>, label: 'Dentists & Specialists' },
    { icon: <svg viewBox="0 0 512 512" width="20" height="20" fill="#1B17FF" aria-hidden="true"><path d="M32 32c17.7 0 32 14.3 32 32l0 336c0 8.8 7.2 16 16 16l400 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L80 480c-44.2 0-80-35.8-80-80L0 64C0 46.3 14.3 32 32 32zM160 224c17.7 0 32 14.3 32 32l0 64c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32zm128-64l0 160c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-160c0-17.7 14.3-32 32-32s32 14.3 32 32zm64 32c17.7 0 32 14.3 32 32l0 96c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-96c0-17.7 14.3-32 32-32zM480 96l0 224c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-224c0-17.7 14.3-32 32-32s32 14.3 32 32z"/></svg>, label: 'Executives & Leaders' },
  ];

  const FEATURES = [
    { icon: <svg viewBox="0 0 512 512" width="24" height="24" fill="#1B17FF" aria-hidden="true"><path d="M448 256A192 192 0 1 0 64 256a192 192 0 1 0 384 0zM0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256zm256 80a80 80 0 1 0 0-160 80 80 0 1 0 0 160zm0-224a144 144 0 1 1 0 288 144 144 0 1 1 0-288zM224 256a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"/></svg>, title: 'AI Name Recognition Score', desc: 'See exactly how often AI recommends you by name across 12 platforms' },
    { icon: <svg viewBox="0 0 512 512" width="24" height="24" fill="#1B17FF" aria-hidden="true"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512z"/></svg>, title: 'Google Knowledge Panel status', desc: 'See your photo, entity status, and completeness score — with fixes' },
    { icon: <svg viewBox="0 0 576 512" width="24" height="24" fill="#1B17FF" aria-hidden="true"><path d="M80.3 44C69.8 69.9 64 98.2 64 128s5.8 58.1 16.3 84c6.6 16.4-1.3 35-17.7 41.7s-35-1.3-41.7-17.7C7.4 202.6 0 166.1 0 128S7.4 53.4 20.9 20C27.6 3.6 46.2-4.3 62.6 2.3S86.9 27.6 80.3 44zM555.1 20C568.6 53.4 576 89.9 576 128s-7.4 74.6-20.9 108c-6.6 16.4-25.3 24.3-41.7 17.7S489.1 228.4 495.7 212c10.5-25.9 16.3-54.2 16.3-84s-5.8-58.1-16.3-84C489.1 27.6 497 9 513.4 2.3s35 1.3 41.7 17.7zM352 128c0 23.7-12.9 44.4-32 55.4L320 480c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-296.6c-19.1-11.1-32-31.7-32-55.4c0-35.3 28.7-64 64-64s64 28.7 64 64zM170.6 76.8C163.8 92.4 160 109.7 160 128s3.8 35.6 10.6 51.2c7.1 16.2-.3 35.1-16.5 42.1s-35.1-.3-42.1-16.5c-10.3-23.6-16-49.6-16-76.8s5.7-53.2 16-76.8c7.1-16.2 25.9-23.6 42.1-16.5s23.6 25.9 16.5 42.1zM464 51.2c10.3 23.6 16 49.6 16 76.8s-5.7 53.2-16 76.8c-7.1 16.2-25.9 23.6-42.1 16.5s-23.6-25.9-16.5-42.1c6.8-15.6 10.6-32.9 10.6-51.2s-3.8-35.6-10.6-51.2c-7.1-16.2 .3-35.1 16.5-42.1s35.1 .3 42.1 16.5z"/></svg>, title: 'Reputation monitoring', desc: '12 AI platforms monitored weekly — get alerted when recommendations change' },
    { icon: <svg viewBox="0 0 640 512" width="24" height="24" fill="#1B17FF" aria-hidden="true"><path d="M96 128a128 128 0 1 1 256 0A128 128 0 1 1 96 128zM0 482.3C0 383.8 79.8 304 178.3 304l91.4 0C368.2 304 448 383.8 448 482.3c0 16.4-13.3 29.7-29.7 29.7L29.7 512C13.3 512 0 498.7 0 482.3zM609.3 512l-137.8 0c5.4-9.4 8.6-20.3 8.6-32l0-8c0-60.7-27.1-115.2-69.8-151.8c2.4-.1 4.7-.2 7.1-.2l61.4 0C567.8 320 640 392.2 640 481.3c0 17-13.8 30.7-30.7 30.7zM432 256c-31 0-59-12.6-79.3-32.9C372.4 196.5 384 163.6 384 128c0-26.8-6.6-52.1-18.3-74.3C384.3 40.1 407.2 32 432 32c61.9 0 112 50.1 112 112s-50.1 112-112 112z"/></svg>, title: 'Peer comparison', desc: 'See how you rank vs colleagues in your specialty and city' },
    { icon: <svg viewBox="0 0 512 512" width="24" height="24" fill="#1B17FF" aria-hidden="true"><path d="M352 320c88.4 0 160-71.6 160-160c0-15.3-2.2-30.1-6.2-44.2c-3.1-10.8-16.4-13.2-24.3-5.3l-76.8 76.8c-3 3-7.1 4.7-11.3 4.7L336 192c-8.8 0-16-7.2-16-16l0-57.4c0-4.2 1.7-8.3 4.7-11.3l76.8-76.8c7.9-7.9 5.4-21.2-5.3-24.3C382.1 2.2 367.3 0 352 0C263.6 0 192 71.6 192 160c0 19.1 3.4 37.5 9.5 54.5L19.9 396.1C7.2 408.8 0 426.1 0 444.1C0 481.6 30.4 512 67.9 512c18 0 35.3-7.2 48-19.9L297.5 310.5c17 6.2 35.4 9.5 54.5 9.5zM80 408a24 24 0 1 1 0 48 24 24 0 1 1 0-48z"/></svg>, title: 'Personal fix queue', desc: 'Wikipedia, Knowledge Panel, LinkedIn, press pitch — step by step' },
    { icon: <svg viewBox="0 0 512 512" width="24" height="24" fill="#1B17FF" aria-hidden="true"><path d="M48 64C21.5 64 0 85.5 0 112c0 15.1 7.1 29.3 19.2 38.4L236.8 313.6c11.4 8.5 27 8.5 38.4 0L492.8 150.4c12.1-9.1 19.2-23.3 19.2-38.4c0-26.5-21.5-48-48-48L48 64zM0 176L0 384c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-208L294.4 339.2c-22.8 17.1-54 17.1-76.8 0L0 176z"/></svg>, title: 'Weekly AI monitoring emails', desc: 'AI answers change as platforms refresh — your weekly email reports what changed' },
    { icon: <svg viewBox="0 0 384 512" width="24" height="24" fill="#1B17FF" aria-hidden="true"><path d="M192 0C139 0 96 43 96 96l0 160c0 53 43 96 96 96s96-43 96-96l0-160c0-53-43-96-96-96zM64 216c0-13.3-10.7-24-24-24s-24 10.7-24 24l0 40c0 89.1 66.2 162.7 152 174.4l0 33.6-48 0c-13.3 0-24 10.7-24 24s10.7 24 24 24l72 0 72 0c13.3 0 24-10.7 24-24s-10.7-24-24-24l-48 0 0-33.6c85.8-11.7 152-85.3 152-174.4l0-40c0-13.3-10.7-24-24-24s-24 10.7-24 24l0 40c0 70.7-57.3 128-128 128s-128-57.3-128-128l0-40z"/></svg>, title: 'AI Pitch Kit generator', desc: 'Get AI-ready bio, Q&A, and positioning to feed every AI platform' },
  ];

  const MOCK_PLATFORMS = [
    { name: 'ChatGPT', found: true },
    { name: 'Gemini', found: true },
    { name: 'Perplexity', found: false },
    { name: 'Grok', found: false },
    { name: 'Claude', found: true },
    { name: 'Copilot', found: false },
    { name: 'Google AI', found: true },
    { name: 'DeepSeek', found: false },
    { name: 'Mistral', found: false },
    { name: 'Kimi', found: false },
    { name: 'Groq', found: false },
    { name: 'Meta AI', found: false },
  ];

  return (
    <div style={{ background: BG, minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* Header: the shared site header (components/SiteChrome.tsx) renders above. */}

      {/* HERO */}
      <section style={{ padding: 'clamp(48px,8vw,96px) 20px clamp(40px,6vw,72px)', textAlign: 'center', background: 'linear-gradient(180deg,#F5F3FF 0%,#F6F6FB 100%)', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#F5F3FF', border: '1.5px solid #DDD6FE', borderRadius: 100, padding: '6px 18px', marginBottom: 28 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: PURPLE }}>Personal Brand — Now Live</span>
          </div>
          <h1 style={{ fontSize: 'clamp(28px,5.5vw,52px)', fontWeight: 900, color: NAVY, letterSpacing: '-1.5px', lineHeight: 1.1, marginBottom: 20 }}>
            Does AI recommend you by name?<br />
            <span style={{ color: PURPLE }}>Or your competitor?</span>
          </h1>
          <p style={{ fontSize: 18, color: GRAY, lineHeight: 1.7, marginBottom: 16, maxWidth: 520, margin: '0 auto 16px' }}>
            Personal Brand scans 12 AI platforms for your name, specialty, and city. See exactly what AI says about you.
          </p>
          <p style={{ fontSize: 14, color: LGRAY, marginBottom: 32 }}>
            When someone asks AI who to hire, are they finding you?
          </p>
          <a href="/?intent=personal_pro" style={{ display: 'inline-block', background: PURPLE, color: W, textDecoration: 'none', borderRadius: 12, padding: '16px 36px', fontSize: 18, fontWeight: 700, marginBottom: 12, boxShadow: '0 4px 20px rgba(124,58,237,0.3)' }}>
            Start Free Trial <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
          <p style={{ fontSize: 13, color: LGRAY }}>Card required · 7-day free trial · Cancel anytime</p>
        </div>
      </section>

      {/* WHO IT'S FOR */}
      <section style={{ padding: '56px 24px', background: W, borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: NAVY, marginBottom: 8 }}>Built for professionals with a reputation to protect</h2>
          <p style={{ fontSize: 15, color: GRAY, marginBottom: 36 }}>When potential patients, clients, or employers ask AI who to hire — do they find you?</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
            {WHO.map(w => (
              <div key={w.label} style={{ background: BG, border: `1.5px solid ${BORDER}`, borderRadius: 100, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>{w.icon}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: NAVY }}>{w.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MOCK PERSONAL REPORT */}
      <section style={{ padding: '56px 24px', background: BG, borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: NAVY, marginBottom: 8 }}>Example report: Dr. Sarah Johnson</h2>
            <p style={{ fontSize: 15, color: GRAY }}>Cardiologist · Chicago, IL · Illustrative example — not a real person or scan</p>
          </div>
          <div style={{ background: W, border: `1.5px solid ${BORDER}`, borderRadius: 16, padding: '28px 24px' }}>
            {/* Score */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
              <div style={{ flex: 1, background: '#F5F3FF', border: `1.5px solid #DDD6FE`, borderRadius: 12, padding: '20px', textAlign: 'center' }}>
                <div style={{ fontSize: 48, fontWeight: 900, color: PURPLE }}>67</div>
                <div style={{ fontSize: 12, color: GRAY, marginTop: 4 }}>AI Name Recognition Score</div>
              </div>
              <div style={{ flex: 1, background: '#ECFDF5', border: `1.5px solid #A7F3D0`, borderRadius: 12, padding: '20px', textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: GREEN, marginBottom: 4 }}><svg viewBox="0 0 512 512" width="16" height="16" fill="currentColor" aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 6 }}><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg> Verified Entity</div>
                <div style={{ fontSize: 12, color: GRAY }}>Google Knowledge Panel</div>
                <div style={{ fontSize: 13, color: GRAY, marginTop: 4 }}>87% complete</div>
              </div>
            </div>
            {/* Platform grid */}
            <p style={{ fontSize: 12, fontWeight: 700, color: GRAY, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 12 }}>Platform Recognition</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 }}>
              {MOCK_PLATFORMS.map(p => (
                <div key={p.name} style={{ background: p.found ? '#ECFDF5' : '#FEF2F2', border: `1px solid ${p.found ? '#A7F3D0' : '#FECACA'}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, fontWeight: 600, color: p.found ? GREEN : RED, textAlign: 'center' as const }}>
                  {p.name} {p.found ? (<svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true" style={{ verticalAlign: 'middle', marginLeft: 6 }}><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>) : (<svg viewBox="0 0 384 512" width="12" height="12" fill="currentColor" aria-hidden="true" style={{ verticalAlign: 'middle', marginLeft: 6 }}><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"/></svg>)}
                </div>
              ))}
            </div>
            {/* Fixes */}
            <div style={{ background: BG, borderRadius: 10, padding: '14px 16px' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: GRAY, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 10 }}>4 Personal Fixes Generated</p>
              {[
                // Same estimate ranges the personal fix generator shows
                // (app/api/personal-fix expected_impact) — not hand-typed.
                { label: 'Fix #1 — Free', title: 'Claim & complete Google Knowledge Panel', impact: 'Est. +10–18 pts' },
                { label: 'Fix #2', title: 'LinkedIn headline optimization for AI indexing', impact: 'Est. +6–12 pts' },
                { label: 'Fix #3', title: 'Wikipedia presence (if notable)', impact: 'Est. +8–15 pts' },
                { label: 'Fix #4', title: 'Press pitch to 3 medical publications', impact: 'Est. +8–20 pts' },
              ].map(f => (
                <div key={f.title} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, padding: '8px', background: W, borderRadius: 8, border: `1px solid ${BORDER}` }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: PURPLE, whiteSpace: 'nowrap' as const }}>{f.label}</span>
                  <span style={{ flex: 1, fontSize: 13, color: NAVY }}>{f.title}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: GREEN, whiteSpace: 'nowrap' as const }}>{f.impact}</span>
                </div>
              ))}
              <p style={{ fontSize: 11, color: GRAY, margin: '10px 0 0' }}>Estimate ranges are the ones Rankall&apos;s Personal Brand fix generator shows for each fix — projections, not measured results.</p>
            </div>
          </div>
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <a href="/?intent=personal_pro" style={{ display: 'inline-block', background: PURPLE, color: W, textDecoration: 'none', borderRadius: 12, padding: '14px 32px', fontSize: 16, fontWeight: 700 }}>
              Start Free Trial <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ padding: '56px 24px', background: W, borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: NAVY, marginBottom: 8 }}>Everything in Personal Brand</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 24, flexShrink: 0 }}>{f.icon}</span>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: NAVY, margin: '0 0 4px' }}><svg viewBox="0 0 448 512" width="14" height="14" fill="currentColor" aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: 6 }}><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> {f.title}</p>
                  <p style={{ fontSize: 13, color: GRAY, margin: 0, lineHeight: 1.5 }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section style={{ padding: '56px 24px', background: BG, borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 400, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: NAVY, marginBottom: 8 }}>Personal Brand</h2>
          <div style={{ background: W, border: `2px solid ${PURPLE}`, borderRadius: 20, padding: '36px 32px', marginBottom: 24 }}>
            <div style={{ fontSize: 48, fontWeight: 900, color: PURPLE, marginBottom: 4 }}>{symbol}{price}</div>
            <div style={{ fontSize: 15, color: GRAY, marginBottom: 24 }}>per month</div>
            {country.code !== 'US' && (
              <p style={{ fontSize: 13, color: GRAY, margin: '-12px 0 24px' }}>All prices in USD — your card is charged in USD.</p>
            )}
            <a href="/?intent=personal_pro" style={{ display: 'block', background: PURPLE, color: W, textDecoration: 'none', borderRadius: 12, padding: '14px', fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
              Start Free Trial <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
            <p style={{ fontSize: 13, color: LGRAY, margin: 0 }}>7-day free trial · Cancel anytime · Card required</p>
          </div>
        </div>
      </section>

      {/* FOOTER CTA */}
      <section style={{ padding: '56px 24px', background: NAVY, textAlign: 'center' }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, color: W, marginBottom: 12 }}>Find out what AI says about you</h2>
        <p style={{ fontSize: 16, color: LGRAY, marginBottom: 28 }}>Are they finding you — or your competitor?</p>
        <a href="/?intent=personal_pro" style={{ display: 'inline-block', background: PURPLE, color: W, textDecoration: 'none', borderRadius: 12, padding: '16px 36px', fontSize: 18, fontWeight: 700 }}>
          Start Free Trial <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></a>
      </section>
    </div>
  );
}
