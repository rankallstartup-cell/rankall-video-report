'use client';

import { useRef } from 'react';
import Logo from '@/components/Logo';

// b8b7 — the card itself (client component for the PNG download).
// Every value arrives as a prop from the SERVER page, which loads the
// scan via loadShareableScanRow. Nothing is read from URL params here:
// the old page took score/business/industry/city/competitor straight
// from ?score=&business=…, so anyone could mint a "score 100" card
// for any business. That is gone.

export interface ScoreCardProps {
  score: number;
  business: string;
  industry: string;
  city: string;
  competitor: string | null;
  competitorScore: number | null;
  scanDate: string;
}

export default function ScoreCardView(props: ScoreCardProps) {
  const { score, business, industry, city, competitor, competitorScore, scanDate } = props;
  const cardRef = useRef<HTMLDivElement>(null);

  const scoreColor = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444';

  const handleDownload = async () => {
    const html2canvas = (await import('html2canvas')).default;
    if (!cardRef.current) return;
    const canvas = await html2canvas(cardRef.current, {
      width: 1200,
      height: 630,
      scale: 1,
      backgroundColor: '#0a0a1a',
      useCORS: true,
    });
    const link = document.createElement('a');
    link.download = 'rankall-score-card.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div style={{ minHeight: '100vh', fontFamily: "'Geist','Inter',sans-serif", background: '#0a0a1a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <button
        onClick={handleDownload}
        style={{ background: '#1B17FF', color: 'white', border: 'none', padding: '12px 28px', borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 24 }}
      >
        Download as PNG
      </button>

      <div
        ref={cardRef}
        style={{ width: 1200, height: 630, background: '#0a0a1a', position: 'relative', fontFamily: 'Arial, sans-serif', overflow: 'hidden', borderRadius: 12, maxWidth: '100%' }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, background: '#1B17FF' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6, background: '#1B17FF' }} />

        <div style={{ padding: '50px 60px', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
          <div style={{ marginBottom: 20 }}><Logo variant="white" height={34} /></div>

          <div style={{ display: 'flex', justifyContent: 'space-between', flex: 1, alignItems: 'flex-start' }}>
            <div>
              <div style={{ color: '#6b7280', fontSize: 16, letterSpacing: 3, marginBottom: 8 }}>AI VISIBILITY SCORE</div>
              <div style={{ color: scoreColor, fontSize: 180, fontWeight: 900, lineHeight: 1, marginBottom: 4 }}>{score}</div>
              <div style={{ color: '#4b5563', fontSize: 28, marginBottom: 24 }}>out of 100</div>
              <div style={{ color: 'white', fontSize: 28, fontWeight: 600, marginBottom: 8 }}>{business}</div>
              <div style={{ color: '#9ca3af', fontSize: 20, marginBottom: 8 }}>{industry}{city ? ` · ${city}` : ''}</div>
              <div style={{ color: '#6b7280', fontSize: 14, marginBottom: 8 }}>Scanned {scanDate}</div>
              {competitor && competitorScore != null && (
                <div style={{ color: '#ef4444', fontSize: 16 }}>Competitor {competitor} scores {competitorScore}/100</div>
              )}
            </div>

            <div style={{ textAlign: 'left', paddingTop: 10 }}>
              <div style={{ color: '#6b7280', fontSize: 14, letterSpacing: 2, marginBottom: 4 }}>TRACKED ACROSS</div>
              <div style={{ color: 'white', fontSize: 80, fontWeight: 900, lineHeight: 1, marginBottom: 4 }}>11</div>
              <div style={{ color: '#6b7280', fontSize: 14, marginBottom: 16 }}>AI PLATFORMS</div>
              <div style={{ color: '#4b5563', fontSize: 13, lineHeight: 2 }}>ChatGPT · Gemini · Perplexity</div>
              <div style={{ color: '#4b5563', fontSize: 13, lineHeight: 2 }}>Grok · Copilot · Claude</div>
              <div style={{ color: '#4b5563', fontSize: 13, lineHeight: 2 }}>DeepSeek · Mistral · Kimi</div>
              <div style={{ color: '#4b5563', fontSize: 13, lineHeight: 2, marginBottom: 24 }}>Groq · Google AI</div>
              <div style={{ background: '#1B17FF', color: 'white', padding: '12px 20px', borderRadius: 8, fontSize: 15, fontWeight: 700, display: 'inline-block' }}>Scan your business free</div>
            </div>
          </div>

          <div style={{ textAlign: 'center', color: '#374151', fontSize: 13, marginTop: 8 }}>rankall.io · AI Visibility Platform for Local Businesses</div>
        </div>
      </div>
    </div>
  );
}
