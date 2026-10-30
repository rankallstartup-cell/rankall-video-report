// lib/scanAccuracy.ts
// Phase 21: Scan Accuracy — TYPES + pure confidence scoring. Zero API calls,
// zero DB calls, zero new dependencies. Nothing here mutates scoring; it only
// describes and explains an already-computed scan.

export interface ScanConfidence {
  level: 'very_high' | 'high' | 'medium' | 'low';
  percentage: number;
  factors: ConfidenceFactor[];
}

export interface ConfidenceFactor {
  factor: string;
  impact: 'positive' | 'negative';
  description: string;
}

export interface ScoreExplanation {
  summary: string;
  respondedWeight: number;
  mentionedWeight: number;
  formula: string;
  plainEnglish: string;
}

export interface PlatformAccuracyDetail {
  platform: string;
  weight: number;
  status: 'success' | 'error' | 'timeout';
  mentioned: boolean;
  contribution: number;
  explanation: string;
}

export interface ScanAccuracyReport {
  scanId: string;
  businessName: string;
  query: string;
  overallScore: number;
  respondedCount: number;
  totalCount: number;
  mentionedCount: number;
  confidence: ScanConfidence;
  explanation: ScoreExplanation;
  platformBreakdown: PlatformAccuracyDetail[];
  dataQualityStatus: string;
  warnings: string[];
}

// ── Confidence scoring (pure) ───────────────────────────────────────────────
// How much should the viewer trust THIS scan's score — separate from the score
// itself. Driven by coverage, competitor availability, and cache freshness.
export function calculateScanConfidence(
  respondedCount: number,
  totalCount: number,
  mentionedCount: number,
  hasCompetitor: boolean,
  cacheHit: boolean,
): ScanConfidence {
  const factors: ConfidenceFactor[] = [];
  let score = 100;

  // Platform coverage.
  const coverageRate = totalCount > 0 ? respondedCount / totalCount : 0;
  if (coverageRate < 0.7) {
    score -= 30;
    factors.push({
      factor: 'Low platform coverage',
      impact: 'negative',
      description: `Only ${respondedCount} of ${totalCount} platforms responded`,
    });
  } else if (coverageRate >= 0.9) {
    factors.push({
      factor: 'High platform coverage',
      impact: 'positive',
      description: `${respondedCount} of ${totalCount} platforms responded`,
    });
  }

  // Competitor data.
  if (!hasCompetitor) {
    score -= 15;
    factors.push({
      factor: 'No competitor detected',
      impact: 'negative',
      description: 'Competitor comparison not available for this scan',
    });
  }

  // Cache hit reduces confidence slightly (data may be older).
  if (cacheHit) {
    score -= 10;
    factors.push({
      factor: 'Cached result',
      impact: 'negative',
      description: 'Results from cache — may not reflect the very latest AI responses',
    });
  }

  // Clamp to 30–95.
  score = Math.max(30, Math.min(95, score));

  const level: ScanConfidence['level'] =
    score >= 85 ? 'very_high' :
    score >= 70 ? 'high' :
    score >= 50 ? 'medium' : 'low';

  return { level, percentage: score, factors };
}
