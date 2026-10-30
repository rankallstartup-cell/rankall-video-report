import Link from 'next/link';

// V2 design tokens (matches /methodology)
const INK = '#0A0A14';
const BLUE = '#1B17FF';
const BODY = '#55556A';
const BG = '#F6F6FB';
const CARD = '#FFFFFF';
const BORDER = '#EDEDF4';
const GREEN = '#059669';

export const metadata = {
  title: { absolute: 'Rankall vs Profound — Honest Comparison | Rankall.io' },
  alternates: { canonical: '/compare/profound' },
  description:
    'Honest comparison of Rankall vs Profound for AI search visibility: pricing, platforms, methodology, and who each product is actually built for.',
};

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', gap: 16, padding: '12px 0', borderBottom: `1px solid ${BORDER}`, fontSize: 14, lineHeight: 1.6 }}>
      <div style={{ width: 160, flexShrink: 0, fontWeight: 700, color: INK }}>{k}</div>
      <div style={{ color: BODY }}>{v}</div>
    </div>
  );
}

function Pro({ children }: { children: React.ReactNode }) {
  return (
    <li style={{ fontSize: 15, color: BODY, lineHeight: 1.7, marginBottom: 10, listStyle: 'none', paddingLeft: 28, position: 'relative' }}>
      <span style={{ position: 'absolute', left: 0, color: GREEN, fontWeight: 800 }}>✓</span>{children}
    </li>
  );
}

export default function CompareProfoundPage() {
  return (
    <div style={{ background: BG, minHeight: '100vh', fontFamily: "'Geist','Inter','Helvetica Neue',Arial,sans-serif" }}>
      <section style={{ padding: '88px 24px 56px', textAlign: 'center' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: BLUE, background: '#EEF0FF', borderRadius: 999, padding: '8px 20px' }}>
            Honest comparison
          </span>
          <h1 style={{ margin: 0, fontSize: 'clamp(36px,5vw,58px)', fontWeight: 700, color: INK, letterSpacing: '-0.045em', lineHeight: 1.02 }}>
            Rankall vs <span style={{ color: BLUE }}>Profound</span>
          </h1>
          <p style={{ margin: 0, fontSize: 17, color: BODY, lineHeight: 1.7, maxWidth: 620 }}>
            Profound is the enterprise leader in AI search visibility. Rankall is the self-serve
            alternative built for local businesses. Here's where each one actually wins — no spin.
          </p>
        </div>
      </section>

      <section style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px 32px' }}>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: '40px', boxShadow: '0 8px 24px rgba(10,10,20,0.04)' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: INK, margin: '0 0 8px', letterSpacing: '-0.02em' }}>The facts</h2>
          <Row k="Profound pricing" v="Free 7-day trial (50 prompts/day across ChatGPT, Gemini, Google AI Overviews), then custom Enterprise pricing. Self-serve paid plans were removed after the Series D." />
          <Row k="Profound funding" v="$180M Series D at a $1.8B valuation, announced September 15, 2026 (Sequoia, Kleiner Perkins). Serves 1,000+ enterprise brands." />
          <Row k="Profound coverage" v="Up to 9 answer engines on Enterprise plans." />
          <Row k="Rankall pricing" v="Free tier (3 scans/month, no card). Local Pro $39/month. Self-serve signup, no sales call." />
          <Row k="Rankall coverage" v="12 AI platforms scanned, with published per-platform weights." />
          <Row k="Rankall methodology" v="Fully open — scoring formula, weights, and limits published on our methodology page." />
        </div>
      </section>

      <section style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px 32px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(320px,100%),1fr))', gap: 16 }}>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: '36px', boxShadow: '0 8px 24px rgba(10,10,20,0.04)' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: INK, margin: '0 0 16px' }}>Where Profound wins</h2>
          <ul style={{ margin: 0, padding: 0 }}>
            <Pro>Enterprise scale — built for brands with large marketing teams and multi-market needs.</Pro>
            <Pro>Depth of funding — $335M+ raised means a big team shipping fast.</Pro>
            <Pro>Category leadership — named the leader on G2's first Answer Engine Optimization grid.</Pro>
            <Pro>Compliance posture — SOC 2 Type II, HIPAA, and SSO for regulated industries.</Pro>
          </ul>
        </div>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: '36px', boxShadow: '0 8px 24px rgba(10,10,20,0.04)' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: INK, margin: '0 0 16px' }}>Where Rankall wins</h2>
          <ul style={{ margin: 0, padding: 0 }}>
            <Pro>Self-serve at $39/month — no sales call, no custom quote, no enterprise contract.</Pro>
            <Pro>Built for local businesses — dentists, plumbers, med spas — not Fortune 500 brand teams.</Pro>
            <Pro>Open methodology — every weight and formula published; Profound's scoring is proprietary.</Pro>
            <Pro>Fix engine + verification loop — not just measurement, but fixes with before-and-after proof.</Pro>
          </ul>
        </div>
      </section>

      <section style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px 32px' }}>
        <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 20, padding: '36px' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#92400E', margin: '0 0 16px' }}>Where Rankall is still catching up</h2>
          <ul style={{ margin: 0, padding: 0 }}>
            <li style={{ fontSize: 15, color: '#78350F', lineHeight: 1.7, marginBottom: 10, listStyle: 'none', paddingLeft: 28, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 0, fontWeight: 800 }}>–</span>
              We're pre-launch: zero verified customer outcomes published so far. Profound has 1,000+ enterprise customers.
            </li>
            <li style={{ fontSize: 15, color: '#78350F', lineHeight: 1.7, marginBottom: 10, listStyle: 'none', paddingLeft: 28, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 0, fontWeight: 800 }}>–</span>
              No public API yet — it's on our roadmap, Profound ships enterprise integrations today.
            </li>
            <li style={{ fontSize: 15, color: '#78350F', lineHeight: 1.7, marginBottom: 0, listStyle: 'none', paddingLeft: 28, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 0, fontWeight: 800 }}>–</span>
              If you're an enterprise brand team needing SSO, HIPAA, and dedicated support, Profound is the safer pick today.
            </li>
          </ul>
        </div>
      </section>

      <section style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px 120px', textAlign: 'center' }}>
        <p style={{ fontSize: 15, color: BODY, lineHeight: 1.7, margin: '0 0 24px' }}>
          Don't take our word for the scoring — read <Link href="/methodology" style={{ color: BLUE, fontWeight: 600 }}>exactly how Rankall scores you</Link>,
          including what we can't measure.
        </p>
        <Link href="/#scan" style={{ display: 'inline-block', background: BLUE, borderRadius: 999, padding: '15px 36px', fontSize: 15, fontWeight: 700, color: '#fff', textDecoration: 'none', boxShadow: '0 12px 32px rgba(27,23,255,0.35)' }}>
          Get My Free Score →
        </Link>
      </section>
    </div>
  );
}
