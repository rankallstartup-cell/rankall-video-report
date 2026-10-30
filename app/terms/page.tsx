import Link from 'next/link';
import type { Metadata } from 'next';
import { FOUNDER_PRICING_USD } from '@/lib/publicStats';

export const metadata: Metadata = {
  title: { absolute: 'Terms & Conditions | Rankall' },
  description:
    'The terms governing use of Rankall — AI visibility scanning, subscriptions, and the 14-day money-back guarantee.',
  alternates: { canonical: '/terms' },
};

// V2 design tokens
const INK = '#0A0A14';
const BLUE = '#1B17FF';
const BODY = '#55556A';
const BG = '#F6F6FB';
const CARD = '#FFFFFF';
const BORDER = '#EDEDF4';
const DIM = '#8A8AA3';

const TOC = [
  'Acceptance of Terms', 'The Service', 'Subscription & Payment', '14-Day Guarantee',
  'Free Scans', 'Acceptable Use', 'Your Data', 'Intellectual Property',
  'AI Results Disclaimer', 'Warranties', 'Liability', 'Termination',
  'Governing Law', 'Changes', 'Contact',
];

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div id={`s${n}`} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: '36px 36px', marginBottom: 16, boxShadow: '0 8px 24px rgba(10,10,20,0.04)', scrollMarginTop: 100 }}>
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

const li: React.CSSProperties = { marginBottom: 10, paddingLeft: 4 };
const strong: React.CSSProperties = { color: INK, fontWeight: 600 };
const a: React.CSSProperties = { color: BLUE, fontWeight: 600, textDecoration: 'none' };
const p0: React.CSSProperties = { margin: 0 };
const pT: React.CSSProperties = { margin: '12px 0 0' };

export default function TermsPage() {
  return (
    <div style={{ background: BG, minHeight: '100vh', fontFamily: "'Geist','Inter','Helvetica Neue',Arial,sans-serif" }}>

      {/* HERO */}
      <section style={{ padding: '88px 24px 48px', textAlign: 'center' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
          <Link href="/" style={{ fontSize: 14, color: BODY, textDecoration: 'none', fontWeight: 500, alignSelf: 'flex-start' }}><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L109.2 288 416 288c17.7 0 32-14.3 32-32s-14.3-32-32-32l-306.7 0L214.6 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160z"/></svg> Back to home</Link>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: BLUE, background: '#EEF0FF', borderRadius: 999, padding: '8px 20px' }}>Legal</span>
          <h1 style={{ margin: 0, fontSize: 'clamp(40px,5.5vw,60px)', fontWeight: 700, color: INK, letterSpacing: '-0.045em', lineHeight: 1.02 }}>Terms & Conditions</h1>
          <p style={{ margin: 0, fontSize: 15, color: DIM }}>Last updated: October 19, 2026</p>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '20px 28px', maxWidth: 600, boxShadow: '0 12px 32px rgba(10,10,20,0.06)', display: 'flex', gap: 14, alignItems: 'flex-start', textAlign: 'left' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#EEF0FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}><svg viewBox="0 0 448 512" width="20" height="20" fill="#1B17FF" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg></div>
            <p style={{ fontSize: 15, color: BODY, margin: 0, lineHeight: 1.65 }}>
              <strong style={strong}>Plain English:</strong> cancel anytime, 14-day money-back guarantee, your data stays yours.
            </p>
          </div>
        </div>
      </section>

      {/* CONTENT */}
      <section style={{ padding: '0 24px 120px' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gridTemplateColumns: '240px 1fr', gap: 32, alignItems: 'start' }}>

          <nav className="terms-toc" style={{ position: 'sticky', top: 100, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '20px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>On this page</p>
            {TOC.map((t, i) => (
              <a key={t} href={`#s${i + 1}`} style={{ display: 'block', fontSize: 13.5, color: BODY, textDecoration: 'none', padding: '7px 0', borderBottom: i < TOC.length - 1 ? `1px solid ${BG}` : 'none', fontWeight: 500 }}>{t}</a>
            ))}
          </nav>

          <div>
            <Section n="1" title="Acceptance of Terms">
              <p style={p0}>By accessing or using Rankall.io ("the Service"), you agree to be bound by these Terms & Conditions. If you do not agree, do not use the Service. Rankall.io is operated by Rankall Inc. References to "we", "us", or "our" mean Rankall Inc.</p>
            </Section>

            <Section n="2" title="The Service">
              <p style={p0}>Rankall.io is an AI visibility monitoring platform. We scan 12 AI platforms (including ChatGPT, Gemini, Perplexity, Claude, and others) to show whether AI systems recommend your business — or your competitors — when customers ask for your category.</p>
              <p style={pT}>The Service includes AI visibility scores, share-of-recommendation tracking, a fix engine with prioritized recommendations, rescan verification, and reporting tools.</p>
            </Section>

            <Section n="3" title="Subscription and Payment">
              <p style={p0}>Rankall.io offers the following subscription plans (all prices in USD; checkout charges USD):</p>
              <ul style={{ paddingLeft: 20, margin: '12px 0' }}>
                {/* Prices from lib/publicStats.ts (single source of truth). The old
                    hardcoded list included two tiers that do not exist. */}
                {FOUNDER_PRICING_USD.map((t) => (
                  <li key={t.name} style={li}><strong style={strong}>{t.name}:</strong> ${t.monthly.toLocaleString('en-US')}/month</li>
                ))}
              </ul>
              <p style={pT}><strong style={strong}>Free trial.</strong> Paid plans start with a 7-day free trial. A payment card is required to start the trial; it is not charged during the trial. When the trial ends, the card on file is charged the plan price automatically and the subscription begins, unless you cancel before the trial ends — in which case you pay nothing. You can also choose to end the trial early and start the paid plan immediately from your billing page. Some features are limited during the trial (for example the number of locations and scans, report exports and white-label); the limits are shown in the app and lift when the paid plan starts. Each customer may use one free trial; a trial is not available again for the same account or the same payment card.</p>
              <p style={pT}><strong style={strong}>Automatic renewal.</strong> Subscriptions automatically renew at the end of each billing period, and the card on file is charged the then-current price, unless cancelled. You may cancel at any time from your account settings. Cancellation takes effect at the end of the current billing period (or at the end of the trial, if you are still in it) — you retain full access until then and are not charged again.</p>
              {/* b8bd: closes the "Free tier after cancelling a trial" wording gap.
                  Verified: the subscription.deleted webhook downgrades the
                  account to Free (app/api/billing/portal + refund routes). */}
              <p style={pT}>When a subscription ends — trial cancelled, subscription cancelled, or refunded — the account moves to the Free plan. Your scans and data stay.</p>
              <p style={pT}>We reserve the right to change pricing with 30 days' written notice to your registered email address. Price changes do not apply retroactively to time already paid for.</p>
            </Section>

            <Section n="4" title="14-Day Money-Back Guarantee">
              <p style={p0}>If you're not satisfied with Rankall.io, request a full refund from your billing page within 14 days of your first payment — no questions asked. For trial customers, the first payment is the charge made when the trial ends (the trial itself is free). You can also email <a href="mailto:hello@rankall.io" style={a}>hello@rankall.io</a> with your account email and we will process it for you. A refund also cancels your subscription immediately and moves your account to the Free plan.</p>
              <p style={pT}>The money-back guarantee can be used once per customer — it is not available again for the same account or the same payment card.</p>
              <p style={pT}>After the 14-day window, subscriptions are non-refundable for the current billing period, but you can cancel at any time to stop future charges.</p>
              <p style={pT}>In the case of billing errors or duplicate charges, contact us within 30 days and we will review and correct them.</p>
            </Section>

            <Section n="5" title="Free Scans">
              <p style={p0}>Free scans are provided for evaluation purposes. Free scan quotas reset periodically as described on the site. We may change free scan limits at any time.</p>
            </Section>

            <Section n="6" title="Acceptable Use">
              <p style={p0}>You agree not to:</p>
              <ul style={{ paddingLeft: 20, margin: '12px 0 0' }}>
                <li style={li}>Scrape, reverse-engineer, or systematically reproduce AI response data from the Service</li>
                <li style={li}>Resell or redistribute Rankall.io data or reports without written permission (agency white-label plans excepted)</li>
                <li style={li}>Submit false or misleading information about businesses you do not represent</li>
                <li style={li}>Attempt to circumvent usage limits or access another user's account</li>
                <li style={li}>Use the Service for any unlawful purpose</li>
              </ul>
              <p style={pT}>Submitting false fix applications degrades the Service for all users and may result in account termination.</p>
            </Section>

            <Section n="7" title="Your Data">
              <p style={p0}>You retain ownership of your individual business data. By using the Service, you grant Rankall Inc. a perpetual, worldwide, royalty-free licence to use anonymised, aggregated data derived from scans to improve the Service and publish industry research.</p>
              <p style={pT}>We will never sell your personally identifiable information. See our <Link href="/privacy" style={a}>Privacy Policy</Link> for full details on data handling.</p>
            </Section>

            <Section n="8" title="Intellectual Property">
              <p style={p0}>Rankall Inc. owns all intellectual property in the Service, including software, algorithms, design, the fix engine, scoring models, and aggregated intelligence. Reports generated for your business are licensed to you for your own business use.</p>
            </Section>

            <Section n="9" title="AI Platform Results Disclaimer">
              <p style={p0}>Scan results reflect real AI platform responses at the time of the scan. AI models update frequently, and results will vary over time. We do not guarantee that any AI platform will recommend your business, or that your score will improve by any specific amount after applying fixes.</p>
              <p style={pT}>Rankall.io is an independent measurement tool and is not affiliated with, endorsed by, or sponsored by OpenAI, Google, Anthropic, xAI, Perplexity, or any other AI platform.</p>
            </Section>

            <Section n="10" title="Disclaimer of Warranties">
              <p style={p0}>The Service is provided "as is" and "as available" without warranties of any kind, express or implied, including merchantability and fitness for a particular purpose.</p>
            </Section>

            <Section n="11" title="Limitation of Liability">
              <p style={p0}>To the maximum extent permitted by law, Rankall Inc. shall not be liable for any indirect, incidental, special, or consequential damages. Our total liability for any claim shall not exceed the amount you paid us in the 12 months preceding the claim.</p>
            </Section>

            <Section n="12" title="Termination">
              <p style={p0}>We may suspend or terminate your account for violation of these Terms, with notice except in cases of fraud or abuse. You may terminate at any time by cancelling your subscription and deleting your account.</p>
            </Section>

            <Section n="13" title="Governing Law">
              <p style={p0}>These Terms are governed by the laws of the State of Texas, United States, without regard to conflict-of-law principles. Any disputes shall be resolved in the state or federal courts of Travis County, Texas.</p>
            </Section>

            <Section n="14" title="Changes to These Terms">
              <p style={p0}>We may update these Terms from time to time. Material changes will be notified by email at least 30 days before taking effect. Continued use after the effective date constitutes acceptance.</p>
            </Section>

            <Section n="15" title="Contact">
              <p style={p0}>Questions about these Terms? Email us at <a href="mailto:hello@rankall.io" style={a}>hello@rankall.io</a>.</p>
            </Section>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', paddingTop: 32, flexWrap: 'wrap' }}>
              <Link href="/" style={{ border: `1px solid ${BORDER}`, borderRadius: 999, padding: '13px 28px', fontSize: 14, fontWeight: 600, color: INK, textDecoration: 'none', background: CARD }}>Back to Home</Link>
              <Link href="/privacy" style={{ background: BLUE, borderRadius: 999, padding: '13px 28px', fontSize: 14, fontWeight: 700, color: '#fff', textDecoration: 'none', boxShadow: '0 8px 24px rgba(27,23,255,0.3)' }}>Privacy Policy <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
            </div>
          </div>
        </div>
      </section>
      <style>{`@media (max-width: 860px) { .terms-toc { display: none !important; } }`}</style>
    </div>
  );
}
