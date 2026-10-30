// lib/inboxShare.ts — who may read a saved AI Inbox search (pure).
// Owner always; anyone else only when the owner shared it (is_shared ===
// true). Rows without an owner are not public either.
export function canViewInboxSearch(
  row: { user_id?: unknown; is_shared?: unknown } | null | undefined,
  viewerId: string | null | undefined,
): boolean {
  if (!row) return false;
  const owner = typeof row.user_id === 'string' && row.user_id ? row.user_id : null;
  if (owner && viewerId && owner === viewerId) return true;
  return row.is_shared === true;
}
