// lib/planAudience.ts — plan resolution for batch jobs (crons) that walk
// auth.admin.listUsers(). Same cascade as every other resolver:
// subscriptions row → app_metadata → free (lib/planConfig
// resolvePlanFromSources). NEVER user_metadata — any user can write it via
// supabase.auth.updateUser() and would self-select into paid-only email
// audiences (and the plan shown in those emails).
import { resolvePlanFromSources, normalizePlan, type PlanType } from './planConfig';

export interface SubRow { user_id: string; plan?: string | null; status?: string | null; trial_end?: string | null }

/** One query for all live subscriptions, keyed by user_id. Fails soft to an
 *  empty map (users then resolve from app_metadata only). */
type SubsQuery = {
  select(cols: string): {
    in(col: string, vals: string[]): PromiseLike<{ data?: unknown; error?: { message?: string } | null }>;
  };
};

export async function loadLiveSubscriptions(
  sb: { from: (table: string) => unknown },
): Promise<Map<string, SubRow>> {
  const map = new Map<string, SubRow>();
  try {
    const { data, error } = await (sb.from('subscriptions') as SubsQuery)
      .select('user_id, plan, status, trial_end')
      .in('status', ['active', 'trialing', 'past_due']);
    if (error) {
      console.error('[planAudience] subscriptions read failed:', error.message ?? error);
      return map;
    }
    for (const row of (data ?? []) as SubRow[]) {
      if (row?.user_id && !map.has(row.user_id)) map.set(row.user_id, row);
    }
  } catch (err) {
    console.error('[planAudience] subscriptions read threw:', err);
  }
  return map;
}

/** Normalized plan for a listUsers() user. user_metadata is never read. */
export function planForAuthUser(
  u: { id: string; app_metadata?: unknown },
  subs: Map<string, SubRow>,
): string {
  const plan: PlanType = resolvePlanFromSources(subs.get(u.id) ?? null, u.app_metadata);
  return normalizePlan(plan);
}
