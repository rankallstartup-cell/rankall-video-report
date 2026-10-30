// lib/fixTypes.ts
// Phase 4.1: ONE canonical Fix read-model. This does NOT replace any existing
// API — existing endpoints keep their shapes. Instead, toRankallFix() adapts the
// existing tool/metadata/scan data into this single model for the UI + agency
// layers. No duplicate metadata, no duplicate mappings.

export type FixType =
  | 'FAQ_SCHEMA'
  | 'LOCALBUSINESS_SCHEMA'
  | 'REVIEW_RESPONSE'
  | 'REDDIT_CONTRIBUTION'
  | 'CONTENT_OPTIMIZER'
  | 'CITATION_FINDER'
  | 'DIRECTORY_SUBMITTER'
  | 'COMPETITOR_ANALYSIS'
  | 'PRESS_OUTREACH'
  | 'VIDEO_SCRIPT'
  | 'KNOWLEDGE_PANEL'
  | 'GBP_OPTIMIZER'
  | 'AI_OPTIMIZED_BIO';

export type FixStatus = 'PREDICTED' | 'APPLIED' | 'VERIFIED' | 'FAILED' | 'IGNORED';

export interface RankallFix {
  id: string;
  scanId: string;
  businessName: string;
  industry: string;
  countryCode: string;
  planType: string;
  fixType: FixType;
  title: string;
  shortDescription: string;
  whatIsWrong: string;
  whyItMatters: string;
  recommendedAction: string;
  generatedContent: string;
  implementationSteps: string[];
  verificationSteps: string[];
  impactLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  estimatedTime: string;
  predictedScoreLift: number;
  confidence: number;
  status: FixStatus;
  isVerified: boolean;
  verifiedOutcomeId?: string;
  evidence: string[];
  businessImpact: string;
  relatedTrustSignals: string[];
  relatedPlatforms: string[];
  createdAt: string;
}

// Tool id (buildTools / fix page) → canonical FixType. Single mapping.
export const TOOL_ID_TO_FIXTYPE: Record<string, FixType> = {
  faq: 'FAQ_SCHEMA',
  schema: 'LOCALBUSINESS_SCHEMA',
  review: 'REVIEW_RESPONSE',
  reddit: 'REDDIT_CONTRIBUTION',
  content: 'CONTENT_OPTIMIZER',
  citations: 'CITATION_FINDER',
  directory: 'DIRECTORY_SUBMITTER',
  competitive: 'COMPETITOR_ANALYSIS',
  outreach: 'PRESS_OUTREACH',
  video: 'VIDEO_SCRIPT',
  knowledge: 'KNOWLEDGE_PANEL',
  gbp: 'GBP_OPTIMIZER',
  bio: 'AI_OPTIMIZED_BIO',
};

export function toFixType(toolId: string): FixType {
  return TOOL_ID_TO_FIXTYPE[toolId] ?? 'CONTENT_OPTIMIZER';
}

function impactLevelFromRange(min: number, max: number): RankallFix['impactLevel'] {
  const mid = (min + max) / 2;
  if (mid >= 18) return 'VERY_HIGH';
  if (mid >= 9) return 'HIGH';
  if (mid >= 5) return 'MEDIUM';
  return 'LOW';
}

function difficultyToEnum(d?: string): RankallFix['difficulty'] {
  const v = (d || '').toLowerCase();
  if (v === 'hard') return 'HARD';
  if (v === 'medium') return 'MEDIUM';
  return 'EASY';
}

// Adapter inputs intentionally mirror what the existing code already has on hand.
export interface ToRankallFixInput {
  toolId: string;
  title: string;
  shortDescription: string;
  generatedContent: string;
  scanId: string;
  businessName: string;
  industry: string;
  countryCode: string;
  planType: string;
  // From lib/fixQuality.getFixMetadata:
  whatThisFixes?: string;
  whyItMatters?: string;
  estimatedImpactRange: { min: number; max: number };
  difficulty?: string;
  estimatedTime?: string;
  howToVerify?: string;
  relatedSignals?: string[];
  // Derived (lib/fixIntelligence):
  predictedScoreLift: number;
  confidence: number;
  evidence: string[];
  businessImpact: string;
  relatedPlatforms?: string[];
  // Lifecycle:
  status: FixStatus;
  isVerified: boolean;
  verifiedOutcomeId?: string;
  createdAt: string;
}

export function toRankallFix(input: ToRankallFixInput): RankallFix {
  const { min, max } = input.estimatedImpactRange;
  return {
    id: `${input.scanId}:${input.toolId}`,
    scanId: input.scanId,
    businessName: input.businessName,
    industry: input.industry,
    countryCode: input.countryCode,
    planType: input.planType,
    fixType: toFixType(input.toolId),
    title: input.title,
    shortDescription: input.shortDescription,
    whatIsWrong: input.whatThisFixes || input.shortDescription,
    whyItMatters: input.whyItMatters || '',
    recommendedAction: `Apply the generated ${input.title} content, then mark it applied so Rankall can verify the improvement.`,
    generatedContent: input.generatedContent,
    implementationSteps: [],
    verificationSteps: input.howToVerify ? [input.howToVerify] : [],
    impactLevel: impactLevelFromRange(min, max),
    difficulty: difficultyToEnum(input.difficulty),
    estimatedTime: input.estimatedTime || '',
    predictedScoreLift: input.predictedScoreLift,
    confidence: input.confidence,
    status: input.status,
    isVerified: input.isVerified,
    verifiedOutcomeId: input.verifiedOutcomeId,
    evidence: input.evidence,
    businessImpact: input.businessImpact,
    relatedTrustSignals: input.relatedSignals ?? [],
    relatedPlatforms: input.relatedPlatforms ?? [],
    createdAt: input.createdAt,
  };
}
