import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase';

// V2 design tokens
const INK = '#0A0A14';
const BLUE = '#1B17FF';
const BODY = '#55556A';
const BG = '#F6F6FB';
const CARD = '#FFFFFF';
const BORDER = '#EDEDF4';
const GREEN = '#059669';

interface VerifiedOutcome {
  id: string;
  business_name: string | null;
  business_industry: string | null;
  fix_type: string | null;
  score_before: number | null;
  score_after: number | null;
  score_improvement: number | null;
  verified_at: string | null;
}

async function getPublicOutcome(id: string): Promise<VerifiedOutcome | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('verified_outcomes')
    .select('id, business_name, business_industry, fix_type, score_before, score_after, score_improvement, verified_at')
    .eq('id', id)
    .eq('is_verified', true)
    .eq('is_public', true)
    .maybeSingle();
  return (data as VerifiedOutcome | null) ?? null;
}

function fixLabel(fixType: string | null): string {
  if (!fixType) return 'AI visibility fixes';
  return fixType
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const outcome = await getPublicOutcome(id);
  if (!outcome) return { title: 'Not found | Rankall.io' };
  const name = outcome.business_name || 'A local business';
  return {
    title: `${name} — Verified AI Visibility Result | Rankall.io`,
    description: `${name} improved its AI Visibility Score from ${outcome.score_before} to ${outcome.score_after} (+${outcome.score_improvement} points), verified by Rankall on ${outcome.verified_at?.slice(0, 10)}.`,
  };
}

export default async function VerifiedProofPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const outcome = await getPublicOutcome(id);
  if (!outcome) notFound();

  const name = outcome.business_name || 'A local business';
  const improvement = outcome.score_improvement ?? (outcome.score_after ?? 0) - (outcome.score_before ?? 0);
  const verifiedDate = outcome.verified_at ? new Date(outcome.verified_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null;

  return (
    <div style={{ background: BG, minHeight: '100vh', fontFamily: "'Geist','Inter','Helvetica Neue',Arial,sans-serif" }}>
      <section style={{ padding: '72px 24px 48px', textAlign: 'center' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#fff', background: GREEN, borderRadius: 999, padding: '8px 20px' }}>
            ✓ Verified by Rankall
          </span>
          <h1 style={{ margin: 0, fontSize: 'clamp(32px,4.5vw,52px)', fontWeight: 700, color: INK, letterSpacing: '-0.04em', lineHeight: 1.05 }}>
            {name}
          </h1>
          <p style={{ margin: 0, fontSize: 17, color: BODY, lineHeight: 1.7 }}>
            Improved its AI Visibility Score from <strong style={{ color: INK }}>{outcome.score_before}</strong> to{' '}
            <strong style={{ color: INK }}>{outcome.score_after}</strong> — a verified gain of{' '}
            <strong style={{ color: GREEN }}>+{improvement} points</strong>.
          </p>
        </div>
      </section>

      <section style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px 64px' }}>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: '40px', boxShadow: '0 8px 24px rgba(10,10,20,0.04)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 24, marginBottom: 32 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#8A8AA3', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>Before</p>
              <p style={{ fontSize: 44, fontWeight: 800, color: INK, margin: 0 }}>{outcome.score_before}<span style={{ fontSize: 16, color: '#8A8AA3', fontWeight: 500 }}>/100</span></p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 28, color: GREEN, fontWeight: 800 }}>→</span>
            </div>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#8A8AA3', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>After</p>
              <p style={{ fontSize: 44, fontWeight: 800, color: GREEN, margin: 0 }}>{outcome.score_after}<span style={{ fontSize: 16, color: '#8A8AA3', fontWeight: 500 }}>/100</span></p>
            </div>
          </div>
          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 15, color: BODY, margin: 0, lineHeight: 1.7 }}>
              <strong style={{ color: INK }}>Fix applied:</strong> {fixLabel(outcome.fix_type)}
            </p>
            {verifiedDate ? (
              <p style={{ fontSize: 15, color: BODY, margin: 0, lineHeight: 1.7 }}>
                <strong style={{ color: INK }}>Verified:</strong> {verifiedDate} — confirmed by a real before-and-after rescan, not a prediction.
              </p>
            ) : null}
            {outcome.business_industry ? (
              <p style={{ fontSize: 15, color: BODY, margin: 0, lineHeight: 1.7 }}>
                <strong style={{ color: INK }}>Industry:</strong> {outcome.business_industry}
              </p>
            ) : null}
          </div>
        </div>

        <div style={{ marginTop: 32, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: '36px', textAlign: 'center' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: INK, margin: '0 0 10px', letterSpacing: '-0.02em' }}>
            What does “verified” mean?
          </h2>
          <p style={{ fontSize: 15, color: BODY, lineHeight: 1.7, margin: '0 0 24px', maxWidth: 560, marginLeft: 'auto', marginRight: 'auto' }}>
            Rankall marks a result verified only when a real rescan — after the fix was applied —
            shows the improvement. Predictions are never labeled verified. Read exactly how we score:{' '}
            <Link href="/methodology" style={{ color: BLUE, fontWeight: 600 }}>our methodology</Link>.
          </p>
          <Link href="/#scan" style={{ display: 'inline-block', background: BLUE, borderRadius: 999, padding: '15px 36px', fontSize: 15, fontWeight: 700, color: '#fff', textDecoration: 'none', boxShadow: '0 12px 32px rgba(27,23,255,0.35)' }}>
            Get My Free Score →
          </Link>
        </div>
      </section>
    </div>
  );
}
