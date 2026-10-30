import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Privacy Policy | Rankall' },
  description:
    'How Rankall collects, uses, and protects your data. Your scan data is only visible to you.',
  alternates: { canonical: '/privacy' },
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
  'Who We Are', 'Data We Collect', 'How We Use Your Data', 'Legal Bases (GDPR)',
  'Third-Party Services', 'Data Retention', 'Your Rights', 'Cookies',
  'Security', 'Children', 'International Transfers', 'Changes', 'Contact',
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

export default function PrivacyPage() {
  return (
    <div style={{ background: BG, minHeight: '100vh', fontFamily: "'Geist','Inter','Helvetica Neue',Arial,sans-serif" }}>

      {/* HERO */}
      <section style={{ padding: '88px 24px 48px', textAlign: 'center' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
          <Link href="/" style={{ fontSize: 14, color: BODY, textDecoration: 'none', fontWeight: 500, alignSelf: 'flex-start' }}><svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L109.2 288 416 288c17.7 0 32-14.3 32-32s-14.3-32-32-32l-306.7 0L214.6 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160z"/></svg> Back to home</Link>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: BLUE, background: '#EEF0FF', borderRadius: 999, padding: '8px 20px' }}>Legal</span>
          <h1 style={{ margin: 0, fontSize: 'clamp(40px,5.5vw,60px)', fontWeight: 700, color: INK, letterSpacing: '-0.045em', lineHeight: 1.02 }}>Privacy Policy</h1>
          <p style={{ margin: 0, fontSize: 15, color: DIM }}>Last updated: October 19, 2026</p>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '20px 28px', maxWidth: 600, boxShadow: '0 12px 32px rgba(10,10,20,0.06)', display: 'flex', gap: 14, alignItems: 'flex-start', textAlign: 'left' }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#E8F9F0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}><svg viewBox="0 0 448 512" width="20" height="20" fill="#059669" aria-hidden="true"><path d="M144 144l0 48 160 0 0-48c0-44.2-35.8-80-80-80s-80 35.8-80 80zM80 192l0-48C80 64.5 144.5 0 224 0s144 64.5 144 144l0 48 16 0c35.3 0 64 28.7 64 64l0 192c0 35.3-28.7 64-64 64L64 512c-35.3 0-64-28.7-64-64L0 256c0-35.3 28.7-64 64-64l16 0z"/></svg></div>
            <p style={{ fontSize: 15, color: BODY, margin: 0, lineHeight: 1.65 }}>
              <strong style={strong}>Our commitment:</strong> we will never sell your personal data to a third party. Your scan data belongs to you.
            </p>
          </div>
        </div>
      </section>

      {/* CONTENT */}
      <section style={{ padding: '0 24px 120px' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gridTemplateColumns: '240px 1fr', gap: 32, alignItems: 'start' }}>

          {/* TOC */}
          <nav className="privacy-toc" style={{ position: 'sticky', top: 100, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '20px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>On this page</p>
            {TOC.map((t, i) => (
              <a key={t} href={`#s${i + 1}`} style={{ display: 'block', fontSize: 13.5, color: BODY, textDecoration: 'none', padding: '7px 0', borderBottom: i < TOC.length - 1 ? `1px solid ${BG}` : 'none', fontWeight: 500 }}>{t}</a>
            ))}
          </nav>

          {/* Sections */}
          <div>
            <Section n="1" title="Who We Are">
              <p style={{ margin: '0 0 12px' }}>Rankall.io is an AI visibility and recommendation intelligence platform operated by Rankall Inc. This Privacy Policy explains how we collect, use, and protect your data when you use our service at rankall.io.</p>
              <p style={{ margin: 0 }}>Contact: <a href="mailto:privacy@rankall.io" style={a}>privacy@rankall.io</a></p>
            </Section>

            <Section n="2" title="Data We Collect">
              <p style={{ margin: '0 0 12px' }}>We collect the following information:</p>
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                <li style={li}><strong style={strong}>Account information:</strong> Your email address, name, and password (hashed) when you create an account.</li>
                <li style={li}><strong style={strong}>Business information:</strong> Your business name, city, and industry category that you provide.</li>
                <li style={li}><strong style={strong}>Scan data:</strong> The search queries you submit and the AI platform responses returned for those queries.</li>
                <li style={li}><strong style={strong}>Usage data:</strong> Your scan history, scores over time, fixes you apply, and improvement metrics.</li>
                <li style={li}><strong style={strong}>Payment information:</strong> Billing details processed by Stripe. We do not store card numbers — Stripe handles all payment data.</li>
                <li style={li}><strong style={strong}>Technical data:</strong> IP address, browser type, and pages visited, collected via standard server logs and analytics.</li>
              </ul>
              <p style={{ margin: '12px 0 0' }}>We do not collect special categories of personal data (health, biometric, political opinions, etc.).</p>
            </Section>

            <Section n="3" title="How We Use Your Data">
              <p style={{ margin: '0 0 12px' }}>We use your data to:</p>
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                <li style={li}>Provide your AI visibility reports, fix recommendations, and verification rescan results</li>
                <li style={li}>Power the Rankall Intelligence Graph — anonymised, aggregated industry benchmarks that help all users understand how their scores compare</li>
                <li style={li}>Send transactional emails (scan results, weekly reports, billing receipts)</li>
                <li style={li}>Improve the accuracy of our fix recommendations and predictive models</li>
                <li style={li}>Detect and prevent fraud or abuse</li>
              </ul>
              <p style={{ margin: '12px 0 0' }}>We do not sell your personal data. We do not use your data for third-party advertising.</p>
            </Section>

            <Section n="4" title="Legal Bases (GDPR / UK GDPR)">
              <p style={{ margin: '0 0 12px' }}>Where the GDPR applies, we process your data on these legal bases:</p>
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                <li style={li}><strong style={strong}>Contract</strong> — to provide the scans, reports, and features you signed up for.</li>
                <li style={li}><strong style={strong}>Legitimate interests</strong> — to improve our service, prevent fraud, and send relevant product updates.</li>
                <li style={li}><strong style={strong}>Consent</strong> — for marketing emails and non-essential cookies. You can withdraw consent at any time.</li>
                <li style={li}><strong style={strong}>Legal obligation</strong> — to retain billing records as required by tax law.</li>
              </ul>
            </Section>

            <Section n="5" title="Third-Party Services">
              <p style={{ margin: '0 0 12px' }}>We use the following third-party services to operate Rankall.io. Each has its own privacy policy:</p>
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                <li style={li}><strong style={strong}>Supabase</strong> — Database and authentication. Stores your account data and scan history.</li>
                <li style={li}><strong style={strong}>Stripe</strong> — Payment processing. Handles all billing data.</li>
                <li style={li}><strong style={strong}>Resend</strong> — Transactional email delivery.</li>
                <li style={li}><strong style={strong}>Vercel</strong> — Hosting. Serves Rankall.io and processes the technical data (IP address, pages visited) in server logs.</li>
                <li style={li}><strong style={strong}>PostHog</strong> — Aggregate usage analytics (pages visited, scan completions). Only active when analytics is enabled; no cross-site tracking.</li>
                <li style={li}><strong style={strong}>AI platform APIs</strong> (OpenAI, Anthropic, Google, xAI, DeepSeek, Mistral, and others) — queries are sent to these platforms as part of running your scans.</li>
              </ul>
            </Section>

            <Section n="6" title="Data Retention">
              <p style={{ margin: '0 0 12px' }}>We retain your account data and scan history for as long as your account is active. If you delete your account, we delete your personal data within 30 days, except where we are required to retain it for legal or billing purposes.</p>
              <p style={{ margin: 0 }}>Anonymised, aggregated scan data that forms part of the Rankall Intelligence Graph is retained indefinitely and cannot be individually traced back to you.</p>
            </Section>

            <Section n="7" title="Your Rights">
              <p style={{ margin: '0 0 12px' }}>You have the right to:</p>
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                <li style={li}><strong style={strong}>Access</strong> the personal data we hold about you</li>
                <li style={li}><strong style={strong}>Correct</strong> inaccurate data</li>
                <li style={li}><strong style={strong}>Delete</strong> your account and associated personal data</li>
                <li style={li}><strong style={strong}>Export</strong> your scan data in a machine-readable format</li>
                <li style={li}><strong style={strong}>Opt out</strong> of marketing emails at any time via the unsubscribe link</li>
                <li style={li}><strong style={strong}>Object</strong> to processing based on legitimate interests (GDPR)</li>
              </ul>
              <p style={{ margin: '12px 0 0' }}>To exercise any of these rights, email <a href="mailto:privacy@rankall.io" style={a}>privacy@rankall.io</a>. We will respond within 30 days.</p>
              <p style={{ margin: '12px 0 0' }}><strong style={strong}>California residents (CCPA / CPRA):</strong> the rights above include the right to know what personal data we collect about you, to delete it, to correct inaccuracies, and to opt out of any sale or sharing of personal data. We do not sell your personal data, and we do not share it for cross-context behavioural advertising. To exercise a CCPA right, email <a href="mailto:privacy@rankall.io" style={a}>privacy@rankall.io</a> — the same 30-day response applies. We will not discriminate against you for exercising any CCPA right.</p>
            </Section>

            <Section n="8" title="Cookies">
              <p style={{ margin: 0 }}>We use cookies and local storage to keep you signed in and remember your preferences. We do not use third-party advertising cookies. See our <Link href="/cookie-policy" style={a}>Cookie Policy</Link> for full details.</p>
            </Section>

            <Section n="9" title="Security">
              <p style={{ margin: 0 }}>We use industry-standard security measures including encrypted connections (HTTPS), hashed passwords, and access controls. No system is 100% secure — if you believe your account has been compromised, contact us immediately.</p>
            </Section>

            <Section n="10" title="Children">
              <p style={{ margin: 0 }}>Rankall.io is not directed at children under 13. We do not knowingly collect data from children. If you believe a child has created an account, contact us and we will delete it.</p>
            </Section>

            <Section n="11" title="International Transfers">
              <p style={{ margin: 0 }}>Your data may be processed in the United States and other countries where our providers operate. Where the GDPR applies, we rely on adequacy decisions or Standard Contractual Clauses for transfers.</p>
            </Section>

            <Section n="12" title="Changes to This Policy">
              <p style={{ margin: 0 }}>We may update this Privacy Policy from time to time. We will notify you by email of material changes and update the "Last updated" date above. Continued use of the Service after changes constitutes acceptance.</p>
            </Section>

            <Section n="13" title="Contact">
              <p style={{ margin: 0 }}>Questions about this Privacy Policy or your data? Email us at <a href="mailto:privacy@rankall.io" style={a}>privacy@rankall.io</a>. For general questions about Rankall, email <a href="mailto:hello@rankall.io" style={a}>hello@rankall.io</a>.</p>
            </Section>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', paddingTop: 32, flexWrap: 'wrap' }}>
              <Link href="/" style={{ border: `1px solid ${BORDER}`, borderRadius: 999, padding: '13px 28px', fontSize: 14, fontWeight: 600, color: INK, textDecoration: 'none', background: CARD }}>Back to Home</Link>
              <Link href="/terms" style={{ background: BLUE, borderRadius: 999, padding: '13px 28px', fontSize: 14, fontWeight: 700, color: '#fff', textDecoration: 'none', boxShadow: '0 8px 24px rgba(27,23,255,0.3)' }}>Terms of Service <svg viewBox="0 0 448 512" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L338.8 224 32 224c-17.7 0-32 14.3-32 32s14.3 32 32 32l306.7 0L233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z"/></svg></Link>
            </div>
          </div>
        </div>
      </section>
      <style>{`@media (max-width: 860px) { .privacy-toc { display: none !important; } }`}</style>
    </div>
  );
}
