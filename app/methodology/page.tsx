import Link from 'next/link';
import { ACTIVE_PLATFORMS } from '@/lib/platforms';
import { PLATFORMS_SCANNED, TRUST_SIGNAL_COUNT, TRUST_SIGNALS_LABEL } from '@/lib/publicStats';

// V2 design tokens (matches /how-it-works)
const INK = '#0A0A14';
const BLUE = '#1B17FF';
const BODY = '#55556A';
const BG = '#F6F6FB';
const CARD = '#FFFFFF';
const BORDER = '#EDEDF4';
const DIM = '#8A8AA3';

const card: React.CSSProperties = {
  background: CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 20,
  padding: '36px',
  boxShadow: '0 8px 24px rgba(10,10,20,0.04)',
};

const h2: React.CSSProperties = {
  fontSize: 'clamp(26px,3.2vw,36px)',
  fontWeight: 700,
  color: INK,
  letterSpacing: '-0.03em',
  margin: '0 0 12px',
};

const lede: React.CSSProperties = {
  fontSize: 16,
  color: BODY,
  lineHeight: 1.7,
  margin: '0 0 28px',
  maxWidth: 720,
};

const p: React.CSSProperties = { fontSize: 15, color: BODY, lineHeight: 1.75, margin: '0 0 14px' };

function Section({ kicker, title, intro, children }: {
  kicker: string; title: string; intro?: string; children: React.ReactNode;
}) {
  return (
    <section style={{ maxWidth: 920, margin: '0 auto', padding: '0 24px 72px' }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 12px' }}>
        {kicker}
      </p>
      <h2 style={h2}>{title}</h2>
      {intro ? <p style={lede}>{intro}</p> : null}
      <div style={card}>{children}</div>
    </section>
  );
}

export default function MethodologyPage() {
  const weights = ACTIVE_PLATFORMS.map(pl => ({
    name: pl.name,
    pct: Math.round(pl.weight * 100),
  }));

  return (
    <div style={{ background: BG, minHeight: '100vh', fontFamily: "'Geist','Inter','Helvetica Neue',Arial,sans-serif" }}>

      {/* HERO */}
      <section style={{ padding: '88px 24px 64px', textAlign: 'center' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: BLUE, background: '#EEF0FF', borderRadius: 999, padding: '8px 20px' }}>
            Our methodology, published
          </span>
          <h1 style={{ margin: 0, fontSize: 'clamp(40px,5.5vw,64px)', fontWeight: 700, color: INK, letterSpacing: '-0.045em', lineHeight: 1.02 }}>
            How Rankall <span style={{ color: BLUE }}>scores you</span>
          </h1>
          <p style={{ margin: 0, fontSize: 18, color: BODY, lineHeight: 1.7, maxWidth: 640 }}>
            No black box. Your AI Visibility Score is calculated the same way every time,
            from rules you can read below — limits included.
          </p>
        </div>
      </section>

      {/* 1 — THE SCORE */}
      <Section
        kicker="The score"
        title="One formula, applied the same way every scan"
        intro="Your AI Visibility Score is a 0–100 number answering one question: when people ask AI for a business like yours, how often does it name you?"
      >
        <p style={p}>
          <strong style={{ color: INK }}>1. We ask {PLATFORMS_SCANNED} AI platforms the same questions.</strong>{' '}
          Every scan sends the same set of questions about your business category to each platform.
          Two platforms with strict rate limits (Mistral and Kimi) answer one question per scan
          instead of the full set — everything else gets the whole basket.
        </p>
        <p style={p}>
          <strong style={{ color: INK }}>2. Each platform gets a mention rate.</strong>{' '}
          For every platform, we count the share of its answers that mention your business.
          If ChatGPT answers 4 questions and names you in 3, its mention rate is 75%.
        </p>
        <p style={p}>
          <strong style={{ color: INK }}>3. Platforms carry different scoring weights.</strong>{' '}
          A mention on ChatGPT moves your score more than a mention on Groq, because ChatGPT
          carries the largest weight in our scoring configuration. The weights are listed in
          the table below and add up to 100%.
        </p>
        <div style={{ background: INK, borderRadius: 14, padding: '24px 28px', margin: '20px 0' }}>
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#8D8BFF', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            The formula
          </p>
          <p style={{ margin: 0, fontSize: 17, color: '#fff', fontWeight: 600, lineHeight: 1.6, fontFamily: 'ui-monospace,Menlo,monospace' }}>
            score = Σ (platform weight × mention rate) ÷ Σ (weights of platforms that answered) × 100
          </p>
        </div>
        <p style={p}>
          <strong style={{ color: INK }}>4. Platforms that don't answer are left out — never scored as zero.</strong>{' '}
          If a platform times out or errors, it is excluded from both halves of the fraction.
          A silent platform can't drag your score down, and it can't inflate it either.
        </p>
        <p style={{ ...p, marginBottom: 0, fontSize: 14, color: DIM }}>
          Your report also shows <em>Share of Recommendation</em> — the plain, unweighted share of
          platforms that named you. The headline score above is the weighted one.
        </p>
      </Section>

      {/* 2 — WEIGHT TABLE (generated from lib/platforms.ts — cannot drift from code) */}
      <Section
        kicker="Platform weights"
        title="What each platform counts for"
        intro="Weights are Rankall's scoring configuration — how much each platform counts toward your score — not a market-share measurement. This table is generated directly from our scoring code, so it can't go stale."
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(200px,100%),1fr))', gap: 12 }}>
          {weights.map(w => (
            <div key={w.name} style={{ background: BG, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: INK }}>{w.name}</span>
              <span style={{ fontSize: 18, fontWeight: 800, color: BLUE }}>{w.pct}%</span>
            </div>
          ))}
        </div>
        <p style={{ ...p, marginBottom: 0, marginTop: 20, fontSize: 14, color: DIM }}>
          Meta AI isn't in the table: it has no public API yet, so it isn't scanned and carries
          no weight. It will join the table when it launches.
        </p>
      </Section>

      {/* 3 — WHAT COUNTS AS A MENTION */}
      <Section
        kicker="Counting mentions"
        title="What counts as a “mention”"
        intro="The score hinges on one judgment per answer: did the platform name your business? Here's exactly how we call it."
      >
        <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <li style={p}>
            <strong style={{ color: INK }}>The answer has to name you.</strong>{' '}
            A neutral inclusion in a list counts. Being named is what the score measures —
            not how positively you're described.
          </li>
          <li style={p}>
            <strong style={{ color: INK }}>Disclaimers don't count.</strong>{' '}
            “We don't know Dr. Smith” is not a mention. Neither is the platform echoing your
            name back from the question (“Regarding Acme Dental, here are some dentists…”).
          </li>
          <li style={p}>
            <strong style={{ color: INK }}>Distinctive names get fuzzy matching; generic names don't.</strong>{' '}
            “BrightPath Pediatric Dentistry” can match through typos and word order. A generic
            name like “Chicago Dental Care” needs an exact match, so we never credit you for
            a competitor with a similar name.
          </li>
          <li style={{ ...p, marginBottom: 0 }}>
            <strong style={{ color: INK }}>Sentiment doesn't move the score.</strong>{' '}
            Whether the mention is glowing or lukewarm, it counts the same. Sentiment is
            labeled and stored separately — it informs your fix plan, not your score.
          </li>
        </ul>
      </Section>

      {/* 4 — TRUST SIGNALS */}
      <Section
        kicker="Trust signals"
        title={`${TRUST_SIGNAL_COUNT} signals in the catalog, ${TRUST_SIGNALS_LABEL} checked per scan`}
        intro="Alongside the AI platforms, every scan checks the trust signals AI models read when they decide who to recommend — reviews, listings, schema, social presence, and more."
      >
        <p style={p}>
          Our catalog defines <strong style={{ color: INK }}>{TRUST_SIGNAL_COUNT} trust signals</strong>.
          Each scan evaluates the subset that applies to your country and industry — that's why
          we say {TRUST_SIGNALS_LABEL} rather than promising all {TRUST_SIGNAL_COUNT} every time.
          A sushi restaurant in Chicago doesn't get checked for Healthgrades, and that's correct.
        </p>
        <p style={{ ...p, marginBottom: 0 }}>
          Checks we genuinely can't measure come back as <strong style={{ color: INK }}>“not checked”</strong> —
          never as failures. We'd rather show a gap in our own data than invent a bad grade for your business.
        </p>
      </Section>

      {/* 5 — HONEST LIMITS */}
      <Section
        kicker="Honest limits"
        title="What the score can't tell you"
        intro="A methodology page that only brags is marketing. Here's where our numbers stop."
      >
        <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <li style={p}>
            <strong style={{ color: INK }}>AI answers aren't deterministic.</strong>{' '}
            Re-running the identical scan has returned scores of 0, 0, and 4 on the same business.
            Treat one scan as a snapshot, not a census. We ask each question once per scan — we
            don't re-ask the same prompt multiple times, and repeat-run confidence scoring is on
            our roadmap, not in the product today.
          </li>
          <li style={p}>
            <strong style={{ color: INK }}>Fix impacts are predictions until verified.</strong>{' '}
            When we say a fix could lift your score by 12 points, that's a prediction. It becomes
            a fact only after a verification rescan about 7 days later confirms it.
          </li>
          <li style={{ ...p, marginBottom: 0 }}>
            <strong style={{ color: INK }}>Verified fix-to-outcome proofs so far: zero.</strong>{' '}
            We're earning the first ones now, with design partners, and we'll publish them —
            wins and misses — as they land.
          </li>
        </ul>
      </Section>

      {/* CTA */}
      <section style={{ padding: '0 24px 120px', textAlign: 'center' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 24, padding: '64px 40px', boxShadow: '0 20px 48px -24px rgba(10,10,20,0.12)' }}>
          <h2 style={{ fontSize: 'clamp(28px,3.5vw,40px)', fontWeight: 700, color: INK, letterSpacing: '-0.03em', margin: '0 0 12px' }}>
            Now you know how the score works. See yours.
          </h2>
          <p style={{ fontSize: 16, color: BODY, margin: '0 0 32px' }}>Free scan. No credit card. All {PLATFORMS_SCANNED} platforms, live.</p>
          <Link href="/#scan" style={{ display: 'inline-block', background: BLUE, borderRadius: 999, padding: '16px 40px', fontSize: 16, fontWeight: 700, color: '#fff', textDecoration: 'none', boxShadow: '0 12px 32px rgba(27,23,255,0.35)' }}>
            Get My Free Score →
          </Link>
        </div>
      </section>

    </div>
  );
}
