import { gradeLabel } from '@/lib/projection';

// b89f: the score badge is LABELLED "AI Visibility Score" everywhere
// it appears (the dashboard preview and the public SVG customers
// embed on their own sites), so the number must be the scan's AI
// Visibility Score — overall_score. Both surfaces used to prefer
// trust_signals.overall, so a business with visibility 2 and Trust
// 50 published a badge reading "50/100 AI Visibility Score" — a
// false score under our own verification mark. Trust is a different
// number and never belongs on this badge.
export function badgeScore(scan: { overall_score: number | null }): number {
  return scan.overall_score ?? 0;
}

// The badge's word for the score is the canonical grade from
// lib/projection (the same bands the dashboard and client pages
// use) — not a local Strong/Moderate/Weak scale with no definition.
export function badgeGrade(score: number): string {
  return gradeLabel(score);
}
