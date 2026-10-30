import { OgLogo } from '@/lib/ogLogo';
// Generic marketing OG share card (azxe). Same dark brand frame as the
// /api/og/report card, but headline + value prop instead of a score box —
// for homepage / pricing / blog / other marketing pages. 1200x630 (628).
type MarketingOgImageProps = {
  title: string;
  subtitle: string;
};

export function MarketingOgImage({ title, subtitle }: MarketingOgImageProps) {
  return (
    <div style={{ width: 1200, height: 628, background: '#0A0A14', display: 'flex', flexDirection: 'column', padding: '52px 60px 44px', fontFamily: 'sans-serif', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 1200, height: 4, background: '#1B17FF' }} />
      <OgLogo size={40} />
      <div style={{ marginTop: 20, width: 260, height: 32, borderRadius: 8, background: '#1E293B', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: 13, fontWeight: 700 }}>AI VISIBILITY PLATFORM</div>
      <div style={{ marginTop: 28, fontSize: 56, fontWeight: 900, color: 'white', lineHeight: 1.1 }}>{title}</div>
      <div style={{ marginTop: 16, fontSize: 24, fontWeight: 600, color: '#94A3B8', lineHeight: 1.4 }}>{subtitle}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto' }}>
        <div style={{ width: 320, height: 56, borderRadius: 14, background: '#1B17FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 18, fontWeight: 700 }}>Scan your business free &gt;</div>
        <div style={{ fontSize: 14, color: '#334155' }}>Powered by rankall.io — AI Recommendation Intelligence</div>
      </div>
    </div>
  );
}
