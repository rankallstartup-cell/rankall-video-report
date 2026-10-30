// lib/intelligenceGraphGate.ts
// Phase 20: gate that decides whether an entity is clean enough to enter the
// Intelligence Graph. Logs issues + quarantines bad data best-effort. NEVER
// throws or blocks the operational path — all DB writes are try/caught.

import { createClient } from '@supabase/supabase-js';
import { validateCompetitor, validateScore, type DataQualityResult, type DataQualityIssue, type DataQualityStatus } from './dataQuality';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

export async function validateBeforeIntelligenceGraph(input: {
  entityType: 'scan' | 'competitor' | 'verified_outcome';
  entityId?: string;
  data: Record<string, unknown>;
}): Promise<DataQualityResult> {
  const issues: DataQualityIssue[] = [];
  let qualityScore = 100;

  try {
    if (input.entityType === 'competitor') {
      const r = validateCompetitor(
        (input.data.competitor_name as string) || '',
        (input.data.business_name as string) || '',
        (input.data.city as string) || '',
      );
      if (r.status !== 'clean') {
        issues.push(...r.issues);
        qualityScore = Math.min(qualityScore, r.qualityScore);
      }
    }

    if (input.entityType === 'scan' || input.entityType === 'verified_outcome') {
      const r = validateScore(
        input.data.overall_score as number,
        input.data.recommendation_share as number | undefined,
      );
      if (r.status !== 'clean') {
        issues.push(...r.issues);
        qualityScore = Math.min(qualityScore, r.qualityScore);
      }
    }
  } catch {
    // Fail open — a crash in validation must never block the operation.
    return { status: 'clean', qualityScore: 100, issues: [], shouldEnterIntelligenceGraph: true };
  }

  const status: DataQualityStatus =
    qualityScore >= 85 ? 'clean' :
    qualityScore >= 60 ? 'needs_review' :
    qualityScore >= 30 ? 'quarantined' : 'blocked';
  const shouldEnter = status === 'clean';

  // Log issues (best effort — never block on logging failure).
  if (issues.length > 0 && input.entityId) {
    try {
      await supabaseAdmin.from('data_quality_issues').insert(issues.map(issue => ({
        entity_type: input.entityType,
        entity_id: input.entityId,
        issue_type: issue.type,
        severity: issue.severity,
        message: issue.message,
        field: issue.field ?? null,
        current_value: issue.currentValue !== undefined ? JSON.stringify(issue.currentValue) : null,
      })));
    } catch { /* never block */ }
  }

  // Quarantine bad data (best effort).
  if ((status === 'quarantined' || status === 'blocked') && input.entityId) {
    try {
      await supabaseAdmin.from('data_quality_quarantine').insert({
        entity_type: input.entityType,
        entity_id: input.entityId,
        original_data: input.data,
        quality_result: { status, qualityScore, issues },
        reason: issues[0]?.message || 'Quality check failed',
      });
    } catch { /* never block */ }
  }

  return { status, qualityScore, issues, shouldEnterIntelligenceGraph: shouldEnter };
}
