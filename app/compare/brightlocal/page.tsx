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
  title: { absolute: 'Rankall vs BrightLocal — Honest Comparison | Rankall.io' },
  alternates: { canonical: '/compare/brightlocal' },
  description:
    'Honest comparison of Rankall vs BrightLocal for local AI search visibility: platforms tracked, pricing, cadence, and who each product is actually built for.',
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

export default function CompareBrightLocalPage() {
  return (
    <div style={{ background: BG, minHeight: '100vh', fontFamily: "'Geist','Inter','Helvetica Neue',Arial,sans-serif" }}>
      <section style={{ padding: '88px 24px 56px', textAlign: 'center' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: BLUE, background: '#EEF0FF', borderRadius: 999, padding: '8px 20px' }}>
            Honest comparison
          </span>
          <h1 style={{ margin: 0, fontSize: 'clamp(36px,5vw,58px)', fontWeight: 700, color: INK, letterSpacing: '-0.045em', lineHeight: 1.02 }}>
            Rankall vs <span style={{ color: BLUE }}>BrightLocal</span>
          </h1>
          <p style={{ margin: 0, fontSize: 17, color: BODY, lineHeight: 1.7, maxWidth: 620 }}>
            BrightLocal is the incumbent local SEO platform — and now the most direct competitor
            for the local AI visibility wedge. Here's an honest look at both.
          </p>
        </div>
      </section>

      <section style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px 32px' }}>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: '40px', boxShadow: '0 8px 24px rgba(10,10,20,0.04)' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: INK, margin: '0 0 8px', letterSpacing: '-0.02em' }}>The facts</h2>
          <Row k="BrightLocal AI tracker" v="Local AI Visibility Tracker: up to 20 prompts per location across ChatGPT, Google AI Overviews, and Google AI Mode. Included in all plans." />
          <Row k="BrightLocal pricing" v="Track $41/mo, Manage $54/mo, Grow $65/mo — each per location. 14-day free trial." />
          <Row k="BrightLocal cadence" v="AI visibility tracked twice per month per location." />
          <Row k="BrightLocal research" v="September 2026 study of 200,875 prompts and 1.9M citations: Google Maps mentioned a business 66% of the time vs 32–38% on AI surfaces." />
          <Row k="Rankall pricing" v="Free tier (3 scans/month, no card). Local Pro $39/month — flat, not per location." />
          <Row k="Rankall coverage" v="12 AI platforms scanned, with published per-platform weights." />
          <Row k="Rankall methodology" v="Fully open — scoring formula, weights, and limits published on our methodology page." />
        </div>
      </section>

      <section style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px 32px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(320px,100%),1fr))', gap: 16 }}>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: '36px', boxShadow: '0 8px 24px rgba(10,10,20,0.04)' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: INK, margin: '0 0 16px' }}>Where BrightLocal wins</h2>
          <ul style={{ margin: 0, padding: 0 }}>
            <Pro>Full local SEO suite — rank tracking, citations, reviews, listings — AI visibility is one tab among many.</Pro>
            <Pro>Trusted incumbent — 100,000+ businesses, hundreds of staff, a decade of local SEO credibility.</Pro>
            <Pro>Bundled pricing — the AI tracker comes inside plans you're probably already paying for.</Pro>
            <Pro>Original research — their 200k-prompt study is the best public data on the Maps-vs-AI gap.</Pro>
          </ul>
        </div>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: '36px', boxShadow: '0 8px 24px rgba(10,10,20,0.04)' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: INK, margin: '0 0 16px' }}>Where Rankall wins</h2>
          <ul style={{ margin: 0, padding: 0 }}>
            <Pro>12 AI platforms vs 3 — ChatGPT, Gemini, Perplexity, Claude, Copilot, Grok, and more, not just Google's surfaces.</Pro>
            <Pro>Built AI-first — every scan, fix, and rescan is designed around AI answers, not bolted onto rank tracking.</Pro>
            <Pro>Fix engine + verification — we don't just show the gap, we generate the fix and prove it worked on rescan.</Pro>
            <Pro>Open methodology — every weight published; you can audit exactly how your score is computed.</Pro>
          </ul>
        </div>
      </section>

      <section style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px 32px' }}>
        <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 20, padding: '36px' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#92400E', margin: '0 0 16px' }}>Where Rankall is still catching up</h2>
          <ul style={{ margin: 0, padding: 0 }}>
            <li style={{ fontSize: 15, color: '#78350F', lineHeight: 1.7, marginBottom: 10, listStyle: 'none', paddingLeft: 28, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 0, fontWeight: 800 }}>–</span>
              We're pre-launch: zero verified customer outcomes published so far. BrightLocal serves 100,000+ businesses.
            </li>
            <li style={{ fontSize: 15, color: '#78350F', lineHeight: 1.7, marginBottom: 10, listStyle: 'none', paddingLeft: 28, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 0, fontWeight: 800 }}>–</span>
              No citation management, review monitoring, or listing sync — if you need the full local SEO suite, BrightLocal covers more ground.
            </li>
            <li style={{ fontSize: 15, color: '#78350F', lineHeight: 1.7, marginBottom: 0, listStyle: 'none', paddingLeft: 28, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 0, fontWeight: 800 }}>–</span>
              BrightLocal's twice-monthly AI tracking is the honest gap to beat — we're built for continuous monitoring, and we'll prove the cadence difference with data.
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
