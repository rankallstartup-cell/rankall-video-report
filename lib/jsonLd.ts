// Serialize a JSON-LD object for a <script type="application/ld+json">
// injected via dangerouslySetInnerHTML (azxf). JSON.stringify does NOT
// escape `<`, so any DB-sourced string containing "</script>" (a blog
// title, a business name) would close the tag early and inject HTML.
// Escaping `<` as < keeps the JSON valid and inert.
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
