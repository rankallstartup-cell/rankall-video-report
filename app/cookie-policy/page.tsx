'use client';

import Link from 'next/link';

// V2 design tokens
const INK = '#0A0A14';
const BLUE = '#1B17FF';
const BODY = '#55556A';
const BG = '#F6F6FB';
const CARD = '#FFFFFF';
const BORDER = '#EDEDF4';
const DIM = '#8A8AA3';

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: '36px 36px', marginBottom: 16, boxShadow: '0 8px 24px rgba(10,10,20,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: BLUE, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 8px 20px rgba(27,23,255,0.3)' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{n}</span>
        </div>
        <h2 style={{ fontSize: 21, fontWeight: 700, color: INK, letterSpacing: '-0.025em', margin: 0 }}>{title}</h2>
      </div>
      <div style={{ fontSize: 15.5, color: BODY, lineHeight: 1.8 }}>{children}</div>
    </div>
  );
}

const a: React.CSSProperties = { color: BLUE, fontWeight: 600, textDecoration: 'none' };
const strong: React.CSSProperties = { color: INK, fontWeight: 600 };

export default function CookiePolicyPage() {
  return (
    <div style={{ background: BG, minHeight: '100vh', fontFamily: "'Geist','Inter','Helvetica Neue',Arial,sans-serif" }}>

      {/* HERO */}
      <section style={{ padding: '88px 24px 48px', textAlign: 'center' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
          <Link href="/" style={{ fontSize: 14, color: BODY, textDecoration: 'none', fontWeight: 500, alignSelf: 'flex-start' }}><svg viewBox="0 0 448 512" width="13" height="13" fill="currentColor" aria-hidden="true" style={{verticalAlign: '-2px', marginRight: 6}}><path d="M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L109.2 288 416 288c17.7 0 32-14.3 32-32s-14.3-32-32-32l-306.7 0L214.6 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160z"/></svg> Back to home</Link>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: BLUE, background: '#EEF0FF', borderRadius: 999, padding: '8px 20px' }}>Legal</span>
          <h1 style={{ margin: 0, fontSize: 'clamp(40px,5.5vw,60px)', fontWeight: 700, color: INK, letterSpacing: '-0.045em', lineHeight: 1.02 }}>Cookie Policy</h1>
          <p style={{ margin: 0, fontSize: 15, color: DIM }}>Last updated: October 20, 2026</p>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '20px 28px', maxWidth: 600, boxShadow: '0 12px 32px rgba(10,10,20,0.06)', display: 'flex', gap: 14, alignItems: 'flex-start', textAlign: 'left' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#EEF0FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}><svg viewBox="0 0 512 512" width="20" height="20" fill={BLUE} aria-hidden="true"><path d="M257.5 27.6c-.8-5.4-4.9-9.8-10.3-10.6c-22.1-3.1-44.6 .9-64.4 11.4l-74 39.5C89.1 78.4 73.2 94.9 63.4 115L26.7 190.6c-9.8 20.1-13 42.9-9.1 64.9l14.5 82.8c3.9 22.1 14.6 42.3 30.7 57.9l60.3 58.4c16.1 15.6 36.6 25.6 58.7 28.7l83 11.7c22.1 3.1 44.6-.9 64.4-11.4l74-39.5c19.7-10.5 35.6-27 45.4-47.2l36.7-75.5c9.8-20.1 13-42.9 9.1-64.9c-.9-5.3-5.3-9.3-10.6-10.1c-51.5-8.2-92.8-47.1-104.5-97.4c-1.8-7.6-8-13.4-15.7-14.6c-54.6-8.7-97.7-52-106.2-106.8zM208 144a32 32 0 1 1 0 64 32 32 0 1 1 0-64zM144 336a32 32 0 1 1 64 0 32 32 0 1 1 -64 0zm224-64a32 32 0 1 1 0 64 32 32 0 1 1 0-64z"/></svg></div>
            <p style={{ fontSize: 15, color: BODY, margin: 0, lineHeight: 1.65 }}>
              <strong style={strong}>No advertising cookies.</strong> We only use cookies that make the product work and respect your privacy.
            </p>
          </div>
        </div>
      </section>

      {/* CONTENT */}
      <section style={{ padding: '0 24px 120px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>

          <Section n="1" title="What are cookies?">
            <p style={{ margin: 0 }}>Cookies are small text files stored on your device when you visit a website. They help the site remember your preferences, keep you signed in, and understand how visitors use the site so we can improve it.</p>
          </Section>

          <Section n="2" title="How Rankall uses cookies">
            <p style={{ margin: '0 0 12px' }}>We use cookies for the following purposes:</p>
            <ul style={{ paddingLeft: 20, margin: 0 }}>
              <li style={{ marginBottom: 10 }}><strong style={strong}>Essential cookies</strong> — required for the site to function: keeping you signed in, remembering your scan session, and security (CSRF protection, rate limiting).</li>
              <li style={{ marginBottom: 10 }}><strong style={strong}>Preference cookies</strong> — remember your country/currency selection and display preferences.</li>
              <li style={{ marginBottom: 10 }}><strong style={strong}>Analytics cookies</strong> — help us understand aggregate usage (pages visited, scan completions) via PostHog, our product analytics. No cross-site tracking.</li>
              <li style={{ marginBottom: 0 }}><strong style={strong}>Marketing cookies</strong> — we do not currently set any marketing cookies.</li>
            </ul>
          </Section>

          <Section n="3" title="Cookies we set">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 480 }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: `2px solid ${BORDER}` }}>
                    <th style={{ padding: '12px 8px', color: INK, fontWeight: 700 }}>Cookie</th>
                    <th style={{ padding: '12px 8px', color: INK, fontWeight: 700 }}>Purpose</th>
                    <th style={{ padding: '12px 8px', color: INK, fontWeight: 700 }}>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: `1px solid ${BORDER}` }}><td style={{ padding: '12px 8px', fontWeight: 600, color: INK }}>rankall_session</td><td style={{ padding: '12px 8px' }}>Keeps you signed in</td><td style={{ padding: '12px 8px' }}>30 days</td></tr>
                  <tr style={{ borderBottom: `1px solid ${BORDER}` }}><td style={{ padding: '12px 8px', fontWeight: 600, color: INK }}>rankall_country</td><td style={{ padding: '12px 8px' }}>Remembers your country/currency</td><td style={{ padding: '12px 8px' }}>1 year</td></tr>
                  <tr style={{ borderBottom: `1px solid ${BORDER}` }}><td style={{ padding: '12px 8px', fontWeight: 600, color: INK }}>rankall_nudge_dismissed</td><td style={{ padding: '12px 8px' }}>Remembers dismissed popups</td><td style={{ padding: '12px 8px' }}>1 year</td></tr>
                  <tr><td style={{ padding: '12px 8px', fontWeight: 600, color: INK }}>ph_* (analytics)</td><td style={{ padding: '12px 8px' }}>Aggregate usage analytics (PostHog)</td><td style={{ padding: '12px 8px' }}>Up to 1 year</td></tr>
                </tbody>
              </table>
            </div>
          </Section>

          <Section n="4" title="Third-party cookies">
            <p style={{ margin: 0 }}>We use Stripe for payment processing, Supabase for authentication and data storage, and PostHog for product analytics. These providers may set their own cookies when you interact with checkout, sign-in flows, or the product itself. Their cookie practices are governed by their own policies.</p>
          </Section>

          <Section n="5" title="Managing cookies">
            <p style={{ margin: '0 0 12px' }}>You can control cookies through your browser settings: block all cookies, block third-party cookies, or delete existing cookies. Note that blocking essential cookies will prevent you from signing in and using Rankall.</p>
            <p style={{ margin: 0 }}>Most browsers also support "Do Not Track" signals, which we respect for analytics cookies.</p>
          </Section>

          <Section n="6" title="Changes to this policy">
            <p style={{ margin: 0 }}>We may update this Cookie Policy as our practices change. Material changes will be noted here with a revised date.</p>
          </Section>

          <Section n="7" title="Contact">
            <p style={{ margin: 0 }}>Questions about cookies? Email us at <a href="mailto:privacy@rankall.io" style={a}>privacy@rankall.io</a>.</p>
          </Section>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', paddingTop: 32, flexWrap: 'wrap' }}>
            <Link href="/" style={{ border: `1px solid ${BORDER}`, borderRadius: 999, padding: '13px 28px', fontSize: 14, fontWeight: 600, color: INK, textDecoration: 'none', background: CARD }}>Back to Home</Link>
            <Link href="/privacy" style={{ background: BLUE, borderRadius: 999, padding: '13px 28px', fontSize: 14, fontWeight: 700, color: '#fff', textDecoration: 'none', boxShadow: '0 8px 24px rgba(27,23,255,0.3)' }}>Privacy Policy <svg viewBox="0 0 448 512" width="13" height="13" fill="#fff" aria-hidden="true" style={{verticalAlign: '-2px', marginLeft: 6}}><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
          </div>
        </div>
      </section>
    </div>
  );
}
