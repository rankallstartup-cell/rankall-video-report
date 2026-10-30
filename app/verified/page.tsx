import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase';

const INK = '#0A0A14';
const BLUE = '#1B17FF';
const BODY = '#55556A';
const BG = '#F6F6FB';
const CARD = '#FFFFFF';
const BORDER = '#EDEDF4';
const GREEN = '#059669';

interface PublicOutcome {
  id: string;
  business_name: string | null;
  business_industry: string | null;
  score_before: number | null;
  score_after: number | null;
  score_improvement: number | null;
  verified_at: string | null;
}

export const metadata = {
  title: { absolute: 'Verified Results | Rankall.io' },
  alternates: { canonical: '/verified' },
  description: 'Real before-and-after AI visibility results, verified by rescan. Only permissioned, verified outcomes are published — never predictions.',
};

export default async function VerifiedIndexPage() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('verified_outcomes')
    .select('id, business_name, business_industry, score_before, score_after, score_improvement, verified_at')
    .eq('is_verified', true)
    .eq('is_public', true)
    .order('verified_at', { ascending: false })
    .limit(50);
  const outcomes = (data as PublicOutcome[] | null) ?? [];

  return (
    <div style={{ background: BG, minHeight: '100vh', fontFamily: "'Geist','Inter','Helvetica Neue',Arial,sans-serif" }}>
      <section style={{ padding: '88px 24px 56px', textAlign: 'center' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: BLUE, background: '#EEF0FF', borderRadius: 999, padding: '8px 20px' }}>
            Proof, not promises
          </span>
          <h1 style={{ margin: 0, fontSize: 'clamp(36px,5vw,58px)', fontWeight: 700, color: INK, letterSpacing: '-0.045em', lineHeight: 1.02 }}>
            Verified <span style={{ color: GREEN }}>results</span>
          </h1>
          <p style={{ margin: 0, fontSize: 17, color: BODY, lineHeight: 1.7, maxWidth: 620 }}>
            Every result below is a real before-and-after rescan — published with the business's
            permission. Predictions are never labeled verified.
          </p>
        </div>
      </section>

      <section style={{ maxWidth: 920, margin: '0 auto', padding: '0 24px 120px' }}>
        {outcomes.length === 0 ? (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 20, padding: '64px 40px', textAlign: 'center', boxShadow: '0 8px 24px rgba(10,10,20,0.04)' }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: INK, margin: '0 0 10px' }}>No public verifications yet</p>
            <p style={{ fontSize: 15, color: BODY, lineHeight: 1.7, margin: '0 0 28px', maxWidth: 520, marginLeft: 'auto', marginRight: 'auto' }}>
              We're earning the first verified outcomes with pilot partners now — fixes applied,
              rescans confirming the improvement. They'll appear here, wins and misses, as they land.
            </p>
            <Link href="/methodology" style={{ display: 'inline-block', border: `1.5px solid ${BORDER}`, borderRadius: 999, padding: '13px 30px', fontSize: 14, fontWeight: 700, color: INK, textDecoration: 'none' }}>
              How verification works
            </Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(280px,100%),1fr))', gap: 16 }}>
            {outcomes.map(o => {
              const improvement = o.score_improvement ?? (o.score_after ?? 0) - (o.score_before ?? 0);
              return (
                <Link key={o.id} href={`/verified/${o.id}`} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 18, padding: '28px', textDecoration: 'none', boxShadow: '0 8px 24px rgba(10,10,20,0.04)', display: 'block' }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: INK, margin: '0 0 6px' }}>{o.business_name || 'A local business'}</p>
                  {o.business_industry ? (
                    <p style={{ fontSize: 13, color: '#8A8AA3', margin: '0 0 16px' }}>{o.business_industry}</p>
                  ) : null}
                  <p style={{ margin: 0, fontSize: 15, color: BODY }}>
                    <span style={{ fontWeight: 800, color: INK }}>{o.score_before}</span>
                    <span style={{ color: '#8A8AA3' }}> → </span>
                    <span style={{ fontWeight: 800, color: GREEN }}>{o.score_after}</span>
                    <span style={{ display: 'inline-block', marginLeft: 10, fontSize: 13, fontWeight: 700, color: '#fff', background: GREEN, borderRadius: 999, padding: '3px 12px' }}>+{improvement}</span>
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
