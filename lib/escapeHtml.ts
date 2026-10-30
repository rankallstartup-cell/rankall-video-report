// lib/escapeHtml.ts — escape untrusted text for interpolation into HTML
// (element content AND quoted attribute values). Pure; client-safe.
// null/undefined → ''. Non-strings are stringified first.
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

