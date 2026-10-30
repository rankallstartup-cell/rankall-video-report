export interface PlatformScore {
  platform: string;
  weight: number;
  score: number;
  mentioned: boolean;
  sentiment: 'positive' | 'neutral' | 'negative';
  rank: number | null;
}

export interface ScanResult {
  overallScore: number;
  trustScore: number;
  platformScores: PlatformScore[];
  topCompetitor: string;
  competitorScore: number;
  gap: number;
}

export function scoreResponse(
  response: string,
  businessName: string,
  platform: string,
  weight: number
): PlatformScore {
  if (!response || !businessName) {
    return { platform, weight, score: 0, mentioned: false, sentiment: 'neutral', rank: null };
  }

  const lower = response.toLowerCase();
  const bizLower = businessName.toLowerCase();
  const mentioned = lower.includes(bizLower);

  // Sentiment scoring
  const positiveWords = ['excellent', 'best', 'top', 'highly recommend', 'outstanding', 'great', 'trusted', 'reliable'];
  const negativeWords = ['avoid', 'poor', 'bad', 'terrible', 'worst', 'unreliable', 'scam'];
  const positiveCount = positiveWords.filter(w => lower.includes(w)).length;
  const negativeCount = negativeWords.filter(w => lower.includes(w)).length;
  const sentiment = negativeCount > positiveCount ? 'negative' : positiveCount > 0 ? 'positive' : 'neutral';

  // Find rank if mentioned
  let rank: number | null = null;
  if (mentioned) {
    const lines = response.split('\n');
    lines.forEach((line, i) => {
      if (line.toLowerCase().includes(bizLower)) rank = i + 1;
    });
  }

  // Calculate score
  let score = 0;
  if (mentioned) score += 50;
  if (sentiment === 'positive') score += 30;
  if (sentiment === 'neutral' && mentioned) score += 10;
  if (rank !== null && rank <= 3) score += 20;
  score = Math.min(score, 100);

  return { platform, weight, score, mentioned, sentiment, rank };
}

export function calculateOverallScore(platformScores: PlatformScore[]): number {
  if (!platformScores.length) return 0;
  const weighted = platformScores.reduce((sum, ps) => sum + ps.score * ps.weight, 0);
  const totalWeight = platformScores.reduce((sum, ps) => sum + ps.weight, 0);
  return totalWeight > 0 ? Math.round(weighted / totalWeight) : 0;
}