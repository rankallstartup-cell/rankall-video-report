import { OgLogo } from '@/lib/ogLogo';
type OgImageProps = {
  businessLabel: string;
  industry: string;
  score: string;
  scoreColor: string;
  competitor: string;
  competitorLabel: string;
};

export function OgImage({ businessLabel, industry, score, scoreColor, competitor, competitorLabel }: OgImageProps) {
  return (
    <div style={{ width: 1200, height: 628, background: '#0A0A14', display: 'flex', flexDirection: 'column', padding: '52px 60px 44px', fontFamily: 'sans-serif', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 1200, height: 4, background: '#1B17FF' }} />
      <OgLogo size={40} />
      <div style={{ marginTop: 20, width: 220, height: 32, borderRadius: 8, background: '#1E293B', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: 13, fontWeight: 700 }}>FREE AI VISIBILITY REPORT</div>
      <div style={{ marginTop: 28, fontSize: 52, fontWeight: 900, color: 'white', lineHeight: 1.1 }}>{businessLabel}</div>
      {industry ? <div style={{ marginTop: 8, fontSize: 22, fontWeight: 600, color: '#64748B' }}>{industry}</div> : null}
      <div style={{ display: 'flex', marginTop: 28 }}>
        <div style={{ width: 240, height: 180, borderRadius: 20, background: '#1E293B', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 28 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#94A3B8' }}>AI VISIBILITY SCORE</div>
          <div style={{ fontSize: 88, fontWeight: 900, color: scoreColor, lineHeight: 1.1 }}>{score}</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#64748B' }}>/100</div>
        </div>
        {competitor ? (
          <div style={{ width: 340, height: 180, borderRadius: 20, background: '#1E293B', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 28, marginLeft: 36 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#94A3B8' }}>TOP COMPETITOR</div>
            <div style={{ marginTop: 36, fontSize: 24, fontWeight: 800, color: 'white' }}>{competitorLabel}</div>
            <div style={{ marginTop: 10, fontSize: 14, color: '#059669' }}>✓ Ranking on most platforms</div>
          </div>
        ) : null}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto' }}>
        <div style={{ width: 320, height: 56, borderRadius: 14, background: '#1B17FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 18, fontWeight: 700 }}>View Full Report Free &gt;</div>
        <div style={{ fontSize: 14, color: '#334155' }}>Powered by rankall.io — AI Recommendation Intelligence</div>
      </div>
    </div>
  );
}
