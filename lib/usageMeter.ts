// b89e: how a usage meter may honestly present a plan limit.
// PLAN_LIMITS uses 999999 as its UNLIMITED sentinel and 0 for "not
// included". Rendering either raw invents a quota: an unlimited
// plan showed "999999/∞ searches remaining", and an excluded plan
// showed "0/0 searches remaining" — both read as measured quotas
// and neither is one. Every meter branches on this model instead.
export type UsageMeterModel =
  | { kind: 'excluded' }
  | { kind: 'unlimited' }
  | { kind: 'counted'; used: number; limit: number; remaining: number };

export function usageMeterModel(used: number, limit: number, remaining: number): UsageMeterModel {
  if (limit <= 0) return { kind: 'excluded' };
  if (limit >= 999999) return { kind: 'unlimited' };
  return { kind: 'counted', used, limit, remaining };
}
