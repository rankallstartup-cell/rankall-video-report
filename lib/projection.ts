// lib/projection.ts
// b02b: ONE projection cap and ONE grade-band table for every surface that
// projects a score forward (simulator engine, dashboard simulator chart, fix
// page "predicted score", report score card). Dependency-free so both
// lib/simulator.ts and lib/fixIntelligence.ts can import it without a cycle.

// 85, not 100 — a perfect 100/100 reads as a sales gimmick; 85 is a strong,
// believable ceiling for what fixes alone can project.
export const PROJECTION_CAP = 85;

// The cap that applies to a given starting score: a business already at or
// above the cap keeps its current score as the ceiling (we never project a
// score DOWN — the old min(cap, current + gains) turned 90 into 85).
export function effectiveCap(currentScore: number): number {
  return Math.max(PROJECTION_CAP, currentScore);
}

// projection = max(current, min(effectiveCap, current + gains)). Gains below
// zero are treated as zero; the result is never below the current score.
export function projectScore(currentScore: number, gainedPoints: number): number {
  const current = Number.isFinite(currentScore) ? currentScore : 0;
  const gains = Number.isFinite(gainedPoints) ? Math.max(0, gainedPoints) : 0;
  return Math.max(current, Math.min(effectiveCap(current), current + gains));
}

// Grade bands, highest first. The top band starts AT the projection cap so
// "Dominant" is reachable by a projection (it was ≥86 while the cap was 85).
export const GRADE_BANDS: ReadonlyArray<{ min: number; label: string }> = [
  { min: PROJECTION_CAP, label: 'Dominant' },
  { min: 71, label: 'Strong' },
  { min: 51, label: 'Visible' },
  { min: 31, label: 'Emerging' },
  { min: 0, label: 'Not Visible' },
];

export function gradeLabel(score: number): string {
  for (const band of GRADE_BANDS) if (score >= band.min) return band.label;
  return 'Not Visible';
}
