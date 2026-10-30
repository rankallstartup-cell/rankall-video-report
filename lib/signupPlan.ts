// /signup?plan=<key> → the plan card to preselect (b876).
// No param keeps the long-standing default (Local Business). 'free' is a
// real plan and preselects Free, never a paid one. An unknown value selects
// nothing and returns a visible notice instead of falling through to $39.
const PLAN_PARAM: Record<string, string> = {
  business: 'Local Business',
  local_business: 'Local Business',
  local_pro: 'Local Business',
  personal_pro: 'Personal Brand',
  product_pro: 'Product Pro',
  agency: 'Agency',
  free: 'Free',
};

export function signupPlanFromParam(raw: string | null | undefined): { plan: string; notice: string } {
  if (!raw || !raw.trim()) return { plan: 'Local Business', notice: '' };
  const name = PLAN_PARAM[raw.trim().toLowerCase()];
  if (name) return { plan: name, notice: '' };
  return { plan: '', notice: `We don't offer a “${raw.trim()}” plan — pick one below.` };
}
