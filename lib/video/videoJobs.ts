// Video-job cost display (hackathon jobs dashboard). Pure helper, no I/O.
// PipelineCosts shape (lib/video/pipeline.ts): projectedTotalUsd is the
// best available total estimate (null when HeyGen spend is unmeasurable);
// heygenSpentUsd is the HeyGen wallet delta (positive = spent, null when
// unmeasurable). Never invent a number: when neither is measurable the
// job honestly shows "not measured".
import type { PipelineCosts } from './pipeline';

export function formatJobCost(costs: PipelineCosts | undefined): string {
  if (!costs) return 'not measured';
  if (costs.projectedTotalUsd != null) return `$${costs.projectedTotalUsd.toFixed(2)}`;
  if (costs.heygenSpentUsd != null) return `$${costs.heygenSpentUsd.toFixed(2)} spent`;
  return 'not measured';
}
