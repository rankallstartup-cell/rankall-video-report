'use client';
import { useEffect, useState } from 'react';
import { PlanPageGuard } from '@/components/PlanPageGuard';
import { knownImpactRangeForFix, canonicalFixImpact } from '@/lib/fixIntelligence';
import { getBrowserClient } from '@/lib/supabase';
import { usePlan } from '@/lib/usePlan';
import { getPlanConfig, normalizePlan } from '@/lib/planConfig';

// ax81: playbook impacts come from the same fix metadata ranges as the fix
// queue (labelled estimates). The old hardcoded 'Est. +31 pts' figures and
// per-fix 'count' numbers were invented. Steps without a matching fix type
// show no number. Order = canonical impact, highest first.
function ranked<T extends { fixType: string | null }>(fixes: T[]): Array<T & { rank: number }> {
  return [...fixes]
    .map((f, i) => ({ f, i, v: canonicalFixImpact(f.fixType) ?? -1 }))
    .sort((a, b) => b.v - a.v || a.i - b.i)
    .map((x, i) => ({ ...x.f, rank: i + 1 }));
}

const C = {
  bg: '#FFFFFF', surface: '#F6F6FB', border: '#E7E7F0',
  navy: '#0A0A14', blue: '#1B17FF', green: '#12A150', gray: '#55556A', lgray: '#94A3B8',
};

const PLAYBOOKS: Record<string, {
  icon: React.ReactNode; title: string;
  fixes: { rank: number; name: string; fixType: string | null; description: string }[];
}> = {
  dentist: {
    icon: <svg viewBox="0 0 448 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M186.1 52.1C169.3 39.1 148.7 32 127.5 32C74.7 32 32 74.7 32 127.5l0 6.2c0 15.8 3.7 31.3 10.7 45.5l23.5 47.1c4.5 8.9 7.6 18.4 9.4 28.2l36.7 205.8c2 11.2 11.6 19.4 22.9 19.8s21.4-7.4 24-18.4l28.9-121.3C192.2 323.7 207 312 224 312s31.8 11.7 35.8 28.3l28.9 121.3c2.6 11.1 12.7 18.8 24 18.4s20.9-8.6 22.9-19.8l36.7-205.8c1.8-9.8 4.9-19.3 9.4-28.2l23.5-47.1c7.1-14.1 10.7-29.7 10.7-45.5l0-2.1c0-55-44.6-99.6-99.6-99.6c-24.1 0-47.4 8.8-65.6 24.6l-3.2 2.8 19.5 15.2c7 5.4 8.2 15.5 2.8 22.5s-15.5 8.2-22.5 2.8l-24.4-19-37-28.8z"/></svg>, title: 'Dental Practice Playbook',
    fixes: [
      { rank: 1, name: 'FAQ Schema Markup', fixType: 'faq_schema', description: 'Add structured FAQ data answering "best dentist in [city]" queries — AI platforms extract these directly.' },
      { rank: 2, name: 'Healthgrades Profile Completion', fixType: 'directory', description: 'Complete your Healthgrades profile with all services, hours, and photos. AI models cite it heavily.' },
      { rank: 3, name: 'Google Review Velocity', fixType: 'reviews', description: 'Get 10+ new Google reviews per month. AI models weight recency heavily in recommendation decisions.' },
      { rank: 4, name: 'NHS/Zocdoc Profile', fixType: 'directory', description: 'GB: NHS profile. US: Zocdoc. Key trust signal AI uses when recommending dental practices.' },
      { rank: 5, name: 'Reddit Local Presence', fixType: 'reddit', description: 'Get mentioned in r/[city] and r/AskDentistry. Reddit is heavily indexed by all major AI platforms.' },
    ],
  },
  lawyer: {
    icon: <svg viewBox="0 0 640 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M384 32l128 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L398.4 96c-5.2 25.8-22.9 47.1-46.4 57.3L352 448l160 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-192 0-192 0c-17.7 0-32-14.3-32-32s14.3-32 32-32l160 0 0-294.7c-23.5-10.3-41.2-31.6-46.4-57.3L128 96c-17.7 0-32-14.3-32-32s14.3-32 32-32l128 0c14.6-19.4 37.8-32 64-32s49.4 12.6 64 32zm55.6 288l144.9 0L512 195.8 439.6 320zM512 416c-62.9 0-115.2-34-126-78.9c-2.6-11 1-22.3 6.7-32.1l95.2-163.2c5-8.6 14.2-13.8 24.1-13.8s19.1 5.3 24.1 13.8l95.2 163.2c5.7 9.8 9.3 21.1 6.7 32.1C627.2 382 574.9 416 512 416zM126.8 195.8L54.4 320l144.9 0L126.8 195.8zM.9 337.1c-2.6-11 1-22.3 6.7-32.1l95.2-163.2c5-8.6 14.2-13.8 24.1-13.8s19.1 5.3 24.1 13.8l95.2 163.2c5.7 9.8 9.3 21.1 6.7 32.1C242 382 189.7 416 126.8 416S11.7 382 .9 337.1z"/></svg>, title: 'Law Firm Playbook',
    fixes: [
      { rank: 1, name: 'Avvo/Martindale Profile', fixType: 'directory', description: 'Legal directories are the primary trust signals AI uses when recommending attorneys.' },
      { rank: 2, name: 'Trustpilot Profile', fixType: 'reviews', description: 'Trustpilot reviews are cited by Claude and Gemini for professional services recommendations.' },
      { rank: 3, name: 'Legal FAQ Schema', fixType: 'faq_schema', description: 'Answer "best [practice area] lawyer in [city]" questions in structured schema on your site.' },
      { rank: 4, name: 'Bar Association Profile', fixType: 'directory', description: 'State/national bar association listings are authoritative sources AI models trust.' },
      { rank: 5, name: 'Case Study Content', fixType: 'content', description: 'Published case outcomes (anonymized) become AI citation sources and trust signals.' },
    ],
  },
  hvac: {
    icon: <svg viewBox="0 0 512 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M352 320c88.4 0 160-71.6 160-160c0-15.3-2.2-30.1-6.2-44.2c-3.1-10.8-16.4-13.2-24.3-5.3l-76.8 76.8c-3 3-7.1 4.7-11.3 4.7L336 192c-8.8 0-16-7.2-16-16l0-57.4c0-4.2 1.7-8.3 4.7-11.3l76.8-76.8c7.9-7.9 5.4-21.2-5.3-24.3C382.1 2.2 367.3 0 352 0C263.6 0 192 71.6 192 160c0 19.1 3.4 37.5 9.5 54.5L19.9 396.1C7.2 408.8 0 426.1 0 444.1C0 481.6 30.4 512 67.9 512c18 0 35.3-7.2 48-19.9L297.5 310.5c17 6.2 35.4 9.5 54.5 9.5zM80 408a24 24 0 1 1 0 48 24 24 0 1 1 0-48z"/></svg>, title: 'HVAC Company Playbook',
    fixes: [
      { rank: 1, name: 'HomeAdvisor/Angi Profile', fixType: 'directory', description: 'Home service directories are a key citation source for HVAC AI recommendations.' },
      { rank: 2, name: 'Local Schema Markup', fixType: 'jsonld', description: 'LocalBusiness schema with service area markup significantly boosts AI recommendation visibility.' },
      { rank: 3, name: 'Emergency Service Keywords', fixType: 'content', description: '"24/7 emergency AC repair [city]" content — AI models prioritize availability signals.' },
      { rank: 4, name: 'BBB Accreditation', fixType: 'directory', description: 'BBB A+ rating is cited by multiple AI platforms as a trust signal for home services.' },
      { rank: 5, name: 'Nextdoor Business Profile', fixType: 'directory', description: 'Nextdoor recommendations appear in AI responses for hyperlocal searches.' },
    ],
  },
  restaurant: {
    icon: <svg viewBox="0 0 512 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M169.7 .9c-22.8-1.6-41.9 14-47.5 34.7L110.4 80c.5 0 1.1 0 1.6 0c176.7 0 320 143.3 320 320c0 .5 0 1.1 0 1.6l44.4-11.8c20.8-5.5 36.3-24.7 34.7-47.5C498.5 159.5 352.5 13.5 169.7 .9zM399.8 410.2c.1-3.4 .2-6.8 .2-10.2c0-159.1-128.9-288-288-288c-3.4 0-6.8 .1-10.2 .2L.5 491.9c-1.5 5.5 .1 11.4 4.1 15.4s9.9 5.6 15.4 4.1L399.8 410.2zM176 208a32 32 0 1 1 0 64 32 32 0 1 1 0-64zm64 128a32 32 0 1 1 64 0 32 32 0 1 1 -64 0zM96 384a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"/></svg>, title: 'Restaurant Playbook',
    fixes: [
      { rank: 1, name: 'Google Business Menu', fixType: 'gbp', description: 'Complete menu on Google Business Profile — AI extracts it directly for food recommendations.' },
      { rank: 2, name: 'Yelp Elite Reviews', fixType: 'reviews', description: 'Yelp Elite reviewer mentions are heavily weighted in AI food recommendation algorithms.' },
      { rank: 3, name: 'TripAdvisor Profile', fixType: 'directory', description: 'TripAdvisor is a primary source for restaurant AI citations across all major platforms.' },
      { rank: 4, name: 'Food Schema Markup', fixType: 'jsonld', description: 'Restaurant schema with cuisine type, price range, and hours boosts AI visibility significantly.' },
      { rank: 5, name: 'Local Food Blog Features', fixType: null, description: 'Local food blog mentions become AI training data — proactively reach out to food bloggers.' },
    ],
  },
  salon: {
    icon: <svg viewBox="0 0 512 512" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M256 192l-39.5-39.5c4.9-12.6 7.5-26.2 7.5-40.5C224 50.1 173.9 0 112 0S0 50.1 0 112s50.1 112 112 112c14.3 0 27.9-2.7 40.5-7.5L192 256l-39.5 39.5c-12.6-4.9-26.2-7.5-40.5-7.5C50.1 288 0 338.1 0 400s50.1 112 112 112s112-50.1 112-112c0-14.3-2.7-27.9-7.5-40.5L499.2 76.8c7.1-7.1 7.1-18.5 0-25.6c-28.3-28.3-74.1-28.3-102.4 0L256 192zm22.6 150.6L396.8 460.8c28.3 28.3 74.1 28.3 102.4 0c7.1-7.1 7.1-18.5 0-25.6L342.6 278.6l-64 64zM64 112a48 48 0 1 1 96 0 48 48 0 1 1 -96 0zm48 240a48 48 0 1 1 0 96 48 48 0 1 1 0-96z"/></svg>, title: 'Salon & Beauty Playbook',
    fixes: [
      { rank: 1, name: 'StyleSeat/Vagaro Profile', fixType: 'directory', description: 'Beauty booking platforms are primary AI citation sources for salon recommendations.' },
      { rank: 2, name: 'Instagram Portfolio Link', fixType: null, description: 'Active Instagram with tagged location photos is cited by AI for visual service businesses.' },
      { rank: 3, name: 'Google Review Photos', fixType: 'gbp', description: 'Before/after photos on Google Business significantly improve AI recommendation rates.' },
      { rank: 4, name: 'Service Menu Schema', fixType: 'jsonld', description: 'Structured service data (haircut, color, price) on your website improves AI extraction.' },
      { rank: 5, name: 'Yelp Beauty Category', fixType: 'directory', description: 'Yelp beauty category completion with all services listed boosts platform-level visibility.' },
    ],
  },
};

export default function PlaybooksPage() {
  const [active, setActive] = useState<string>('dentist');
  const playbook = PLAYBOOKS[active];
  const fixes = ranked(playbook.fixes);
  // b8a3: session gate — logged-out visitors used to land on the PLAN
  // gate ("available on Local Business and above") with no login
  // message. Null = session not resolved yet.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const { plan, rawPlan } = usePlan();

  useEffect(() => {
    getBrowserClient().auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  if (signedIn === null) return null;

  if (signedIn === false) {
    return (
      <div style={{ padding: '32px 24px', maxWidth: 560, margin: '80px auto', textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: C.navy, marginBottom: 10 }}>AI Recommendation Playbooks</h1>
        <p style={{ fontSize: 14, color: C.gray, lineHeight: 1.7, marginBottom: 22 }}>
          Sign in to view the playbooks. They are part of your dashboard — sign in to continue, or run a free scan to get your first score.
        </p>
        <a href="/login?next=/dashboard/playbooks" style={{ display: 'inline-block', background: C.blue, color: '#fff', borderRadius: 10, padding: '12px 26px', fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
          Sign in
        </a>
      </div>
    );
  }

  return (
    <PlanPageGuard feature="canSeePlaybooks" requiredPlan="local_pro">
    <div style={{ padding: '32px 24px', maxWidth: 820, margin: '0 auto' }}>
      {/* b8a3: admin-view note (b8af pattern) — an admin on a Free account
          bypasses the Playbooks gate; say so instead of letting it look
          like the gate copy is wrong. */}
      {normalizePlan(plan) !== normalizePlan(rawPlan) && (
        <div style={{ background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: C.navy, lineHeight: 1.5 }}>
          <strong>Admin view:</strong> this account&apos;s plan is {getPlanConfig(rawPlan).displayName} — Playbooks are gated for {getPlanConfig(rawPlan).displayName} accounts. You see them because admins get full access.
        </div>
      )}
      <h1 style={{ fontSize: 24, fontWeight: 700, color: C.navy, marginBottom: 4 }}>AI Recommendation Playbooks</h1>
      <p style={{ fontSize: 14, color: C.gray, marginBottom: 28 }}>
        Industry-specific fix sequences ranked by expected impact. Start with Fix #1 — it has the highest expected improvement for your industry.
      </p>

      {/* Industry tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 32 }}>
        {Object.entries(PLAYBOOKS).map(([key, pb]) => (
          <button
            className="btn"
            key={key}
            onClick={() => setActive(key)}
            style={{
              padding: '8px 18px', borderRadius: 20,
              border: `1.5px solid ${active === key ? C.blue : C.border}`,
              background: active === key ? '#ECEBFF' : C.bg,
              color: active === key ? C.blue : C.gray,
              fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
          >
            {pb.icon} {pb.title.split(' ')[0]}
          </button>
        ))}
      </div>

      {/* Playbook card */}
      <div className="card dash-card" style={{ background: C.bg, border: `1.5px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.border}`, background: C.surface }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: C.navy }}>
            {playbook.icon} {playbook.title}
          </h2>
          <p style={{ fontSize: 13, color: C.gray, marginTop: 4 }}>
            Editorial sequence based on common fix patterns. Impact ranges are estimates from our fix metadata, not measured outcomes.
          </p>
        </div>

        {fixes.map((fix, i) => (
          <div key={i} style={{
            padding: '20px 24px',
            borderBottom: i < fixes.length - 1 ? `1px solid ${C.border}` : 'none',
            display: 'flex', alignItems: 'flex-start', gap: 16,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
              background: i === 0 ? C.blue : C.surface,
              border: `2px solid ${i === 0 ? C.blue : C.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, color: i === 0 ? '#fff' : C.gray,
            }}>
              #{fix.rank}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>{fix.name}</span>
                {fix.fixType && knownImpactRangeForFix(fix.fixType) && (
                <span style={{
                  background: '#ECFDF5', color: C.green, border: '1px solid #A7F3D0',
                  borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700,
                }}>
                  <svg viewBox="0 0 448 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg> Est. +{knownImpactRangeForFix(fix.fixType)!.min}–{knownImpactRangeForFix(fix.fixType)!.max} pts
                </span>
                )}
              </div>
              <p style={{ fontSize: 13, color: C.gray, lineHeight: 1.5 }}>{fix.description}</p>
              {i === 0 && (
                <p style={{ fontSize: 12, color: C.blue, fontWeight: 600, marginTop: 8 }}>
                  {/* b8a3: when the #2 step's canonical impact ties #1,
                      "highest" alone overstates uniqueness — say joint. */}
                  ↑ Start here — {fixes.length > 1 && canonicalFixImpact(fixes[1].fixType) != null && canonicalFixImpact(fixes[1].fixType) === canonicalFixImpact(fix.fixType)
                    ? 'joint-highest expected impact for this industry'
                    : 'highest expected impact for this industry'}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 12, color: C.lgray, textAlign: 'center', marginTop: 16 }}>
        Sequences are editorial guidance. Impact ranges are estimates from our fix metadata, not measured outcomes. Individual results vary by market and competition level.
      </p>
    </div>
    </PlanPageGuard>
  );
}
